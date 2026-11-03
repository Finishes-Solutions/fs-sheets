import test from 'node:test';
import assert from 'node:assert/strict';
import {diffState,applyPatch,isEmptyPatch,assertPatchShape} from '../lib/state-patch.mjs';

const clone=v=>JSON.parse(JSON.stringify(v));
function workspace(rows=20){
 const cols=[{id:'c1',name:'Item',type:'text'},{id:'c2',name:'Qty',type:'number'},{id:'c3',name:'Cost',type:'currency'}];
 return {schemaVersion:1,workspaces:[{id:'w',name:'W'}],activity:[{id:'a0',message:'start'}],reports:[],sheets:[
  {id:'s1',name:'Budget',columns:cols,rows:Array.from({length:rows},(_,i)=>({id:'r'+i,parentId:i%5?'r'+(i-i%5):null,cells:{c1:'Line '+i,c2:i*3,c3:i%4?'=[Qty]@row*2':''},comments:[],attachments:[]}))},
  {id:'s2',name:'Schedule',columns:cols.slice(0,2),rows:[{id:'x1',cells:{c1:'Task',c2:1},comments:[],attachments:[]}]}]};
}
let seed=7;const rnd=n=>{seed=(seed*1103515245+12345)%2147483648;return seed%n;};
function randomEdit(s){
 const sh=s.sheets[rnd(s.sheets.length)],k=rnd(9);
 if(k<4&&sh.rows.length){const r=sh.rows[rnd(sh.rows.length)];r.cells[['c1','c2','c3'][rnd(3)]]=rnd(3)?'v'+rnd(1000):rnd(1000);}
 else if(k===4&&sh.rows.length){sh.rows.splice(rnd(sh.rows.length),1);}
 else if(k===5){sh.rows.splice(rnd(sh.rows.length+1),0,{id:'n'+rnd(1e9),cells:{c1:'new'},comments:[],attachments:[]});}
 else if(k===6&&sh.rows.length>1){const [r]=sh.rows.splice(rnd(sh.rows.length),1);sh.rows.splice(rnd(sh.rows.length+1),0,r);}
 else if(k===7&&sh.rows.length){const r=sh.rows[rnd(sh.rows.length)];if(rnd(2))r.locked=true;else delete r.parentId;}
 else {sh.columns=[...sh.columns,{id:'k'+rnd(1e6),name:'Col '+rnd(1e6),type:'text'}];s.activity.push({id:'a'+rnd(1e6)});}
}

test('random edits round-trip exactly through diff + apply',()=>{
 for(let trial=0;trial<300;trial++){
  const base=workspace(12),next=clone(base);const edits=1+rnd(6);for(let i=0;i<edits;i++)randomEdit(next);
  const patch=JSON.parse(JSON.stringify(diffState(base,next)));
  assertPatchShape(patch);
  assert.deepEqual(applyPatch(clone(base),patch),next,'trial '+trial);
  // reapplying is idempotent (every field already equals its "after" value)
  assert.deepEqual(applyPatch(applyPatch(clone(base),patch),patch),next);
  // the reverse patch restores the base exactly (undo)
  assert.deepEqual(applyPatch(clone(next),diffState(next,base)),base);
 }
});

test('an unchanged workspace produces an empty patch',()=>{const a=workspace();assert.ok(isEmptyPatch(diffState(a,clone(a))));});

test('edits from two tabs to different cells, rows and columns merge',()=>{
 const base=workspace();
 const tabA=clone(base);tabA.sheets[0].rows[2].cells.c2=999;
 const tabB=clone(base);tabB.sheets[0].rows[2].cells.c1='Renamed';tabB.sheets[0].rows[7].cells.c3='=1';tabB.sheets[0].rows.splice(4,0,{id:'nb',cells:{c1:'B row'},comments:[],attachments:[]});
 const server=applyPatch(clone(base),diffState(base,tabA));
 const merged=applyPatch(clone(server),diffState(base,tabB));
 assert.equal(merged.sheets[0].rows[2].cells.c2,999,'tab A kept');
 assert.equal(merged.sheets[0].rows[2].cells.c1,'Renamed','tab B merged into the same row');
 assert.equal(merged.sheets[0].rows[4].id,'nb','added row lands where tab B put it');
 const both=clone(base);both.sheets[0].rows[2].cells.c2=999;both.sheets[0].rows[2].cells.c1='Renamed';both.sheets[0].rows[7].cells.c3='=1';both.sheets[0].rows.splice(4,0,{id:'nb',cells:{c1:'B row'},comments:[],attachments:[]});
 assert.deepEqual(merged,both);
});

test('rows added concurrently by two tabs are both kept',()=>{
 const base=workspace(3);
 const a=clone(base);a.sheets[0].rows.push({id:'na',cells:{c1:'A'},comments:[],attachments:[]});
 const b=clone(base);b.sheets[0].rows.push({id:'nb',cells:{c1:'B'},comments:[],attachments:[]});
 const out=applyPatch(applyPatch(clone(base),diffState(base,a)),diffState(base,b));
 assert.deepEqual(out.sheets[0].rows.map(r=>r.id),['r0','r1','r2','na','nb']);
});

test('the same cell edited in two tabs is a 409 conflict and leaves the target untouched',()=>{
 const base=workspace();
 const a=clone(base);a.sheets[0].rows[3].cells.c2=1;const b=clone(base);b.sheets[0].rows[3].cells.c2=2;
 const server=applyPatch(clone(base),diffState(base,a)),snapshot=JSON.stringify(server);
 const target=clone(server);
 assert.throws(()=>applyPatch(target,diffState(base,b)),e=>e.status===409&&/row 4 in Budget/.test(e.message));
 assert.equal(JSON.stringify(server),snapshot);
 // identical concurrent edits are not conflicts
 const same=clone(base);same.sheets[0].rows[3].cells.c2=1;assert.doesNotThrow(()=>applyPatch(clone(server),diffState(base,same)));
});

test('deleting a row someone else edited, or editing a deleted row, conflicts',()=>{
 const base=workspace();
 const edit=clone(base);edit.sheets[0].rows[1].cells.c1='changed';
 const del=clone(base);del.sheets[0].rows.splice(1,1);
 assert.throws(()=>applyPatch(applyPatch(clone(base),diffState(base,edit)),diffState(base,del)),/409|Someone else/);
 assert.throws(()=>applyPatch(applyPatch(clone(base),diffState(base,del)),diffState(base,edit)),e=>e.status===409);
});

test('column definition changes conflict with concurrent column changes',()=>{
 const base=workspace();
 const a=clone(base);a.sheets[0].columns[1].name='Quantity';const b=clone(base);b.sheets[0].columns[2].width=200;
 assert.throws(()=>applyPatch(applyPatch(clone(base),diffState(base,a)),diffState(base,b)),e=>e.status===409&&/columns/.test(e.message));
});

test('malformed patches are rejected with 400',()=>{
 for(const p of [null,[],{sheets:{}},{sheets:[{}]},{sheets:[{id:'s1',rows:[{id:'r1',cells:[]}]}]},{top:{x:1}},{sheetOrder:{a:[1],b:[]}}])
  assert.throws(()=>assertPatchShape(p),e=>e.status===400);
});
