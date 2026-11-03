import test from 'node:test';
import assert from 'node:assert/strict';
import {renameColumnInFormula,renameSheetInFormula,applyColumnRename,applySheetRename} from '../lib/formula-rename.mjs';
import {createCalculator} from '../lib/formulas.mjs';

const ws=()=>({sheets:[
 {id:'b',name:'Budget',columns:[{id:'d',name:'Item',type:'text',formula:''},{id:'q',name:'Qty',type:'number',formula:''},{id:'u',name:'Cost',type:'currency',formula:''},{id:'t',name:'Total',type:'currency',formula:'=[Qty]@row * [Cost]@row'}],
  rows:[{id:'r1',cells:{d:'A',q:2,u:10}},{id:'r2',cells:{d:'Cost "label"',q:3,u:5}},{id:'r3',cells:{d:'=IF([Cost]1 > 5, "[Cost] high", "low")',q:'=SUM([Qty]1:[Qty]2)'}}],summaryFields:[{id:'f',name:'Spend',value:'=SUM([Total]:[Total])'}]},
 {id:'p',name:'Portfolio',columns:[{id:'x',name:'Name',type:'text',formula:''},{id:'y',name:'Spend',type:'currency',formula:''}],rows:[{id:'p1',cells:{x:'Budget',y:'=SUM({Budget::Cost})'}},{id:'p2',cells:{y:"='Budget'!C1 + Budget!C2"}}]}],
 reports:[{id:'rep',sheetIds:['b'],columns:['$task','Cost'],filters:[{column:'Cost',operator:'gt',value:'1'}],sortBy:'cost'},{id:'rep2',sheetIds:['b','p'],columns:['Cost']}],dashboards:[]});
const values=s=>{const c=createCalculator(s);return s.sheets.flatMap(sh=>sh.rows.flatMap(r=>sh.columns.map(col=>c.get(sh,r,col))));};

test('column references are renamed outside string literals only',()=>{
 assert.equal(renameColumnInFormula('=IF([cost]1 > 5, "[Cost] high", [COST]@row)','Cost','Unit cost'),'=IF([Unit cost]1 > 5, "[Cost] high", [Unit cost]@row)');
 assert.equal(renameColumnInFormula('=$[Cost]$3*2','Cost','Rate'),'=$[Rate]$3*2');
 assert.equal(renameColumnInFormula('plain [Cost] text','Cost','Rate'),'plain [Cost] text');
 assert.equal(renameColumnInFormula('=[Cost (USD)]@row','Cost (USD)','Cost'),'=[Cost]@row','special characters are literal');
});

test('renaming a column keeps every result identical and updates unambiguous report fields',()=>{
 const s=ws(),before=values(s);
 const n=applyColumnRename(s,'b','Cost','Unit cost');
 s.sheets[0].columns[2].name='Unit cost';
 assert.deepEqual(values(s),before);
 assert.ok(n>=5);
 assert.equal(s.sheets[0].columns[3].formula,'=[Qty]@row * [Unit cost]@row');
 assert.equal(s.sheets[0].rows[2].cells.d,'=IF([Unit cost]1 > 5, "[Cost] high", "low")');
 assert.equal(s.sheets[1].rows[0].cells.y,'=SUM({Budget::Unit cost})','cross-sheet reference follows');
 assert.deepEqual(s.reports[0].columns,['$task','Unit cost']);assert.equal(s.reports[0].filters[0].column,'Unit cost');assert.equal(s.reports[0].sortBy,'Unit cost');
 assert.deepEqual(s.reports[1].columns,['Unit cost'],'multi-sheet report updated: no other source sheet has a Cost column');
});

test('renaming a sheet updates cross-sheet and A1 references',()=>{
 const s=ws(),before=values(s);
 applySheetRename(s,'Budget','Budget 2025');s.sheets[0].name='Budget 2025';
 assert.equal(s.sheets[1].rows[0].cells.y,'=SUM({Budget 2025::Cost})');
 assert.equal(s.sheets[1].rows[1].cells.y,"='Budget 2025'!C1 + 'Budget 2025'!C2");
 assert.deepEqual(values(s),before);
 assert.equal(renameSheetInFormula('=MyBudget!A1+Budget!A1','Budget','Plan'),'=MyBudget!A1+Plan!A1','only whole sheet names');
});

test('a rename that would edit locked rows is refused without changing anything',()=>{
 const s=ws();s.sheets[0].rows[2].locked=true;const snap=JSON.stringify(s);
 assert.throws(()=>applyColumnRename(s,'b','Qty','Quantity'),/locked rows .*Budget/);
 assert.equal(JSON.stringify(s),snap);
});

test('report fields shared by another source sheet with the same column name are left unchanged',()=>{
 const s=ws();s.sheets[1].columns.push({id:'z',name:'Cost',type:'currency',formula:''});
 applyColumnRename(s,'b','Cost','Unit cost');
 assert.deepEqual(s.reports[1].columns,['Cost'],'still matches the Portfolio sheet');
 assert.deepEqual(s.reports[0].columns,['$task','Unit cost']);
});
