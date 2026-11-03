import test from 'node:test';
import assert from 'node:assert/strict';
import {cellReference,rangeReference,columnReference,insertReference,isFormulaText} from '../public/formula-picker.mjs';
import {createCalculator} from '../lib/formulas.mjs';

test('picked references use row-relative, absolute, range and column forms',()=>{
 assert.equal(cellReference({column:'Total Cost',rowNumber:14,sameRow:true}),'[Total Cost]@row');
 assert.equal(cellReference({column:'Total Cost',rowNumber:14,sameRow:false}),'[Total Cost]14');
 assert.equal(rangeReference({column:'A',rowNumber:9},{column:'A',rowNumber:3}),'[A]3:[A]9');
 assert.equal(columnReference('Budget'),'[Budget]:[Budget]');
 assert.ok(isFormulaText(' =1'));assert.ok(!isFormulaText('1'));assert.ok(!isFormulaText(5));
});

test('insertion joins operands, replaces selections and grows a pick into a range',()=>{
 let r=insertReference('=',1,1,'[Qty]@row');assert.equal(r.value,'=[Qty]@row');assert.equal(r.caret,r.value.length);
 r=insertReference(r.value,r.caret,r.caret,'[Rate]@row');assert.equal(r.value,'=[Qty]@row+[Rate]@row','adjacent operand gets an operator');
 r=insertReference('=SUM(',5,5,'[A]1');assert.equal(r.value,'=SUM([A]1');
 const grown=insertReference(r.value,r.caret,r.caret,'[A]1:[A]5',r.span);assert.equal(grown.value,'=SUM([A]1:[A]5','shift-click replaces the previous pick');
 r=insertReference('=SUM([A]1',9,9,'[B]2');assert.equal(r.value,'=SUM([A]1,[B]2','inside a function call a comma separates arguments');
 r=insertReference('=[Old]@row*2',1,10,'[New]@row');assert.equal(r.value,'=[New]@row*2','selected text is replaced');
});

test('picked formulas evaluate in the shared engine',()=>{
 const s={id:'s',name:'S',columns:[{id:'q',name:'Quantities/ Total Sqft',type:'number',formula:''},{id:'c',name:'Cost Per sqft/Unit',type:'currency',formula:''},{id:'t',name:'Total',type:'currency',formula:''}],rows:[{id:'r1',cells:{q:105840,c:130,t:''}},{id:'r2',cells:{q:3200,c:135,t:''}}],forms:[],automations:[]};
 let f=insertReference('=',1,1,cellReference({column:'Quantities/ Total Sqft',rowNumber:1,sameRow:true})).value;
 f=insertReference(f+'*',f.length+1,f.length+1,cellReference({column:'Cost Per sqft/Unit',rowNumber:1,sameRow:true})).value;
 s.rows[0].cells.t=f;s.rows[1].cells.t='=SUM('+rangeReference({column:'Quantities/ Total Sqft',rowNumber:1},{column:'Quantities/ Total Sqft',rowNumber:2})+')';
 const calc=createCalculator({sheets:[s]});
 assert.equal(calc.get(s,s.rows[0],s.columns[2]),13759200);
 assert.equal(calc.get(s,s.rows[1],s.columns[2]),109040);
});

test('imported CELLREF formulas read with column names without changing the stored text',async()=>{
 const {readableFormula}=await import('../public/formula-picker.mjs');
 const s={columns:[{id:'q-id',name:'Qty'},{id:'c-id',name:'Unit cost'}],rows:[{id:'r1'},{id:'r2'}]};
 const f='=IF(ISBLANK(CELLREF("@row", "q-id")), "", CELLREF("@row","q-id") * CELLREF("r2", "c-id"))';
 assert.equal(readableFormula(f,s),'=IF(ISBLANK([Qty]@row), "", [Qty]@row * [Unit cost]2)');
 assert.equal(readableFormula('=CELLREF("gone","q-id")',s),'=CELLREF("gone","q-id")','unknown rows stay explicit');
 assert.equal(readableFormula('=[A]@row',s),'=[A]@row');
});
