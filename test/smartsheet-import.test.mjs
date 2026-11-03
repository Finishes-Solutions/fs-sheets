import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {convertSheets,verifyFormulas,parseFormat} from '../lib/smartsheet-import.mjs';

const palette=['#000000','#ffffff','#ff0000','#ffff00'];
const budget={id:111,name:'Job 42 Budget',permalink:'https://app.smartsheet.com/sheets/x',
 columns:[{id:2,index:1,title:'Qty',type:'TEXT_NUMBER'},{id:1,index:0,title:'Item',type:'TEXT_NUMBER',primary:true},{id:3,index:2,title:'Unit',type:'TEXT_NUMBER',format:',,,,,,,,,,,,,,2,,'},{id:4,index:3,title:'Total',type:'TEXT_NUMBER',formula:'=[Qty]@row * [Unit]@row',format:',,,,,,,,,,,,,,2,,'},{id:5,index:4,title:'Status',type:'PICKLIST',options:['Open','Done']},{id:6,index:5,title:'Owner',type:'CONTACT_LIST'},{id:7,index:6,title:'Due',type:'DATE'},{id:8,index:7,title:'Ok',type:'CHECKBOX'},{id:9,index:8,title:'Rate',type:'TEXT_NUMBER'},{id:10,index:9,title:'Row ID',type:'TEXT_NUMBER',systemColumnType:'AUTO_NUMBER'}],
 rows:[{id:500,rowNumber:1,cells:[{columnId:1,value:'Phase 1',format:',,1,,,,,,2,3,,,,,,,'},{columnId:4,value:300,formula:'=SUM(CHILDREN())'}]},
  {id:501,rowNumber:2,parentId:500,locked:true,cells:[{columnId:1,value:'Slab'},{columnId:2,value:10},{columnId:3,value:20},{columnId:4,value:200},{columnId:5,value:'Done'},{columnId:6,value:'pat@example.com',objectValue:{objectType:'CONTACT',email:'pat@example.com',name:'Pat'}},{columnId:7,value:'2025-03-01'},{columnId:8,value:true},{columnId:9,value:4,formula:'=SUM({Rates Range})'},{columnId:10,value:'J-0001'}]},
  {id:502,rowNumber:3,parentId:500,cells:[{columnId:1,value:'Frame',hyperlink:{url:'https://example.com/spec'}},{columnId:2,value:5},{columnId:3,value:20},{columnId:4,value:100},{columnId:9,value:7.5,formula:'=AVGW([Qty]:[Qty], [Unit]:[Unit])'}]}],
 crossSheetReferences:[{name:'Rates Range',sourceSheetId:222,startColumnId:21,endColumnId:21}],
 discussions:[{parentType:'ROW',parentId:501,comments:[{text:'Pour Tuesday',createdBy:{name:'Lee'},createdAt:'2025-02-01T10:00:00Z'}]}]};
const rates={id:222,name:'Rates',columns:[{id:21,index:0,title:'Rate',type:'TEXT_NUMBER',primary:true}],rows:[{id:900,rowNumber:1,cells:[{columnId:21,value:4}]}]};

test('format descriptors map to styles using the server palette',()=>{
 assert.deepEqual(parseFormat(',,1,1,,,3,,2,3,,,,,3,1,',palette),{bold:true,italic:true,wrap:true,align:'right',color:'#ff0000',fill:'#ffff00',numberFormat:'percent'});
 assert.deepEqual(parseFormat('',palette),{});
});

test('API sheets convert with hierarchy, types, formulas, comments and verification',()=>{
 let n=0;const makeId=()=>'id'+(++n);
 const {sheets,report}=convertSheets([budget,rates],{workspaceId:'w',makeId,palette,existingNames:new Set(['Rates'])});
 const b=sheets[0],col=name=>b.columns.find(c=>c.name===name);
 assert.equal(b.columns[0].name,'Item','primary column first');assert.equal(col('Status').type,'select');assert.equal(col('Owner').type,'contact');assert.equal(col('Due').type,'date');assert.equal(col('Ok').type,'checkbox');assert.equal(col('Row ID').type,'text','system values preserved as text');
 assert.equal(col('Unit').numericFormat,'currency');assert.equal(col('Total').formula,'=[Qty]@row * [Unit]@row');
 assert.equal(sheets[1].name,'Rates (Smartsheet)','name clash resolved');
 assert.equal(b.rows[1].parentId,b.rows[0].id);assert.equal(b.rows[1].locked,true);assert.equal(b.rows[1].comments[0].by,'Lee');
 assert.equal(b.rows[1].cells[col('Rate').id],'=SUM({Rates (Smartsheet)::Rate})','named cross-sheet range rewritten');
 assert.equal(b.rows[2].cellLinks[col('Item').id],'https://example.com/spec');
 assert.deepEqual(b.rows[0].cellFormats[col('Item').id],{bold:true,color:'#ff0000',fill:'#ffff00'});
 const state={sheets};verifyFormulas(state,sheets,report);
 const r=report.sheets[0];
 assert.equal(r.formulas,5);assert.equal(r.formulaMismatches.length,1,'AVGW is not supported here and is reported, not hidden');assert.equal(r.formulaMismatches[0].column,'Rate');
 assert.equal(r.formulaMatches,4,'column formula rows, CHILDREN rollup and cross-sheet sum match Smartsheet');
});

test('API endpoint imports through a mock Smartsheet API and never stores the token',async()=>{
 const token='TESTTOKEN_abcdefghijklmnopqrstuvwxyz';let auth=null;
 const api=http.createServer((req,res)=>{auth=req.headers.authorization;const send=o=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(o));};
  if(req.headers.authorization!=='Bearer '+token){res.writeHead(401);return res.end('{}');}
  if(req.url.startsWith('/sheets?'))return send({data:[{id:111,name:budget.name},{id:222,name:'Rates'}]});
  if(req.url.startsWith('/serverinfo'))return send({formats:{color:palette}});
  if(req.url.startsWith('/sheets/111'))return send(budget);if(req.url.startsWith('/sheets/222'))return send(rates);res.writeHead(404);res.end('{}');});
 api.listen(0,'127.0.0.1');await once(api,'listening');
 const dir=await mkdtemp(path.join(os.tmpdir(),'sheets-ss-')),port=String(46000+Math.floor(Math.random()*3000)),dbFile=path.join(dir,'db.sqlite');
 const proc=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:port,DB_PATH:dbFile,SMARTSHEET_API_BASE:'http://127.0.0.1:'+api.address().port},stdio:['ignore','pipe','pipe']});
 try{await new Promise((ok,bad)=>{proc.stdout.on('data',b=>{if(b.toString().includes('sheets is ready'))ok();});proc.on('exit',c=>bad(Error('exit '+c)));});
  const post=async(route,body)=>{const r=await fetch(`http://127.0.0.1:${port}/api/${route}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json()};};
  assert.equal((await post('smartsheet/sheets',{token:'bad'})).status,400);
  assert.equal((await post('smartsheet/sheets',{token:'WRONGTOKEN_abcdefghijklmnopqrstuv'})).status,401);
  const list=await post('smartsheet/sheets',{token});assert.deepEqual(list.sheets.map(x=>x.name),['Job 42 Budget','Rates']);
  const st=await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
  const imp=await post('smartsheet/import',{token,revision:st.revision,sheetIds:['222','111']});
  assert.equal(imp.status,200);assert.equal(imp.report.sheets.length,2);
  const job=imp.state.sheets.find(x=>x.name==='Job 42 Budget');assert.equal(job.rows.length,3);assert.equal(job.workspaceId,imp.importedWorkspaceId);
  assert.equal((await post('smartsheet/import',{token,revision:imp.revision,sheetIds:['111']})).status,409,'re-import is refused');
  proc.kill('SIGTERM');await once(proc,'exit');
  const raw=(await readFile(dbFile)).toString('latin1');assert.ok(!raw.includes(token),'token not persisted');
 }finally{if(proc.exitCode===null){proc.kill('SIGTERM');await once(proc,'exit');}api.close();await rm(dir,{recursive:true,force:true});}
});
