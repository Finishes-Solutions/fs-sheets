import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import os from 'node:os';import path from 'node:path';
import {createVersionStore,compareStates,restoreSheet} from '../lib/versions.mjs';

const ws=()=>({schemaVersion:1,workspaces:[{id:'w',name:'W'}],folders:[],reports:[],activity:[],sheets:[
  {id:'s1',name:'Budget',workspaceId:'w',columns:[{id:'c1',name:'Item'},{id:'c2',name:'Cost'}],rows:[{id:'r1',cells:{c1:'Slab',c2:100}},{id:'r2',cells:{c1:'Frame',c2:50}}]},
  {id:'s2',name:'Schedule',workspaceId:'w',columns:[{id:'d1',name:'Task'}],rows:[]}]});

test('versions: create, list, load, and prune keeps named versions and thins automatic ones', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'ver-'));
  try{
    const store=createVersionStore(dir),body=JSON.stringify(ws());
    const named=await store.create(body,{name:'Before bid',revision:3,by:'Pat'});
    assert.deepEqual(named.sheets.map(s=>s.rows),[2,0]);
    assert.deepEqual(await store.load(named.id),ws());
    await assert.rejects(store.create(body,{name:'  '}),/Name the version/);
    const day=86_400_000,base=Date.parse('2026-11-03T03:00:00Z');
    for(let i=0;i<40;i++)await store.create(body,{kind:'auto',revision:i,now:new Date(base-i*day)});
    await store.create(body,{kind:'auto',revision:99,now:new Date(base-2*3600_000)});
    await store.prune(base);
    const left=await store.list();
    assert.ok(left.some(v=>v.id===named.id),'named kept');
    const autos=left.filter(v=>v.kind==='auto');
    assert.equal(new Set(autos.map(v=>v.at.slice(0,10))).size,autos.length,'at most one per day');
    assert.ok(autos.length>=14&&autos.length<=22,'14 daily + weekly: '+autos.length);
    await assert.rejects(store.load('../../etc/passwd'),/not found/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('compare reports added, deleted and changed cells; restore as copy gets new ids', () => {
  const then=ws(),now=ws();now.sheets[0].rows[0].cells.c2=120;now.sheets[0].rows.push({id:'r3',cells:{c1:'Roof',c2:9}});now.sheets[0].rows.splice(1,1);
  const [b]=compareStates(then,now,{sheetId:'s1'});
  assert.equal(b.status,'changed');assert.equal(b.added,1);assert.equal(b.removed,1);assert.equal(b.changedCells,1);
  assert.deepEqual(b.samples.find(x=>x.kind==='cell'),{kind:'cell',row:1,title:'Slab',column:'Cost',then:'100',now:'120'});
  let n=0;const {state,sheetId}=restoreSheet(now,then,'s1',{mode:'copy',makeId:()=>'00000000-0000-4000-8000-'+String(++n).padStart(12,'0'),dateLabel:'Nov 2'});
  const copy=state.sheets.find(s=>s.id===sheetId);
  assert.equal(copy.name,'Budget (restored Nov 2)');assert.equal(state.sheets.indexOf(copy),1,'placed after the original');
  assert.notEqual(copy.rows[0].id,'r1');assert.equal(copy.rows[1].cells[copy.columns[1].id],50);
  assert.equal(state.sheets[0].rows[0].cells.c2,120,'current sheet untouched');
  const rep=restoreSheet(now,then,'s1',{mode:'replace'});
  assert.deepEqual(rep.state.sheets[0].rows,then.sheets[0].rows);assert.equal(rep.state.sheets[1],rep.state.sheets[1]);
  assert.deepEqual(rep.state.sheets[1],now.sheets[1],'other sheets untouched');
});

test('API: save a version, change, compare, restore (replace makes a safety version), undo', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'ver-api-')),port=String(49000+Math.floor(Math.random()*900));
  const p=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:port,DB_PATH:path.join(dir,'x.sqlite'),SHEETS_AUTO_BACKUP:'0'},stdio:['ignore','pipe','pipe']});
  try{
    await new Promise((ok,bad)=>{p.stdout.on('data',b=>{if(String(b).includes('ready'))ok();});p.on('exit',c=>bad(Error('exit '+c)));});
    const api=async(route,body)=>{const r=await fetch(`http://127.0.0.1:${port}/api/${route}`,body?{method:'POST',headers:{'Content-Type':'application/json','X-Sheets-Client':'t1'},body:JSON.stringify(body)}:{});return {status:r.status,...await r.json()};};
    let st=await api('state');const sheet=st.state.sheets[0],col=sheet.columns[0].id,row=sheet.rows[0];
    const v=await api('versions',{name:'Clean start'});assert.equal(v.status,200);
    const next=structuredClone(st.state);next.sheets[0].rows[0].cells[col]='Changed after version';
    st=await api('state',{state:next,revision:st.revision,label:'edit'});assert.equal(st.status,200);
    const cmp=await api('versions/compare',{id:v.version.id,sheetId:sheet.id});assert.equal(cmp.sheets[0].changedCells,1);
    const copy=await api('versions/restore',{id:v.version.id,sheetId:sheet.id,mode:'copy',revision:st.revision});assert.equal(copy.status,200);
    assert.equal(copy.state.sheets.length,st.state.sheets.length+1);
    const rep=await api('versions/restore',{id:v.version.id,sheetId:sheet.id,mode:'replace',revision:copy.revision});assert.equal(rep.status,200);
    assert.equal(rep.state.sheets.find(s=>s.id===sheet.id).rows[0].cells[col],row.cells[col]);
    const list=(await api('versions')).versions;assert.ok(list.some(x=>x.kind==='before-restore'));
    assert.equal((await api('versions/restore',{id:v.version.id,sheetId:sheet.id,mode:'replace',revision:1})).status,409,'stale revision refused');
    const undo=await api('undo',{revision:rep.revision});assert.equal(undo.status,200);
    assert.equal(undo.state.sheets.find(s=>s.id===sheet.id).rows[0].cells[col],'Changed after version','restore is undoable');
  }finally{p.kill('SIGTERM');await once(p,'exit').catch(()=>{});await rm(dir,{recursive:true,force:true});}
});
