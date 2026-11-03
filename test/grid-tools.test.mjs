import test from 'node:test';
import assert from 'node:assert/strict';
import {selectionStats,fillSeries,moveRows,findReplacePlan,indentRows,outdentRows} from '../public/grid-tools.mjs';
import {translateFormula} from '../lib/formulas.mjs';

test('selection statistics count numbers only and avoid float noise',()=>{
 assert.deepEqual(selectionStats([0.1,0.2,'x','',null,'3','#DIV/0!']),{cells:7,count:3,sum:3.3,average:1.1,min:0.1,max:3});
 assert.equal(selectionStats(['a']).count,0);
});

test('fill handle continues numbers, dates and numbered text; copies otherwise',()=>{
 assert.deepEqual(fillSeries([5],3),[5,5,5],'single number copies (Excel default)');
 assert.deepEqual(fillSeries([2,4],3),[6,8,10]);
 assert.deepEqual(fillSeries([0.1,0.2],2),[0.3,0.4]);
 assert.deepEqual(fillSeries(['2025-01-30'],3),['2025-01-31','2025-02-01','2025-02-02']);
 assert.deepEqual(fillSeries(['2025-01-01','2025-01-08'],2),['2025-01-15','2025-01-22']);
 assert.deepEqual(fillSeries(['Phase 09'],2),['Phase 10','Phase 11']);
 assert.deepEqual(fillSeries(['A','B'],3),['A','B','A']);
 assert.deepEqual(fillSeries([1,5,6],2),[1,5],'irregular numbers repeat the pattern');
});

test('fill handle shifts relative formula references',()=>{
 const t=(f,i,k)=>translateFormula(f,1+i-k,0);
 assert.deepEqual(fillSeries(['=[Qty]1*2'],2,t),['=[Qty]2*2','=[Qty]3*2']);
 assert.deepEqual(fillSeries(['=[Qty]@row*2'],1,t),['=[Qty]@row*2']);
});

test('moving rows carries descendants and adopts the target parent',()=>{
 const rows=[{id:'a'},{id:'a1',parentId:'a'},{id:'a2',parentId:'a'},{id:'b'},{id:'b1',parentId:'b'},{id:'c'}];
 assert.deepEqual(moveRows(rows,['a'],'c').map(r=>r.id),['b','b1','a','a1','a2','c']);
 const into=moveRows(rows,['c'],'b1');assert.deepEqual(into.map(r=>r.id),['a','a1','a2','b','c','b1']);assert.equal(into.find(r=>r.id==='c').parentId,'b');
 assert.deepEqual(moveRows(rows,['a1'],null).map(r=>r.id),['a','a2','b','b1','c','a1']);assert.equal(moveRows(rows,['a1'],null).at(-1).parentId,null);
 assert.throws(()=>moveRows(rows,['a'],'a2'),/outside/);
 assert.equal(rows[1].parentId,'a','input is not mutated');
});

test('find & replace skips formulas, locked/read-only cells and rich values',()=>{
 const cells=[{row:'1',column:'c',raw:'Phase A roof',shown:'Phase A roof',editable:true},{row:'2',column:'c',raw:'=[X]@row',shown:'Phase total',editable:true},{row:'3',column:'c',raw:'phase b',shown:'phase b',editable:false},{row:'4',column:'n',raw:120,shown:'$120.00',editable:true}];
 let p=findReplacePlan(cells,{find:'phase',replace:'Stage'});
 assert.equal(p.matches.length,3);assert.deepEqual(p.changes,[{row:'1',column:'c',value:'Stage A roof'}]);assert.equal(p.skipped,2);
 p=findReplacePlan(cells,{find:'Phase',matchCase:true});assert.equal(p.matches.length,2);
 p=findReplacePlan(cells,{find:'120',replace:'125'});assert.deepEqual(p.changes,[{row:'4',column:'n',value:'125'}]);
 p=findReplacePlan(cells,{find:'roof',wholeCell:true});assert.equal(p.matches.length,0);
});

const tree=a=>a.map(([id,parentId])=>({id,parentId}));
const shape=rows=>rows.map(r=>r.id+(r.parentId?'<'+r.parentId:'')).join(' ');

test('indent makes a row the child of the row above at the same level', () => {
  const rows=tree([['A',null],['A1','A'],['A2','A'],['B',null]]);
  assert.deepEqual(indentRows(rows,['B']),{changed:1,blocked:0});
  assert.equal(shape(rows),'A A1<A A2<A B<A', 'B joins A, not grandchild A2');
});

test('indenting several sibling rows keeps them siblings and brings children along', () => {
  const rows=tree([['A',null],['B',null],['B1','B'],['C',null]]);
  indentRows(rows,['B','B1','C']);
  assert.equal(shape(rows),'A B<A B1<B C<A');
});

test('indent is refused for the first row at its level', () => {
  const rows=tree([['A',null],['A1','A'],['B',null]]);
  assert.deepEqual(indentRows(rows,['A1']),{changed:0,blocked:1});
  assert.deepEqual(indentRows(rows,['A']),{changed:0,blocked:1});
  assert.equal(shape(rows),'A A1<A B');
});

test('outdent moves a row up a level and adopts the siblings below it so order never changes', () => {
  const rows=tree([['A',null],['A1','A'],['A2','A'],['A2x','A2'],['A3','A'],['B',null]]);
  assert.deepEqual(outdentRows(rows,['A2']),{changed:1,blocked:0,adopted:1});
  assert.equal(shape(rows),'A A1<A A2 A2x<A2 A3<A2 B');
});

test('outdenting a block of siblings keeps them siblings; top-level rows are skipped', () => {
  const rows=tree([['A',null],['A1','A'],['A2','A'],['A3','A']]);
  const r=outdentRows(rows,['A1','A2','A']);
  assert.equal(r.blocked,1);
  assert.equal(shape(rows),'A A1<A A2<A A3<A', 'A selected and top-level: its children are covered, nothing moves');
  const rows2=tree([['A',null],['A1','A'],['A2','A'],['A3','A']]);
  outdentRows(rows2,['A1','A2']);
  assert.equal(shape(rows2),'A A1 A2 A3<A2');
});
