import test from 'node:test';
import assert from 'node:assert/strict';
import {columnTypes} from '../lib/columns.mjs';
import {typeGroups,typeGlyph,typeSections,insertPositions,defaultInsertIndex,uniqueColumnName,clampInsertIndex,buildColumn,typeHints} from '../public/column-editor.mjs';

const cols=[{id:'p',name:'Description',type:'text'},{id:'q',name:'Qty',type:'text',numericFormat:'number'},{id:'c',name:'Total Cost',type:'text',numericFormat:'currency'},{id:'h',name:'Old',type:'number',hidden:true},{id:'k',name:'Done',type:'checkbox'}];
let n=0;const makeId=()=>'new-'+(++n);

test('every column type appears exactly once in the grouped picker and has a hint',()=>{
 const grouped=typeGroups.flatMap(([,types])=>types);
 assert.equal(new Set(grouped).size,grouped.length);
 assert.deepEqual([...grouped].sort(),columnTypes.map(([t])=>t).sort());
 for(const t of grouped)assert.ok(typeHints[t],'missing hint for '+t);
});

test('header glyph reflects imported numeric formats, not only the base type',()=>{
 assert.equal(typeGlyph(cols[1]),'#');assert.equal(typeGlyph(cols[2]),'$');
 assert.equal(typeGlyph({type:'text',numericFormat:'percent'}),'%');
 assert.equal(typeGlyph({type:'date'}),'▦');assert.equal(typeGlyph({type:'unknown'}),'T');
});

test('insert positions never place a new column before the primary column',()=>{
 const p=insertPositions(cols);
 assert.equal(p.length,cols.length);assert.equal(p[0].value,'1');assert.match(p[0].label,/After “Description”/);
 assert.match(p.at(-1).label,/At the end/);assert.match(p[3].label,/\(hidden\)/);
 assert.equal(clampInsertIndex(cols,'0'),1);assert.equal(clampInsertIndex(cols,'99'),cols.length);assert.equal(clampInsertIndex(cols,'abc'),cols.length);
});

test('default insertion follows the active column, otherwise appends',()=>{
 assert.equal(defaultInsertIndex(cols,'c'),3);
 assert.equal(defaultInsertIndex(cols,'p'),1);
 assert.equal(defaultInsertIndex(cols,'missing'),cols.length);
});

test('suggested names are unique, case-insensitively',()=>{
 assert.equal(uniqueColumnName(cols),'New column');
 assert.equal(uniqueColumnName([...cols,{name:'new column'},{name:'New column 2'}]),'New column 3');
});

test('type sections only show settings that apply',()=>{
 assert.deepEqual([...typeSections('select')].sort(),['formula','options']);
 assert.deepEqual([...typeSections('currency')].sort(),['currency','formula']);
 assert.ok(!typeSections('autoNumber').has('formula'));assert.ok(typeSections('autoNumber').has('numbering'));
 assert.ok(typeSections('mirror').has('mirror'));assert.ok(typeSections('progress').has('progress'));
});

test('buildColumn validates names, primary type, formulas and progress sources',()=>{
 const c=buildColumn({name:'  Contingency ',type:'currency',width:'5000',options:'',formula:'[Total Cost]@row * 0.1',currency:'USD'},cols,null,makeId);
 assert.equal(c.name,'Contingency');assert.equal(c.width,600);assert.equal(c.formula,'=[Total Cost]@row * 0.1');assert.match(c.id,/^new-/);
 assert.throws(()=>buildColumn({name:'total cost',type:'text'},cols,null,makeId),/unique/);
 assert.throws(()=>buildColumn({name:'',type:'text'},cols,null,makeId),/unique/);
 assert.throws(()=>buildColumn({name:'Description',type:'number'},cols,cols[0],makeId),/primary column/);
 assert.throws(()=>buildColumn({name:'Seq',type:'autoNumber',formula:'=1'},cols,null,makeId),/Automatic columns/);
 assert.throws(()=>buildColumn({name:'Calc',type:'formula',formula:''},cols,null,makeId),/Enter a column formula/);
 assert.throws(()=>buildColumn({name:'Prog',type:'progress'},cols,null,makeId),/checkbox/);
 assert.deepEqual(buildColumn({name:'Prog',type:'progress','progress-k':'on'},cols,null,makeId).progressColumnIds,['k']);
 assert.throws(()=>buildColumn({name:'x'.repeat(81),type:'text'},cols,null,makeId),/80 characters/);
});

test('editing keeps the column id and imported metadata such as numeric formats',()=>{
 const c=buildColumn({name:'Total Cost',type:'text',width:'150',options:'',formula:''},cols,cols[2],makeId);
 assert.equal(c.id,'c');assert.equal(c.numericFormat,'currency');assert.equal(c.width,150);
});

test('display hides floating-point noise without changing stored numbers',async()=>{
 const {displayCell}=await import('../lib/columns.mjs');
 assert.equal(displayCell(5000000.000000003,{type:'text'}),'5000000');
 assert.equal(displayCell(0.1+0.2,{type:'number'}),'0.3');
 assert.equal(displayCell(1234.5678,{type:'text'}),'1234.5678');
 assert.equal(displayCell(13759200,{type:'text',numericFormat:'currency'}),'$13,759,200.00');
});
