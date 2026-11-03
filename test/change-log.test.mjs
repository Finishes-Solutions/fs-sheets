import test from 'node:test';
import assert from 'node:assert/strict';
import {recordRowHistory,historyEntries,HISTORY_LIMIT} from '../lib/change-log.mjs';
import {normalizeMetadata} from '../lib/workflows.mjs';

test('cell changes are recorded per row, newest first, with current column names',()=>{
 const prev={id:'r',cells:{a:1,b:'x'}},row={id:'r',cells:{a:2,b:'x',c:'new'}};
 recordRowHistory(prev,row,'Pat','2026-11-03T00:00:00Z');
 assert.deepEqual(row.cellHistory.map(e=>[e.col,e.from,e.to,e.by]),[['a',1,2,'Pat'],['c','','new','Pat']]);
 const list=historyEntries(row,[{id:'a',name:'Qty'},{id:'c',name:'Notes'}]);
 assert.equal(list[0].column,'Notes');assert.equal(historyEntries(row,[],'a')[0].column,'Deleted column');
});

test('history is capped, long text clipped, and client-supplied history ignored',()=>{
 let prev={id:'r',cells:{a:0}};
 for(let i=1;i<=HISTORY_LIMIT+5;i++){const row={id:'r',cells:{a:i},cellHistory:[{fake:true}]};recordRowHistory(prev,row,'x','t');prev=row;}
 assert.equal(prev.cellHistory.length,HISTORY_LIMIT);assert.ok(!prev.cellHistory.some(e=>e.fake));assert.equal(prev.cellHistory.at(-1).to,HISTORY_LIMIT+5);
 const row={id:'r',cells:{a:'y'.repeat(1000)}};recordRowHistory({id:'r',cells:{a:''}},row,'x','t');assert.ok(row.cellHistory[0].to.length<=301);
});

test('the save pipeline records edits and keeps history on untouched rows',()=>{
 const before={sheets:[{id:'s',rows:[{id:'r1',cells:{a:1},cellHistory:[{col:'a',from:0,to:1}]},{id:'r2',cells:{a:5}}]}]};
 const after=JSON.parse(JSON.stringify(before));after.sheets[0].rows[1].cells.a=6;after.sheets[0].rows[0].cellHistory=[{col:'a',from:'forged',to:'forged'}];
 normalizeMetadata(before,after,'Lee','now');
 assert.deepEqual(after.sheets[0].rows[0].cellHistory,[{col:'a',from:0,to:1}],'unchanged row keeps server history');
 assert.equal(after.sheets[0].rows[1].cellHistory[0].by,'Lee');
});
