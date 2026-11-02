import test from 'node:test';
import assert from 'node:assert/strict';
import {createCalculator,parseFormula} from '../lib/formulas.mjs';
function fixture(formula){const s={id:'s',name:'Projects',columns:[{id:'cost',name:'Cost'},{id:'qty',name:'Quantity'},{id:'total',name:'Total',formula}],rows:[{id:'a',cells:{cost:10,qty:2}},{id:'b',parentId:'a',cells:{cost:20,qty:3}},{id:'c',parentId:'a',cells:{cost:30,qty:4}}]};const state={sheets:[s]};return {s,state,get:(index=0)=>createCalculator(state).get(s,s.rows[index],s.columns[2])};}
test('arithmetic precedence and row references',()=>{assert.equal(fixture('=[Cost]@row + [Quantity]@row * 3').get(),16);});
test('ranges and absolute references',()=>{assert.equal(fixture('=SUM($[Cost]$1:[Cost]3)').get(),60);});
test('column ranges, criteria and cross-sheet references',()=>{assert.equal(fixture('=COUNTIF([Cost], ">15")').get(),2);assert.equal(fixture('=SUM({Projects::Cost})').get(),60);});
test('lazy IF and IFERROR',()=>{assert.equal(fixture('=IF(TRUE, 7, 1/0)').get(),7);assert.equal(fixture('=IFERROR(1/0, "fallback")').get(),'fallback');});
test('hierarchy uses relationships rather than adjacent rows',()=>{assert.equal(fixture('=SUM(CHILDREN([Cost]@row))').get(),50);assert.equal(fixture('=PARENT([Cost]@row)').get(1),10);assert.equal(fixture('=COUNT(ANCESTORS())').get(1),1);});
test('cycles and unknown functions are explicit errors',()=>{assert.equal(fixture('=[Total]@row').get(),'#CIRCULAR!');assert.equal(fixture('=MISSING(1)').get(),'#UNSUPPORTED!');assert.equal(fixture('=1/0').get(),'#DIV/0!');});
test('literal false and zero are retained',()=>{const {state,s}=fixture('=IF([Cost]@row = 0, TRUE, FALSE)');s.rows[0].cells.cost=0;s.rows[1].cells.qty=false;const c=createCalculator(state);assert.equal(c.get(s,s.rows[0],s.columns[0]),0);assert.equal(c.get(s,s.rows[1],s.columns[1]),false);assert.equal(c.get(s,s.rows[0],s.columns[2]),true);});
test('formula input cannot execute JavaScript',()=>{assert.throws(()=>parseFormula('=globalThis.process.exit()'));assert.throws(()=>parseFormula('=(()=>1)()'));});
test('dates, strings, rounding and lookup',()=>{assert.equal(fixture('=DAYS(DATE(2026,11,4), DATE(2026,11,2))').get(),2);assert.equal(fixture('=ROUND(10/3, 2)').get(),3.33);assert.equal(fixture('=INDEX([Cost], MATCH(20, [Cost]))').get(),20);assert.equal(fixture('="a" & UPPER("bc")').get(),'aBC');});
