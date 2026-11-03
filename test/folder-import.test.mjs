import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm,writeFile,readdir,utimes,mkdir} from 'node:fs/promises';
import {once} from 'node:events';
import os from 'node:os';import path from 'node:path';
import {parseCSV,applyImport} from '../lib/folder-import.mjs';

const sheet=()=>({id:'s',columns:[{id:'inv',name:'Invoice',type:'text',options:[],formula:''},{id:'amt',name:'Amount',type:'currency',options:[],formula:''},{id:'due',name:'Due date',type:'date',options:[],formula:''},{id:'calc',name:'Calc',type:'text',options:[],formula:'=1'}],
  rows:[{id:'r1',cells:{inv:'INV-1',amt:100,due:'2026-11-01'}},{id:'r2',locked:true,cells:{inv:'INV-2',amt:50}}]});
let n=0;const makeId=()=>'new-'+(++n);

test('CSV parsing handles quotes, commas, semicolons and blank lines', () => {
  assert.deepEqual(parseCSV('A;B\n"x;1";"say ""hi"""\n\n'),[['A','B'],['x;1','say "hi"']]);
});

test('upsert updates matching rows, adds new ones, skips locked rows and reports problems', () => {
  const r=applyImport(sheet(),parseCSV('invoice,AMOUNT,Due Date,Calc,Vendor\nINV-1,120,2026-11-05,9,Acme\nINV-2,999,,,\nINV-3,75,not a date,,\nINV-1,120,2026-11-05,,'),{keyColumnId:'inv',mode:'upsert',makeId});
  assert.equal(r.updated,1);assert.equal(r.added,1);assert.equal(r.skippedLocked,1);assert.equal(r.unchanged,1);
  assert.deepEqual(r.unmatched,['Calc','Vendor'],'formula columns and unknown headers are ignored');
  assert.match(r.errors[0],/Row 4, Due date/);
  const rows=Object.fromEntries(r.sheet.rows.map(x=>[x.cells.inv,x]));
  assert.equal(rows['INV-1'].cells.amt,120);assert.equal(rows['INV-2'].cells.amt,50,'locked row untouched');assert.equal(rows['INV-3'].cells.amt,75);
  assert.throws(()=>applyImport(sheet(),[['Nothing']],{mode:'append',makeId}),/None of the file/);
  assert.equal(applyImport(sheet(),parseCSV('Invoice\nINV-1\n'),{mode:'append',makeId}).added,1,'append always adds');
});

test('server watches a folder: CSV and Excel files are imported once and moved to processed', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'fimp-')),inbox=path.join(dir,'inbox'),port=String(42000+Math.floor(Math.random()*900));await mkdir(inbox);
  const p=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:port,DB_PATH:path.join(dir,'x.sqlite'),SHEETS_AUTO_BACKUP:'0',SHEETS_IMPORT_ROOT:dir,SHEETS_IMPORT_INTERVAL:'600000'},stdio:['ignore','pipe','pipe']});
  try{
    await new Promise((ok,bad)=>{p.stdout.on('data',b=>{if(String(b).includes('ready'))ok();});p.on('exit',c=>bad(Error('exit '+c)));});
    const api=async(route,body)=>{const r=await fetch(`http://127.0.0.1:${port}/api/${route}`,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});return {status:r.status,...await r.json()};};
    const st=await api('state');const sh=st.state.sheets[0],key=sh.columns[0];
    assert.equal((await api('imports',{sheetId:sh.id,folder:'/etc',mode:'append'})).status,400,'outside the import root is refused');
    const made=await api('imports',{sheetId:sh.id,folder:inbox,mode:'upsert',keyColumnId:key.id,after:'move'});assert.equal(made.status,200);
    const csv=path.join(inbox,'export.csv');await writeFile(csv,`${key.name}\nImported from CSV\n`);const old=new Date(Date.now()-60000);await utimes(csv,old,old);
    const xlsx=path.join(inbox,'export.xlsx');
    execFileSync('python3',['-c',`import openpyxl,sys;wb=openpyxl.Workbook();ws=wb.active;ws.append([sys.argv[2]]);ws.append(['Imported from Excel']);wb.save(sys.argv[1])`,xlsx,key.name],{env:{...process.env,PYTHONPATH:path.resolve('data/python')}});await utimes(xlsx,old,old);
    const run=await api('imports/run',{id:made.import.id});assert.equal(run.results.length,2,JSON.stringify(run));
    const after=await api('state');const titles=after.state.sheets[0].rows.map(r=>r.cells[key.id]);
    assert.ok(titles.includes('Imported from CSV'));assert.ok(titles.includes('Imported from Excel'));
    assert.deepEqual((await readdir(inbox)).sort(),['processed']);assert.equal((await readdir(path.join(inbox,'processed'))).length,2);
    assert.equal((await api('imports/run',{id:made.import.id})).results.length,0,'nothing new');
    const list=await api('imports');assert.equal(list.imports[0].runs.length,2);assert.equal(list.canEdit,true);
  }finally{p.kill('SIGTERM');await once(p,'exit').catch(()=>{});await rm(dir,{recursive:true,force:true});}
});
