import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {once} from 'node:events';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import net from 'node:net';
test('report PDF endpoint uses current formulas, rejects stale snapshots and never writes the project',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'sheets-pdf-api-')),probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),DB_PATH:path.join(dir,'test.sqlite')},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{let error='';child.stderr.on('data',b=>error+=b);child.stdout.on('data',b=>{if(String(b).includes('ready'))resolve();});child.once('exit',code=>reject(Error(code+' '+error)));});
 try{
  const base='http://127.0.0.1:'+port,before=await fetch(base+'/api/state').then(r=>r.json()),sheet=before.state.sheets[0],report={name:'Résumé — Project review',sheetIds:[sheet.id],columns:['$task','Budget','Remaining'],filters:[{column:'Budget',operator:'gt',value:0}],groupBy:'Status',sortBy:'Budget',leafOnly:true};
  const post=(body,headers={})=>fetch(base+'/api/reports/pdf',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  let response=await post({revision:before.revision,report,options:{paper:'A4',orientation:'portrait'}});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.match(response.headers.get('content-disposition'),/filename\*=UTF-8''R%C3%A9sum%C3%A9/);const pdf=Buffer.from(await response.arrayBuffer());assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.equal(response.headers.get('content-length'),String(pdf.length));
  assert.deepEqual(await fetch(base+'/api/state').then(r=>r.json()),before);
  response=await post({revision:before.revision-1,report});assert.equal(response.status,409);
  response=await post({revision:before.revision,report:{...report,columns:['missing']}});assert.equal(response.status,400);
  response=await post({revision:before.revision,report},{Origin:'https://external.example'});assert.equal(response.status,403);
 }finally{child.kill('SIGTERM');await once(child,'exit');await rm(dir,{recursive:true,force:true});}
});
