import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSchedule,dependencyRefs} from '../lib/critical-path.mjs';
import {autoSchedule,rollUpParents} from '../lib/scheduling.mjs';

const cols=[{id:'t',name:'Task',type:'text'},{id:'s',name:'Start',type:'date'},{id:'f',name:'Finish',type:'date'},{id:'d',name:'Duration',type:'number'},{id:'p',name:'Predecessors',type:'dependency'}];
const cfg={startColumnId:'s',endColumnId:'f',durationColumnId:'d',dependencyColumnId:'p',weekend:'0000011',holidays:[]};
const row=(id,s,f,d,p=[],parentId=null)=>({id,parentId,cells:{t:id,s,f,d,p},comments:[],attachments:[]});
// Mon 2026-11-02 … : A(3d) → B(5d) → D(2d); A → C(1d) → D. C has slack.
const sheet=()=>({id:'sh',name:'Plan',columns:cols,rows:[row('A','2026-11-02','2026-11-04',3),row('B','2026-11-05','2026-11-11',5,[{rowId:'A',type:'FS',lag:0}]),row('C','2026-11-05','2026-11-05',1,[{rowId:'A',type:'FS',lag:0}]),row('D','2026-11-12','2026-11-13',2,[{rowId:'B',type:'FS',lag:0},{rowId:'C',type:'FS',lag:0}])],forms:[],automations:[]});

test('critical path: the longest chain has no slack; the short branch shows its slack', () => {
  const a=analyzeSchedule(sheet(),cfg);
  assert.deepEqual([...a.critical].sort(),['A','B','D']);
  assert.equal(a.tasks.get('C').float,4,'C can slip 4 working days');
  assert.equal(a.finish,'2026-11-13');
  assert.equal(a.links.length,4);assert.equal(a.links.filter(l=>l.critical).length,2);
});

test('text predecessors like "2FS+1" are understood', () => {
  const s=sheet();s.rows[3].cells.p='2FS+1, 3';
  assert.deepEqual(dependencyRefs(s,s.rows[3],cols[4]),[{rowId:'B',type:'FS',lag:1},{rowId:'C',type:'FS',lag:0}]);
});

test('auto-schedule pushes successors when a duration grows, rolls up parents, and never blocks a save on errors', () => {
  const before={sheets:[{...sheet(),scheduleConfig:{...cfg,auto:true}}]};
  const after=structuredClone(before);after.sheets[0].rows[1].cells.d=7;
  autoSchedule(before,after);
  const r=Object.fromEntries(after.sheets[0].rows.map(x=>[x.id,x.cells.f]));
  assert.equal(r.B,'2026-11-13');assert.equal(r.D,'2026-11-17','D moves past the weekend');
  const loop=structuredClone(before);loop.sheets[0].rows[0].cells.p=[{rowId:'D',type:'FS',lag:0}];
  autoSchedule(before,loop);assert.match(loop.sheets[0].scheduleError,/Circular/);
  const s={rows:[{id:'P',cells:{}},row('x','2026-11-02','2026-11-04',3,[],'P'),row('y','2026-11-09','2026-11-10',2,[],'P')]};
  rollUpParents(s,cfg);assert.deepEqual([s.rows[0].cells.s,s.rows[0].cells.f],['2026-11-02','2026-11-10']);
});
