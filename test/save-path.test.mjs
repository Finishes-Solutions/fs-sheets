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
