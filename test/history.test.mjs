import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
test('persistent multi-step history: replay, branches, ownership, revisions and restart',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'sheets-history-')),port=String(36000+Math.floor(Math.random()*4000));let proc;
 const start=async()=>{proc=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:port,DB_PATH:path.join(dir,'db.sqlite')},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{proc.stdout.on('data',b=>{if(b.toString().includes('sheets is ready'))resolve();});proc.on('exit',c=>reject(Error('Server exited '+c)));});};
 const stop=async()=>{proc.kill('SIGTERM');await once(proc,'exit');};
 const get=()=>fetch(`http://127.0.0.1:${port}/api/state`).then(r=>r.json());
 const post=async(route,body,client='test-a')=>{const r=await fetch(`http://127.0.0.1:${port}/api/${route}`,{method:'POST',headers:{'Content-Type':'application/json','X-Sheets-Client':client},body:JSON.stringify(body)});return {status:r.status,...await r.json()};};
 try{await start();let cur=await get();const name=cur.state.sheets[0].name;
 for(const v of ['A','B','C']){cur.state.sheets[0].name=v;cur=await post('state',cur);assert.equal(cur.status,200);}
 const stale=cur.revision;
 for(const v of ['B','A',name]){cur=await post('undo',{revision:cur.revision});assert.equal(cur.status,200);assert.equal(cur.state.sheets[0].name,v);}
 await stop();await start();cur=await get();
 assert.equal((await post('redo',{revision:cur.revision},'test-b')).status,409);
 assert.equal((await post('redo',{revision:stale})).status,409);
 for(const v of ['A','B','C']){cur=await post('redo',{revision:cur.revision});assert.equal(cur.status,200);assert.equal(cur.state.sheets[0].name,v);}
 assert.equal((await post('redo',{revision:cur.revision})).status,400);
 cur=await post('undo',{revision:cur.revision});cur.state.sheets[0].name='Branch';cur=await post('state',cur);
 assert.equal((await post('redo',{revision:cur.revision})).status,400);
 cur=await post('undo',{revision:cur.revision});assert.equal(cur.state.sheets[0].name,'B');
 }finally{if(proc?.exitCode===null)await stop();await rm(dir,{recursive:true,force:true});}
});
