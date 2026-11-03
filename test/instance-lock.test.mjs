import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {once} from 'node:events';
import os from 'node:os';import path from 'node:path';
import {lockConflict,acquireLock,readLock} from '../lib/instance-lock.mjs';

const now=Date.parse('2026-11-03T12:00:00Z');
test('a fresh lock from another computer blocks; a stale one does not', () => {
  assert.match(lockConflict({host:'laptop',pid:1,heartbeatAt:'2026-11-03T11:59:30Z'},{host:'desktop',now}),/already running on “laptop”/);
  assert.equal(lockConflict({host:'laptop',pid:1,heartbeatAt:'2026-11-03T11:50:00Z'},{host:'desktop',now}),null);
  assert.equal(lockConflict(null,{host:'desktop',now}),null);
  assert.equal(lockConflict({host:'desktop',pid:process.pid,heartbeatAt:'2026-11-03T11:59:59Z'},{host:'desktop',now}),null,'own lock');
  assert.equal(lockConflict({host:'desktop',pid:999999,heartbeatAt:'2026-11-03T11:59:59Z'},{host:'desktop',now}),null,'dead process on this computer');
});

test('acquire writes the lock, release removes it, and a takeover is detected', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'lock-')),file=path.join(dir,'db.sqlite.lock');
  try{
    await writeFile(file,JSON.stringify({host:'other-mac',pid:1,heartbeatAt:new Date().toISOString()}));
    assert.throws(()=>acquireLock(file,{port:1}),e=>e.code==='SHEETS_LOCKED');
    const forced=acquireLock(file,{port:1,force:true,log:{warn(){}}});
    assert.equal(readLock(file).pid,process.pid);
    forced.release();await assert.rejects(readFile(file),/ENOENT/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('a second server on the same database refuses to start', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'lock-e2e-')),db=path.join(dir,'x.sqlite');
  const start=port=>spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),DB_PATH:db},stdio:['ignore','pipe','pipe']});
  const a=start(46900+Math.floor(Math.random()*500));
  try{
    await new Promise((ok,bad)=>{a.stdout.on('data',b=>{if(String(b).includes('ready'))ok();});a.on('exit',c=>bad(Error('exit '+c)));});
    const b=start(47500+Math.floor(Math.random()*500));let err='';b.stderr.on('data',x=>err+=x);
    const [code]=await once(b,'exit');
    assert.equal(code,1);assert.match(err,/already running on this computer/);
  }finally{a.kill('SIGTERM');await once(a,'exit').catch(()=>{});await rm(dir,{recursive:true,force:true});}
});
