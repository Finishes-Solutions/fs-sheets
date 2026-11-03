import test from 'node:test';
import assert from 'node:assert/strict';
import {inferFormulas,applyInferredFormulas} from '../lib/formula-inference.mjs';
import {createCalculator} from '../lib/formulas.mjs';
import {assertUnlocked} from '../lib/sheet-tools.mjs';
function fixture(){const columns=['Submit Date','Month','Year','1 day late'].map((name,i)=>({id:'c'+i,name,type:i===0?'text':i===3?'date':'number',formula:''}));const s={id:'s',name:'Import',source:{file:'test.xlsx'},columns,rows:Array.from({length:1000},(_,i)=>({id:'r'+i,sourceRow:i+2,cells:{c0:'2026-11-02T13:00:00',c1:11,c2:2026,c3:'2026-11-03'}}))};s.rows[3].cells.c3='2026-11-04';return {sheets:[s]};}
test('inference preserves every original value including exceptional rows and recalculates new inputs',()=>{
 const original=fixture(),report=inferFormulas(original),next=applyInferredFormulas(original,report),s=next.sheets[0];assert.equal(report.length,3);assert.equal(report[2].matched,999);assert.equal(s.rows[3].formulaOverrides.c3,true);assert.equal(original.sheets[0].columns[0].formula,'');
 for(let i=0;i<s.rows.length;i++)assert.deepEqual(s.rows[i].cells,original.sheets[0].rows[i].cells);
 const calc=createCalculator(next);assert.equal(calc.get(s,s.rows[3],s.columns[3]),'2026-11-04');s.rows[0].cells.c0='2027-02-05';const fresh=createCalculator(next);assert.equal(fresh.get(s,s.rows[0],s.columns[1]),2);assert.equal(fresh.get(s,s.rows[0],s.columns[2]),2027);assert.equal(fresh.get(s,s.rows[0],s.columns[3]),'2027-02-08');
 for(const c of s.columns)c.formula='';assert.equal(createCalculator(next).get(s,s.rows[0],s.columns[1]),11);
});
test('sparse and conflicting evidence stays review-only and locked source rows prevent automatic inference',()=>{
 const state=fixture();state.sheets[0].rows=state.sheets[0].rows.slice(0,5);assert.equal(inferFormulas(state).every(x=>!x.canApply),true);
 const locked=fixture();locked.sheets[0].rows[0].locked=true;assert.equal(inferFormulas(locked).every(x=>!x.canApply),true);
 const conflicting=fixture();conflicting.sheets[0].rows[0].cells.c1=8;conflicting.sheets[0].rows[1].cells.c1=9;conflicting.sheets[0].rows[2].cells.c1=9;conflicting.sheets[0].rows[3].cells.c1=8;conflicting.sheets[0].rows[4].cells.c1=8;conflicting.sheets[0].rows[5].cells.c1=8;conflicting.sheets[0].rows[6].cells.c1=8;conflicting.sheets[0].rows[7].cells.c1=8;conflicting.sheets[0].rows[8].cells.c1=8;conflicting.sheets[0].rows[9].cells.c1=8;conflicting.sheets[0].rows[10].cells.c1=8;assert.equal(inferFormulas(conflicting)[0].canApply,false);
});
test('locked-row protection includes changes to formula exception overrides',()=>{
 const a=fixture();a.sheets[0].rows[0].locked=true;const b=structuredClone(a);b.sheets[0].rows[0].formulaOverrides={c1:true};assert.throws(()=>assertUnlocked(a,b),/Unlock/);
});
