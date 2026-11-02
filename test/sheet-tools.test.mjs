import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../lib/seed.mjs';
import {columnTypes,parseCell,validateCell,cellValue} from '../lib/columns.mjs';
import {createCalculator} from '../lib/formulas.mjs';
import {assertUnlocked,matchesConditions,sortRows,cellFormat} from '../lib/sheet-tools.mjs';
import {normalizeMetadata,collectMentions,runWorkflows} from '../lib/workflows.mjs';
const c=(type,id=type)=>({id,name:id,type,options:[],formula:''});
test('rich cells validate ranges, multiple values, URLs and coordinates',()=>{
 const vals={people:['Alex','Sam'],multiselect:['One','Two'],tags:['urgent'],timeline:{start:'2026-11-01',end:'2026-11-08'},link:{url:'https://example.com',label:'Brief'},location:{address:'Austin',lat:30.2,lng:-97.7},connected:[{sheetId:'s',rowId:'r'}]};
 for(const [type,v] of Object.entries(vals))assert.doesNotThrow(()=>validateCell(c(type),parseCell(c(type),v)));
 assert.deepEqual(parseCell(c('people'),'Alex, Sam, Alex'),['Alex','Sam']);
 assert.throws(()=>validateCell(c('timeline'),{start:'2026-11-08',end:'2026-11-01'}));
 assert.throws(()=>validateCell(c('date'),'2026-02-30'));
 assert.throws(()=>validateCell(c('link'),{url:'javascript:alert(1)',label:'bad'}));
 assert.throws(()=>validateCell(c('location'),{address:'x',lat:100,lng:0}));
 assert.throws(()=>validateCell(c('rating'),6));assert.equal(parseCell(c('number'),0),0);
 assert.ok(columnTypes.length>=29);
});
test('linked rows resolve current names and rich values remain usable by formulas',()=>{
 const state=seed(),s=state.sheets[0],r=s.rows[0],link=c('connected');s.columns.push(link,c('people'),c('number','Count'));r.cells.connected=[{sheetId:s.id,rowId:s.rows[1].id}];r.cells.people=['Alex','Sam'];r.cells.Count='=LEN([people]@row)';
 assert.equal(cellValue(state,s,r,link),s.rows[1].cells[s.columns[0].id]);
 s.rows[1].cells[s.columns[0].id]='Renamed source';assert.equal(cellValue(state,s,r,link),'Renamed source');assert.equal(createCalculator(state).get(s,r,s.columns.at(-1)),9);
 s.rows.splice(1,1);assert.equal(cellValue(state,s,r,link),'[Deleted row]');
});
test('auto numbers and audit fields stay stable across edits and deletion',()=>{
 const before=seed(),state=structuredClone(before);normalizeMetadata(before,state,'Alex','2026-11-02T10:00:00Z');const s=state.sheets[0],first=s.rows[0];assert.equal(first.itemNumber,1);assert.equal(first.createdBy,'Alex');
 const next=structuredClone(state);next.sheets[0].rows.shift();next.sheets[0].rows.push({...structuredClone(first),id:'new',cells:{}});normalizeMetadata(state,next,'Sam','2026-11-02T11:00:00Z');assert.equal(next.sheets[0].rows[0].itemNumber,2);assert.equal(next.sheets[0].rows.at(-1).itemNumber,9);assert.equal(next.sheets[0].rows[0].createdBy,'Alex');
});
test('locks reject edit, removal, reparent and column formula changes but permit collaboration',()=>{
 const before=seed();before.sheets[0].rows[0].locked=true;
 for(const change of [s=>s.rows[0].cells[s.columns[0].id]='Oops',s=>s.rows.shift(),s=>s.rows[0].parentId=s.rows[1].id,s=>s.columns[1].formula='=1']){const next=structuredClone(before);change(next.sheets[0]);assert.throws(()=>assertUnlocked(before,next),/Unlock/);}
 const collaboration=structuredClone(before);collaboration.sheets[0].rows[0].comments.push({id:'note',text:'Allowed'});assert.doesNotThrow(()=>assertUnlocked(before,collaboration));
 collaboration.sheets[0].rows[0].locked=false;assert.doesNotThrow(()=>assertUnlocked(before,collaboration));
 collaboration.sheets[0].rows[0].cells[collaboration.sheets[0].columns[0].id]='Bypass';assert.throws(()=>assertUnlocked(before,collaboration));
});
test('filters handle row properties, dates, blank zero and all/any',()=>{
 const s={columns:[c('number','n'),c('date','due')]},r={cells:{n:0,due:'2026-11-05'},locked:true,comments:[],attachments:[{}]},get=(s,r,c)=>r.cells[c.id];
 assert.equal(matchesConditions(s,r,[{columnId:'n',operator:'empty'}],'all',get),false);
 assert.equal(matchesConditions(s,r,[{columnId:'$locked',operator:'equals',value:'true'},{columnId:'due',operator:'next7'}],'all',get,'2026-11-02'),true);
 assert.equal(matchesConditions(s,r,[{columnId:'n',operator:'gt',value:1},{columnId:'$attachments',operator:'gt',value:0}],'any',get),true);
});
test('multi-sort keeps child groups with parents and uses secondary keys',()=>{
 const s={columns:[c('text','name'),c('number','n')]},rows=[{id:'b',cells:{name:'B',n:1}},{id:'bc',parentId:'b',cells:{name:'A',n:2}},{id:'a',cells:{name:'A',n:3}},{id:'a2',cells:{name:'A',n:1}}];
 assert.deepEqual(sortRows(s,rows,[{columnId:'name',direction:'asc'},{columnId:'n',direction:'asc'}],(s,r,c)=>r.cells[c.id]).map(r=>r.id),['a2','a','b','bc']);assert.equal(rows[0].id,'b');
});
test('higher format rules win per property and disabled rules do not apply',()=>{
 const col=c('number','n'),s={columns:[col],formatRules:[{enabled:false,conditions:[],format:{fill:'#000000'}},{conditions:[],format:{fill:'#ff0000'}},{conditions:[],format:{fill:'#00ff00',bold:true}}]},r={cells:{n:0},format:{italic:true}},f=cellFormat(s,r,col,(s,r,c)=>r.cells[c.id]);assert.deepEqual(f,{italic:true,fill:'#ff0000',bold:true});
});
test('mentions resolve directory people and are only notified once',()=>{
 const before=seed(),after=structuredClone(before);after.people=[{id:'alex',name:'Alex'}];after.sheets[0].rows[0].comments.push({id:'note',text:'Please check @[Alex] and @unresolved',by:'Sam'});collectMentions(before,after,'Sam');assert.equal(after.inbox.length,1);assert.deepEqual(after.sheets[0].rows[0].comments.at(-1).mentions,['alex']);const next=structuredClone(after);collectMentions(after,next,'Sam');assert.equal(next.inbox.length,1);
});
test('workflows run ordered actions once, honor locks, and create local requests',()=>{
 const before=seed(),after=structuredClone(before),s=after.sheets[0],r=s.rows[0],status=s.columns.find(c=>c.name==='Status'),done=s.columns.find(c=>c.name==='Done');s.automations=[{id:'a',name:'Review',trigger:'change',columnId:status.id,equals:'Review',conditions:[],actions:[{type:'set',columnId:done.id,value:'true'},{type:'approval',assignees:'Alex, Sam',message:'Review this'},{type:'lock'}]}];r.cells[status.id]='Review';assert.equal(runWorkflows(before,after),1);assert.equal(r.cells[done.id],true);assert.equal(r.locked,true);assert.equal(after.requests.length,1);assert.equal(after.inbox.length,2);assert.equal(runWorkflows(after,structuredClone(after)),0);
 const lockedBefore=structuredClone(before);lockedBefore.sheets[0].rows[0].locked=true;const locked=structuredClone(lockedBefore);locked.sheets[0].automations=[{id:'date',name:'Due',trigger:'date',columnId:s.columns.find(c=>c.name==='Due').id,actions:[{type:'set',columnId:done.id,value:'true'},{type:'notify',assignees:'Alex'}]}];locked.sheets[0].rows[0].cells[locked.sheets[0].automations[0].columnId]='2026-01-01';runWorkflows(lockedBefore,locked,{scheduled:true,now:'2026-11-02T12:00:00Z'});assert.equal(locked.sheets[0].rows[0].cells[done.id],false);const count=locked.inbox.length;runWorkflows(locked,locked,{scheduled:true,now:'2026-11-02T12:01:00Z'});assert.equal(locked.inbox.length,count);
});
test('dropdown sorting follows option order and blanks remain last in both directions',()=>{const col={...c('select','status'),options:['Critical','Normal','Low']},s={columns:[col]},rows=['Low','','Critical','Normal'].map((status,i)=>({id:String(i),cells:{status}})),get=(s,r,c)=>r.cells[c.id];assert.deepEqual(sortRows(s,rows,[{columnId:'status',direction:'asc'}],get).map(r=>r.cells.status),['Critical','Normal','Low','']);assert.deepEqual(sortRows(s,rows,[{columnId:'status',direction:'desc'}],get).map(r=>r.cells.status),['Low','Normal','Critical','']);});
