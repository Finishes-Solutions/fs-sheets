import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {once} from 'node:events';
import os from 'node:os';import path from 'node:path';
import {startupProblem,hasAccess,accessToken,COOKIE} from '../lib/access.mjs';

const req=(addr,cookie)=>({socket:{remoteAddress:addr},headers:{cookie}});
test('sharing beyond this computer requires an access code; this computer never needs one', () => {
  assert.equal(startupProblem('127.0.0.1',''),null);
  assert.match(startupProblem('0.0.0.0',''),/SHEETS_ACCESS_CODE/);
  assert.match(startupProblem('0.0.0.0','abc'),/at least 6/);
  assert.equal(startupProblem('0.0.0.0','office-2026'),null);
  assert.equal(hasAccess(req('127.0.0.1'),'office-2026'),true);
  assert.equal(hasAccess(req('192.168.1.20'),'office-2026'),false);
  assert.equal(hasAccess(req('192.168.1.20',COOKIE+'=wrong'),'office-2026'),false);
  assert.equal(hasAccess(req('192.168.1.20',COOKIE+'='+accessToken('office-2026')),'office-2026'),true);
  assert.equal(hasAccess(req('192.168.1.20',COOKIE+'='+accessToken('office-2026')),'changed-code'),false,'changing the code signs everyone out');
});

const lan=Object.values(os.networkInterfaces()).flat().find(a=>a&&a.family==='IPv4'&&!a.internal)?.address;
test('office-network server gates other computers behind the code', {skip:!lan&&'no network interface'}, async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'access-')),port=48000+Math.floor(Math.random()*1000);
  const p=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),DB_PATH:path.join(dir,'x.sqlite'),SHEETS_HOST:'0.0.0.0',SHEETS_ACCESS_CODE:'office-2026'},stdio:['ignore','pipe','pipe']});
  try{
    await new Promise((ok,bad)=>{p.stdout.on('data',b=>{if(String(b).includes('ready'))ok();});p.on('exit',c=>bad(Error('exit '+c)));});
    const base=`http://${lan}:${port}`;
    assert.equal((await fetch(base+'/api/state')).status,401);
    const page=await fetch(base+'/',{redirect:'manual'});assert.equal(page.status,303);assert.equal(page.headers.get('location'),'/access');
    assert.equal((await fetch(base+'/access',{method:'POST',body:'code=nope',headers:{'Content-Type':'application/x-www-form-urlencoded'}})).status,401);
    const ok=await fetch(base+'/access',{method:'POST',body:'code=office-2026',headers:{'Content-Type':'application/x-www-form-urlencoded'},redirect:'manual'});
    assert.equal(ok.status,303);const cookie=ok.headers.get('set-cookie').split(';')[0];assert.match(ok.headers.get('set-cookie'),/HttpOnly/);
    assert.equal((await fetch(base+'/api/state',{headers:{cookie}})).status,200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/state`)).status,200,'this computer needs no code');
  }finally{p.kill('SIGTERM');await once(p,'exit').catch(()=>{});await rm(dir,{recursive:true,force:true});}
});
