import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {once} from 'node:events';
import os from 'node:os';import path from 'node:path';
import {buildSubmission,renderFormPage,visibleFields,formFields} from '../lib/forms.mjs';

const sheet=()=>({id:'s',name:'Field requests',columns:[{id:'req',name:'Request',type:'text',options:[],formula:''},{id:'type',name:'Type',type:'select',options:['Damage','Delivery'],formula:''},{id:'sev',name:'Severity',type:'select',options:['Low','High'],formula:''},{id:'due',name:'Needed by',type:'date',options:[],formula:''},{id:'calc',name:'Calc',type:'text',options:[],formula:'=1'}],rows:[],
  forms:[{id:'form-0001',name:'Report an issue',columnIds:['req','type','sev','due','calc'],requiredIds:['req','sev'],conditions:{sev:{columnId:'type',op:'equals',value:'Damage'}},allowFiles:true}]});
const st=()=>({sheets:[sheet()]});
const png='data:image/png;base64,'+Buffer.from('fakepng').toString('base64');

test('conditional questions: hidden answers are ignored and not required', () => {
  const fields=formFields(sheet(),sheet().forms[0]);
  assert.deepEqual(fields.map(f=>f.id),['req','type','sev','due'],'formula columns are never asked');
  assert.deepEqual(visibleFields(fields,{type:'Delivery'}).map(f=>f.id),['req','type','due']);
  const r=buildSubmission(st(),'form-0001',{answers:{req:'Gate code',type:'Delivery',sev:'High',due:'2026-11-20'},submitter:'Sam'});
  const row=r.state.sheets[0].rows[0];assert.equal(row.cells.sev,'','hidden question not saved');assert.equal(row.cells.due,'2026-11-20');assert.match(row.comments[0].text,/Sam/);
  assert.equal(r.actor,'Sam (form)');
});

test('required, type checks and files are enforced on the server', () => {
  assert.throws(()=>buildSubmission(st(),'form-0001',{answers:{type:'Damage'}}),/Request is required.*Severity is required/);
  assert.throws(()=>buildSubmission(st(),'form-0001',{answers:{req:'x',type:'Nope'}}),/Type:/);
  assert.throws(()=>buildSubmission(st(),'form-0001',{answers:{req:'x',due:'not a date'}}),/Needed by:/);
  assert.throws(()=>buildSubmission(st(),'form-0001',{answers:{req:'x'},files:Array(6).fill({name:'a.png',data:png})}),/up to 5/);
  assert.throws(()=>buildSubmission(st(),'form-0001',{answers:{req:'x'},files:[{name:'x',data:'javascript:alert(1)'}]}),/could not read/);
  const ok=buildSubmission(st(),'form-0001',{answers:{req:'Cracked window',type:'Damage',sev:'High'},files:[{name:'../photo.png',data:png}]});
  const a=ok.state.sheets[0].rows[0].attachments[0];assert.equal(a.name,'..-photo.png');assert.equal(a.type,'image/png');
  const noFiles=st();noFiles.sheets[0].forms[0].allowFiles=false;
  assert.throws(()=>buildSubmission(noFiles,'form-0001',{answers:{req:'x'},files:[{name:'a.png',data:png}]}),/does not accept files/);
  assert.throws(()=>buildSubmission(st(),'nope-0000',{answers:{}}),/no longer exists/);
});

test('form page escapes text and embeds config safely', () => {
  const s=sheet();s.forms[0].name='<script>x</script>';s.forms[0].description='</script><b>';
  const html=renderFormPage(s,s.forms[0]);
  assert.ok(!html.includes('<script>x'));assert.ok(html.includes('&lt;script&gt;x'));
  assert.ok(!/<\/script><b>/.test(html.split('id="form-config">')[1].split('<script src')[0]));
});

const lan=Object.values(os.networkInterfaces()).flat().find(a=>a&&a.family==='IPv4'&&!a.internal)?.address;
test('public forms work from the office network without the access code; private ones do not', {skip:!lan&&'no network interface'}, async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'forms-')),port=String(43000+Math.floor(Math.random()*900));
  const p=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:port,DB_PATH:path.join(dir,'x.sqlite'),SHEETS_HOST:'0.0.0.0',SHEETS_ACCESS_CODE:'office-2026',SHEETS_AUTO_BACKUP:'0'},stdio:['ignore','pipe','pipe']});
  try{
    await new Promise((ok,bad)=>{p.stdout.on('data',b=>{if(String(b).includes('ready'))ok();});p.on('exit',c=>bad(Error('exit '+c)));});
    const local=`http://127.0.0.1:${port}`,remote=`http://${lan}:${port}`;
    let cur=await (await fetch(local+'/api/state')).json();const s=sheet();s.workspaceId=cur.state.workspaces[0].id;s.automations=[];s.forms[0].public=true;s.forms.push({...s.forms[0],id:'form-0002',name:'Private',public:false});
    const next=structuredClone(cur.state);next.sheets.push(s);
    cur=await (await fetch(local+'/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:next,revision:cur.revision,label:'add'})})).json();
    const page=await fetch(remote+'/f/form-0001');assert.equal(page.status,200);assert.match(await page.text(),/Report an issue/);
    assert.equal((await fetch(remote+'/form.js')).status,200);
    assert.equal((await fetch(remote+'/f/form-0002',{redirect:'manual'})).status,303,'private form needs the code');
    assert.equal((await fetch(remote+'/api/state')).status,401,'the sheet itself stays private');
    const sub=await fetch(remote+'/api/forms/form-0001/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answers:{req:'From the field',type:'Damage',sev:'Low'},submitter:'Jo',files:[{name:'p.png',data:png}]})});
    assert.equal(sub.status,200);
    assert.equal((await fetch(remote+'/api/forms/form-0002/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
    const after=await (await fetch(local+'/api/state')).json();const row=after.state.sheets.find(x=>x.id==='s').rows[0];
    assert.equal(row.cells.req,'From the field');assert.equal(row.attachments.length,1);assert.equal(row.createdBy,'Jo (form)');
  }finally{p.kill('SIGTERM');await once(p,'exit').catch(()=>{});await rm(dir,{recursive:true,force:true});}
});
