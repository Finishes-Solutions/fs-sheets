// Regression tests for issues found in the v0.11 review.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';import path from 'node:path';
import {renumberPredecessors,autoSchedule} from '../lib/scheduling.mjs';
import {analyzeSchedule} from '../lib/critical-path.mjs';
import {runWorkflows} from '../lib/workflows.mjs';
import {recordApprovals} from '../lib/approvals.mjs';
import {applyImport} from '../lib/folder-import.mjs';
import {conditionMet} from '../lib/forms.mjs';

const cols=[{id:'n',name:'Task',type:'text',options:[],formula:''},{id:'s',name:'Start',type:'date',options:[],formula:''},{id:'f',name:'Finish',type:'date',options:[],formula:''},{id:'p',name:'Pred',type:'text',options:[],formula:''}];
const row=(id,s,f,p='')=>({id,cells:{n:id,s,f,p}});

test('predecessor row numbers follow their rows when rows are inserted, moved or deleted', () => {
  const prev={id:'x',rows:[row('Demo','2026-11-02','2026-11-06'),row('Frame','2026-11-09','2026-11-13','1'),row('Paint','2026-11-16','2026-11-20','1, 2FS+2')]};
  const inserted={...prev,rows:[row('Permit','2026-12-01','2026-12-31'),...prev.rows]};
  const out=renumberPredecessors(prev,inserted,'p');
  assert.deepEqual(out.rows.map(r=>r.cells.p),['','','2','2, 3FS+2']);
  assert.equal(inserted.rows[2].cells.p,'1','the input is not modified');
  const deleted={...prev,rows:[prev.rows[1],prev.rows[2]]};
  assert.deepEqual(renumberPredecessors(prev,deleted,'p').rows.map(r=>r.cells.p),['','1FS+2'],'references to a deleted row are dropped');
  const typed={...prev,rows:[row('Permit','2026-12-01','2026-12-31'),prev.rows[0],{...prev.rows[1],cells:{...prev.rows[1].cells,p:'2'}},prev.rows[2]]};
  assert.equal(renumberPredecessors(prev,typed,'p').rows[2].cells.p,'2','text typed in the same save is kept as typed');
  const same={...prev,rows:prev.rows.slice()};assert.equal(renumberPredecessors(prev,same,'p'),same,'same order: nothing to do');
});

test('auto-schedule keeps dates when a row is inserted above a dependent task', () => {
  const cfg={startColumnId:'s',endColumnId:'f',dependencyColumnId:'p',auto:true,weekend:'0000011'};
  const sheet={id:'x',name:'X',columns:cols,scheduleConfig:cfg,rows:[row('Demo','2026-11-02','2026-11-06'),row('Frame','2026-11-09','2026-11-13','1')]};
  const before={sheets:[sheet]},after={sheets:[{...sheet,rows:[row('Permit','2026-12-01','2026-12-31'),...sheet.rows]}]};
  autoSchedule(before,after);
  const frame=after.sheets[0].rows.find(r=>r.id==='Frame');
  assert.equal(frame.cells.p,'2');assert.equal(frame.cells.s,'2026-11-09');
});

test('critical path: the task that sets the finish date is critical even with only SS successors', () => {
  const cfg={startColumnId:'s',endColumnId:'f',dependencyColumnId:'p',weekend:'0000011'};
  const sheet={id:'x',columns:cols,rows:[row('A','2026-11-02','2026-11-27'),row('B','2026-11-02','2026-11-04','1SS')]};
  const a=analyzeSchedule(sheet,cfg);
  assert.equal(a.tasks.get('A').critical,true);assert.equal(a.tasks.get('A').float,0);
  assert.equal(a.tasks.get('B').float,17);
});

test('date workflows never write into rows shared with the previous state', () => {
  const rule={id:'w',name:'Overdue',trigger:'date',columnId:'d',actions:[{type:'set',columnId:'st',value:'Overdue'}]};
  const shared={id:'r1',cells:{d:'2020-01-01',st:'Open'}},edited={id:'r2',cells:{d:'',st:'Open'}};
  const prev={id:'s',name:'S',columns:[{id:'d',name:'Due',type:'date'},{id:'st',name:'Status',type:'text'}],automations:[rule],rows:[shared,{id:'r2',cells:{d:'',st:''}}]};
  const before={sheets:[prev],activity:[]},next={...prev,rows:[shared,edited],automations:structuredClone(prev.automations)},after={sheets:[next],activity:[]};
  runWorkflows(before,after,{now:'2026-11-03T00:00:00Z'});
  assert.equal(shared.cells.st,'Open','the cached row is untouched');
  assert.equal(after.sheets[0].rows[0].cells.st,'Overdue');assert.notEqual(after.sheets[0].rows[0],shared);
});

test('approvals copy the row before adding to its history', () => {
  const shared={id:'r1',cells:{}},prevSheet={id:'s',rows:[shared,{id:'r2',cells:{a:1}}]};
  const before={sheets:[prevSheet],requests:[]};
  const after={sheets:[{...prevSheet,rows:[shared,{id:'r2',cells:{a:2}}]}],requests:[{id:'q',type:'approval',sheetId:'s',rowId:'r1',assignees:['Lee'],status:'Open',by:'Pat',responses:[]}]};
  assert.equal(recordApprovals(before,after,'Pat'),1);
  assert.equal(shared.cellHistory,undefined);assert.equal(after.sheets[0].rows[0].cellHistory.length,1);
});

test('folder import (match on a column) skips rows with no key instead of adding them again each time', () => {
  const sheet={id:'s',columns:[{id:'k',name:'Code',type:'text'},{id:'v',name:'Qty',type:'number'}],rows:[]};
  const r=applyImport(sheet,[['Code','Qty'],['A',1],['',2]],{keyColumnId:'k',mode:'upsert',makeId:(()=>{let i=0;return ()=>'id'+i++;})()});
  assert.equal(r.added,1);assert.match(r.errors[0],/no Code value/);
});

test('form conditions on a checkbox accept Yes/No', () => {
  const c={columnId:'d',op:'equals',value:'Yes'};
  assert.equal(conditionMet(c,{d:true}),true);assert.equal(conditionMet(c,{d:false}),false);
  assert.equal(conditionMet({...c,value:'No'},{d:false}),true);assert.equal(conditionMet({...c,value:'red'},{d:'Red'}),true);
});

test('server: answers only to this computer\'s own names; limits wrong access codes', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-')),port=String(46000+Math.floor(Math.random()*900));
  const p=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:port,DB_PATH:path.join(dir,'x.sqlite'),SHEETS_AUTO_BACKUP:'0',SHEETS_HOST:'0.0.0.0',SHEETS_ACCESS_CODE:'office-code-123'},stdio:['ignore','pipe','pipe']});
  const get=(host,opts={})=>new Promise((ok,bad)=>{const r=http.request({host:'127.0.0.1',port,path:opts.path||'/api/version',method:opts.method||'GET',headers:{host,...(opts.headers||{})}},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>ok({status:res.statusCode,body:b}));});r.on('error',bad);if(opts.body)r.write(opts.body);r.end();});
  try{
    await new Promise((ok,bad)=>{p.stdout.on('data',b=>{if(String(b).includes('ready'))ok();});p.on('exit',c=>bad(Error('exit '+c)));});
    assert.equal((await get(`localhost:${port}`)).status,200);
    assert.equal((await get(`evil.example:${port}`)).status,421,'a rebinding domain is refused');
    // Loopback never needs the code, so wrong codes are only counted for other addresses; check the gate exists.
    const lan=Object.values(os.networkInterfaces()).flat().find(i=>i&&i.family==='IPv4'&&!i.internal);
    if(lan){const r=await new Promise((ok,bad)=>{const q=http.request({host:lan.address,port,path:'/api/version',headers:{host:`${lan.address}:${port}`}},res=>{res.resume();ok(res.statusCode);});q.on('error',bad);q.end();});assert.notEqual(r,200,'office network needs the code');
      let last;for(let i=0;i<6;i++)last=await new Promise((ok,bad)=>{const q=http.request({host:lan.address,port,path:'/access',method:'POST',headers:{host:`${lan.address}:${port}`,'content-type':'application/x-www-form-urlencoded'}},res=>{res.resume();ok(res.statusCode);});q.on('error',bad);q.end('code=wrong');});
      assert.equal(last,429,'locked out after five wrong codes');}
  }finally{p.kill();await rm(dir,{recursive:true,force:true});}
});
