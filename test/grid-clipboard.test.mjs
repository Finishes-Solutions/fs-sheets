import test from 'node:test';import assert from 'node:assert/strict';
import {parseTSV,encodeTSV,pastePlan} from '../public/grid-clipboard.mjs';
test('Excel TSV preserves quoted newlines, tabs, quotes, blanks, and CRLF',()=>{const m=[['Task\nline 2','a\tb','He said "yes"',''],['Next','', '12','']];assert.deepEqual(parseTSV(encodeTSV(m)+'\r\n'),m);assert.deepEqual(parseTSV('a\tb\r\n\t\r\n'),[['a','b'],['','']]);assert.throws(()=>parseTSV('"unfinished'),/Unclosed/);});
test('typed paste validates full block and plans new rows without changing inputs',()=>{const rows=[{id:'r',cells:{a:'old'}}],columns=[{id:'a',name:'Task',type:'text'},{id:'b',name:'Cost',type:'number'}];const args={rows,columns,rowIndex:0,columnIndex:0};assert.deepEqual(pastePlan({...args,matrix:[['new','12'],['next','0']]}),[{id:'r',cells:{a:'new',b:12}},{id:undefined,cells:{a:'next',b:0}}]);assert.equal(rows[0].cells.a,'old');assert.throws(()=>pastePlan({...args,matrix:[['new','12'],['bad','no']]}),/enter a number/);assert.equal(rows[0].cells.a,'old');});
test('paste rejects locked rows, formula columns, and overflow rather than truncating',()=>{const columns=[{id:'a',name:'Task',type:'text'},{id:'b',name:'Total',formula:'=1',type:'number'}],base={rows:[{id:'r',locked:true}],columns,rowIndex:0,columnIndex:0,matrix:[['value']]};assert.throws(()=>pastePlan(base),/locked/);assert.throws(()=>pastePlan({...base,rows:[],matrix:[['a','2']]}),/read-only/);assert.throws(()=>pastePlan({...base,rows:[],matrix:[['a','2','3']]}),/last visible column/);});

test('Excel display formats convert currency, percent, and US dates',()=>{const columns=[{id:'a',name:'Cost',type:'currency'},{id:'b',name:'Progress',type:'percent'},{id:'c',name:'Due',type:'date'}];assert.deepEqual(pastePlan({matrix:[['$1,234.50','25%','11/2/2026']],rows:[],columns,rowIndex:0,columnIndex:0})[0].cells,{a:1234.5,b:.25,c:'2026-11-02'});});

test('copy for Excel carries values and an HTML table; formulas stay internal and translate on paste',async()=>{
 const {clipboardPayload,internalPasteMatrix,parseTSV}=await import('../public/grid-clipboard.mjs');
 const rows=[{cells:{q:105840,t:'=[Q]@row*130',n:'Line 1\nLine 2'}},{cells:{q:3200,t:'=[Q]2*135',n:'a "quoted" <b>'}}];
 const cols=[{id:'q'},{id:'t'},{id:'n'}];
 const shown={105840:'105,840',3200:'3,200','=[Q]@row*130':'$13,759,200.00','=[Q]2*135':'$432,000.00'};
 const p=clipboardPayload(rows,cols,(r,c)=>shown[r.cells[c.id]]??r.cells[c.id],(r,c)=>r.cells[c.id]);
 assert.ok(!p.text.includes('=['),'external apps never receive internal formula syntax');
 assert.deepEqual(parseTSV(p.text),[['105,840','$13,759,200.00','Line 1\nLine 2'],['3,200','$432,000.00','a "quoted" <b>']]);
 assert.match(p.html,/<td>\$13,759,200\.00<\/td>/);assert.match(p.html,/Line 1<br>Line 2/);assert.match(p.html,/&lt;b&gt;/);
 const pasted=internalPasteMatrix(p,f=>f.replace('@row','@row/*shifted*/'));
 assert.equal(pasted[0][1],'=[Q]@row/*shifted*/*130');assert.equal(pasted[0][0],'105,840');
});
