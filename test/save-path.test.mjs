import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';

// The save path reuses the serialized workspace for history and responses instead of re-reading it.
// These checks pin the observable contract: same data, same history, same safeguards.
test('optimized saves: responses match fresh reads; column insert persists with undo/redo across restart; stale saves rejected',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'sheets-save-')),port=String(40000+Math.floor(Math.random()*4000));let proc;
 const start=async()=>{proc=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:port,DB_PATH:path.join(dir,'db.sqlite')},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{proc.stdout.on('data',b=>{if(b.toString().includes('sheets is ready'))resolve();});proc.on('exit',c=>reject(Error('Server exited '+c)));});};
 const stop=async()=>{proc.kill('SIGTERM');await once(proc,'exit');};
 const get=()=>fetch(`http://127.0.0.1:${port}/api/state`).then(r=>r.json());
 const post=async(route,body)=>{const r=await fetch(`http://127.0.0.1:${port}/api/${route}`,{method:'POST',headers:{'Content-Type':'application/json','X-Sheets-Client':'save-test'},body:JSON.stringify(body)});const text=await r.text();return {status:r.status,...JSON.parse(text)};};
 try{
  await start();let cur=await get();const sheet=cur.state.sheets[0],before=sheet.columns.map(c=>c.id);
  const column={id:'col-inserted',name:'Contingency',type:'currency',options:[],formula:'',width:160,hidden:false,currency:'USD'};
  cur.state.sheets[0].columns.splice(1,0,column);
  const saved=await post('state',{state:cur.state,revision:cur.revision,label:'Added column Contingency'});
  assert.equal(saved.status,200);assert.equal(saved.revision,cur.revision+1);
  const fresh=await get();
  assert.deepEqual(saved.state,fresh.state,'save response is exactly what a fresh read returns');
  assert.equal(saved.body,undefined,'internal serialized text is not leaked as a field');
  assert.equal(fresh.state.sheets[0].columns[1].id,'col-inserted');
  assert.equal((await post('state',{state:cur.state,revision:cur.revision,label:'stale'})).status,409,'stale revision still rejected');
  await stop();await start();
  cur=await get();assert.equal(cur.state.sheets[0].columns[1].name,'Contingency','column persists across restart');
  cur=await post('undo',{revision:cur.revision});assert.equal(cur.status,200);
  assert.deepEqual(cur.state.sheets[0].columns.map(c=>c.id),before,'undo removes the inserted column');
  assert.deepEqual((await get()).state,cur.state,'undo response matches a fresh read');
  cur=await post('redo',{revision:cur.revision});assert.equal(cur.status,200);
  assert.equal(cur.state.sheets[0].columns[1].id,'col-inserted','redo restores it in the same position');
  assert.deepEqual((await get()).state,cur.state);
 }finally{if(proc?.exitCode===null)await stop();await rm(dir,{recursive:true,force:true});}
});

test('patch saves: small responses, stale-tab merges, conflicts, patch-based undo/redo and legacy snapshots',async()=>{
 const {diffState,applyPatch}=await import('../lib/state-patch.mjs');
 const {DatabaseSync}=await import('node:sqlite');
 const dir=await mkdtemp(path.join(os.tmpdir(),'sheets-patch-')),port=String(44000+Math.floor(Math.random()*4000)),dbFile=path.join(dir,'db.sqlite');let proc;
 const start=async()=>{proc=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:port,DB_PATH:dbFile},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{proc.stdout.on('data',b=>{if(b.toString().includes('sheets is ready'))resolve();});proc.on('exit',c=>reject(Error('Server exited '+c)));});};
 const stop=async()=>{proc.kill('SIGTERM');await once(proc,'exit');};
 const get=()=>fetch(`http://127.0.0.1:${port}/api/state`).then(r=>r.json());
 const post=async(route,body,client='tab-a')=>{const r=await fetch(`http://127.0.0.1:${port}/api/${route}`,{method:'POST',headers:{'Content-Type':'application/json','X-Sheets-Client':client},body:JSON.stringify(body)});const text=await r.text();return {status:r.status,bytes:text.length,...JSON.parse(text)};};
 const clone=v=>JSON.parse(JSON.stringify(v));
 try{
  await start();const base=await get();const sh=base.state.sheets[0],c0=sh.columns[0].id,c1=sh.columns[1].id;
  // A legacy full-snapshot history row (as written by v0.6) must still undo correctly.
  // fast path: tab A edits a cell
  let a=clone(base.state);a.sheets[0].rows[0].cells[c0]='A edit';
  let r=await post('patch',{revision:base.revision,label:'A edit',patch:diffState(base.state,a)});
  assert.equal(r.status,200);assert.ok(r.patch&&!r.state,'fast path answers with a patch');assert.ok(r.bytes<20000,'response is small: '+r.bytes);
  const confirmedA=applyPatch(clone(base.state),r.patch);
  let fresh=await get();assert.deepEqual(confirmedA,fresh.state,'client applying the response patch matches the server exactly');
  // stale tab B (still on base revision) edits another cell of another row -> merged
  const b=clone(base.state);b.sheets[0].rows[1].cells[c1]='B edit';
  r=await post('patch',{revision:base.revision,label:'B edit',patch:diffState(base.state,b)},'tab-b');
  assert.equal(r.status,200);assert.equal(r.merged,true);
  assert.equal(r.state.sheets[0].rows[0].cells[c0],'A edit');assert.equal(r.state.sheets[0].rows[1].cells[c1],'B edit');
  // stale tab C edits the same cell A edited -> conflict, nothing written
  const c=clone(base.state);c.sheets[0].rows[0].cells[c0]='C edit';const before=(await get()).revision;
  r=await post('patch',{revision:base.revision,label:'C edit',patch:diffState(base.state,c)},'tab-c');
  assert.equal(r.status,409);assert.match(r.error,/Someone else changed row 1/);assert.equal((await get()).revision,before);
  // malformed and future-revision patches are refused
  assert.equal((await post('patch',{revision:before,label:'x',patch:{sheets:'nope'}})).status,400);
  assert.equal((await post('patch',{revision:before+5,label:'x',patch:{}})).status,409);
  const legacy=clone((await get()).state);legacy.sheets[0].name='Legacy name';
  // history rows are reverse patches, not 30 MB snapshots
  await stop();
  {const db=new DatabaseSync(dbFile);const rows=db.prepare('SELECT kind,length(body) n FROM history ORDER BY id').all();assert.deepEqual(rows.map(x=>x.kind),['patch','patch']);assert.ok(rows.every(x=>x.n<5000));
   db.prepare("INSERT INTO history(body,created_at,client_id,kind) VALUES (?,?,?,'state')").run(JSON.stringify(legacy),new Date().toISOString(),'tab-a');db.close();}
  await start();
  // undo the legacy snapshot (top of stack), then redo it via the reverse patch written on undo
  let cur=await get();r=await post('undo',{revision:cur.revision});assert.equal(r.status,200);assert.equal(r.state.sheets[0].name,'Legacy name');
  r=await post('redo',{revision:r.revision,respondWithPatch:true});assert.equal(r.status,200);assert.ok(r.patch&&!r.state,'history answers with a patch when asked');
  cur=await get();assert.equal(cur.state.sheets[0].name,base.state.sheets[0].name,'redo re-applied the change on top of the legacy snapshot');
  // Stack is now [A edit (tab-a), B merge (tab-b), legacy redo (tab-a)]. Undo the redo first.
  r=await post('undo',{revision:cur.revision},'tab-a');assert.equal(r.status,200);assert.equal(r.state.sheets[0].name,'Legacy name');
  assert.equal((await post('undo',{revision:r.revision},'tab-a')).status,409,'tab B owns the next change');
  r=await post('undo',{revision:r.revision},'tab-b');assert.equal(r.status,200);
  assert.equal(r.state.sheets[0].rows[1].cells[c1]??'',base.state.sheets[0].rows[1].cells[c1]??'','tab B edit undone');assert.equal(r.state.sheets[0].rows[0].cells[c0],'A edit','tab A edit kept');
  r=await post('undo',{revision:r.revision},'tab-a');assert.equal(r.status,200);assert.equal(r.state.sheets[0].rows[0].cells[c0]??'',base.state.sheets[0].rows[0].cells[c0]??'','tab A edit undone');
  r=await post('redo',{revision:r.revision},'tab-a');assert.equal(r.status,200);assert.equal(r.state.sheets[0].rows[0].cells[c0],'A edit');
  assert.deepEqual((await get()).state,r.state);
 }finally{if(proc?.exitCode===null)await stop();await rm(dir,{recursive:true,force:true});}
});
