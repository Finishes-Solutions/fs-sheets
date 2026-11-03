import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {toExcelFormula,buildWorkbookSpec,letter} from '../lib/excel-export.mjs';

const sheet={id:'b',name:'Budget',columns:[{id:'d',name:'Item',type:'text',formula:''},{id:'q',name:'Qty',type:'number',formula:''},{id:'u',name:'Unit cost',type:'currency',formula:''},{id:'t',name:'Total',type:'currency',formula:'=[Qty]@row * [Unit cost]@row'},{id:'n',name:'Lot A1',type:'text',formula:''}],
 rows:[{id:'p',cells:{d:'Phase'}},{id:'c1',parentId:'p',cells:{d:'Slab',q:2,u:10}},{id:'c2',parentId:'p',cells:{d:'Frame',q:3,u:5}}],forms:[],automations:[]};
const other={id:'o',name:'Rates 2025',columns:[{id:'x',name:'Rate',type:'number',formula:''}],rows:[{id:'o1',cells:{x:4}}],forms:[],automations:[]};
const state={sheets:[sheet,other]};
const ctx=(rowIndex,colIndex=3)=>({sheet,rowIndex,colIndex,colLetter:new Map(sheet.columns.map((c,i)=>[c.name.toLowerCase(),letter(i)])),idLetter:new Map(sheet.columns.map((c,i)=>[c.id,letter(i)])),rowExcel:new Map(sheet.rows.map((r,i)=>[r.id,i+2])),children:new Map([['p',['c1','c2']]]),sheets:new Map([['budget',{title:'Budget',colLetter:new Map([['qty','B']])}],['rates 2025',{title:'Rates 2025',colLetter:new Map([['rate','A']])}]])});
const x=(f,r=1,c)=>toExcelFormula(f,ctx(r,c));

test('column letters',()=>{assert.deepEqual([0,25,26,27,701].map(letter),['A','Z','AA','AB','ZZ']);});

test('Smartsheet references become Excel A1 references',()=>{
 assert.equal(x('=[Qty]@row * [Unit cost]@row').formula,'=B3 * C3');
 assert.equal(x('=SUM([Qty]1:[Qty]3)').formula,'=SUM(B2:B4)');
 assert.equal(x('=$[Qty]$2*2').formula,'=$B$3*2');
 assert.equal(x('=SUM([Qty]:[Qty])').formula,'=SUM(B:B)');
 assert.equal(x('=SUM(CHILDREN())',0).formula,'=SUM(D3,D4)');
 assert.equal(x('=SUM(CHILDREN([Qty]@row))',0).formula,'=SUM(B3,B4)');
 assert.equal(x('=CELLREF("@row", "q") * CELLREF("c2", "u")').formula,'=B3 * C4');
 assert.equal(x('=A1+B2').formula,'=A2+B3','A1 rows shift past the header row');
 assert.equal(x('=[Lot A1]@row & "A1"').formula,'=E3 & "A1"','names and strings are not treated as A1');
 assert.equal(x("='Rates 2025'!A1*2").formula,"='Rates 2025'!A2*2");
 assert.equal(x('=SUM({Rates 2025::Rate})').formula,"=SUM('Rates 2025'!A:A)");
 assert.equal(x('=IFERROR(XLOOKUP([Qty]@row, [Qty]:[Qty], [Total]:[Total]), 0)').formula,'=IFERROR(_xlfn.XLOOKUP(B3, B:B, D:D), 0)');
 assert.equal(x('=AVG([Qty]1:[Qty]2)').formula,'=AVERAGE(B2:B3)');
 assert.equal(x('=LOG10([Qty]@row)').formula,'=LOG10(B3)');
});

test('formulas without a faithful Excel equivalent are reported, not guessed',()=>{
 for(const f of ['=COUNTM([Qty]:[Qty])','=JOIN(CHILDREN())','=COUNTIF([Qty]:[Qty], @cell > 2)','=SUM({Missing::Rate})','=SUM(CHILDREN())','=[Nope]@row','=PARENT()'])
  assert.equal(x(f,2).ok,false,f);
});

test('workbook spec exports formulas, values, number formats, hierarchy and notes',()=>{
 sheet.rows[0].comments=[{by:'Pat',at:'2026-11-02T00:00:00Z',text:'Check slab'}];
 const spec=buildWorkbookSpec(state,['b']),ws=spec.sheets[0];
 assert.equal(ws.title,'Budget');assert.equal(ws.columns[2].numFmt,'"$"#,##0.00');
 assert.equal(ws.rows[1].cells[3].f,'=B3 * C3','column formula exported per row');
 assert.equal(ws.rows[1].level,1);assert.equal(ws.rows[1].cells[1].v,2);
 assert.match(ws.rows[0].cells[0].note,/Pat .*Check slab/);
 assert.equal(spec.stats.translated,3);
});

test('python writer produces a workbook Excel can read back',{skip:!existsSync('data/python/openpyxl')},()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'xlsx-test-'));
 try{const spec=buildWorkbookSpec(state,['b','o']);writeFileSync(path.join(dir,'s.json'),JSON.stringify(spec));
  const env={...process.env,PYTHONPATH:path.resolve('data/python')};
  execFileSync('python3',['scripts/export_xlsx.py',path.join(dir,'s.json'),path.join(dir,'o.xlsx')],{env});
  const out=execFileSync('python3',['-c',`import openpyxl,sys;wb=openpyxl.load_workbook(sys.argv[1]);ws=wb['Budget'];print(wb.sheetnames,ws['D3'].value,ws['B3'].value,ws['C3'].number_format,ws.freeze_panes,ws.row_dimensions[3].outline_level,ws['A2'].comment.text[:20])`,path.join(dir,'o.xlsx')],{env}).toString();
  assert.match(out,/\['Budget', 'Rates 2025'\] =B3 \* C3 2 "\$"#,##0\.00 A2 1 Comments/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('formulas with syntax errors are exported as their value with the formula in a note', async () => {
  const {toExcelFormula}=await import('../lib/excel-export.mjs');
  const ctx={sheet:{rows:[{id:'r'}]},rowIndex:0,colIndex:0,colLetter:new Map([['total cost','E']]),idLetter:new Map(),rowExcel:new Map(),children:new Map(),sheets:new Map()};
  assert.deepEqual(toExcelFormula('=SUM([Total Cost]1:',ctx),{ok:false,reason:'formula has a syntax error'});
  assert.deepEqual(toExcelFormula('=1+',ctx),{ok:false,reason:'formula has a syntax error'});
  assert.equal(toExcelFormula('=SUM([Total Cost]1:[Total Cost]3)',ctx).formula,'=SUM(E2:E4)');
});
