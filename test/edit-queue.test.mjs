import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditQueue} from '../public/edit-queue.mjs';

// A fake server: applies its own metadata (like normalizeMetadata/activity) and can be told to reject.
function harness({rejectWith}={}){
 let serverState={rows:[{id:'a',v:1}],activity:[]},revision=1,ids=0;const sent=[];let state=structuredClone(serverState);const gates=[];
 const q=createEditQueue({getState:()=>state,setState:v=>{state=v;},newId:()=>'id'+(++ids),
  send:async(next,label)=>{sent.push(label);await new Promise(r=>gates.push(r));if(rejectWith?.(label)){const e=Error('rejected '+label);e.status=rejectWith(label);throw e;}
   const saved=structuredClone(next);saved.activity=[...serverState.activity,label];serverState=saved;revision++;return structuredClone(saved);}});
 const release=async()=>{while(!gates.length)await new Promise(r=>setImmediate(r));gates.shift()();await new Promise(r=>setImmediate(r));};
 return {q,get state(){return state;},get server(){return serverState;},setServer(v){serverState=structuredClone(v);revision++;},sent,release,get revision(){return revision;}};
}

test('edits display immediately, save in order, and keep server-added metadata',async()=>{
 const h=harness();
 const p1=h.q.mutate('one',n=>{n.rows[0].v=2;}),p2=h.q.mutate('two',n=>{n.rows[0].v=3;});
 assert.equal(h.state.rows[0].v,3,'both queued edits are visible before any save completes');
 assert.equal(h.q.pending,2);
 await h.release();assert.equal(await p1,true);
 assert.deepEqual(h.state.activity,['one'],'server metadata from save 1 is kept while save 2 is pending');
 assert.equal(h.state.rows[0].v,3);
 await h.release();assert.equal(await p2,true);
 assert.deepEqual(h.server.activity,['one','two'],'save 2 was rebuilt on confirmed state, not the stale client copy');
 assert.equal(h.q.pending,0);assert.deepEqual(h.state,h.server);
});

test('replayed edits reuse generated ids so later edits can target new rows',async()=>{
 const h=harness();
 h.q.mutate('add',n=>{n.rows.push({id:h.q.id(),v:0});});
 const newId=h.state.rows[1].id;
 h.q.mutate('edit new row',n=>{n.rows.find(r=>r.id===newId).v=9;});
 await h.release();await h.release();
 assert.equal(h.server.rows[1].id,newId);assert.equal(h.server.rows[1].v,9);
});

test('a rejected save is removed from the display and later edits still apply',async()=>{
 const h=harness({rejectWith:l=>l==='bad'?400:0});
 const bad=h.q.mutate('bad',n=>{n.rows[0].v='bad';}),good=h.q.mutate('good',n=>{n.rows.push({id:'b',v:5});});
 assert.equal(h.state.rows[0].v,'bad');
 await h.release();assert.equal(await bad,false);
 assert.equal(h.state.rows[0].v,1,'rejected value no longer shown');assert.equal(h.state.rows[1].v,5,'queued edit still shown');
 await h.release();assert.equal(await good,true);
 assert.equal(h.server.rows[0].v,1);assert.equal(h.server.rows.length,2);
});

test('a conflict blocks the rest of the queue instead of overwriting newer work',async()=>{
 const h=harness({rejectWith:l=>l==='first'?409:0});
 const a=h.q.mutate('first',n=>{n.rows[0].v=7;}),b=h.q.mutate('second',n=>{n.rows[0].v=8;});
 await h.release();
 assert.equal(await a,false);assert.equal(await b,false);
 assert.deepEqual(h.sent,['first'],'second edit never reached the server');
 assert.ok(h.q.conflict);assert.equal(h.state.rows[0].v,1);
 assert.equal(await h.q.mutate('third',n=>{n.rows[0].v=9;}),false,'new edits are refused until the conflict is resolved');
 h.q.clearConflict();
});

test('edits that throw are rejected before they are queued',async()=>{
 const h=harness();
 await assert.rejects(h.q.mutate('locked',()=>{throw Error('Row is locked');}),/locked/);
 assert.equal(h.q.pending,0);assert.equal(h.sent.length,0);
});

test('undo results replace the confirmed base while later edits are pending',async()=>{
 const h=harness();
 const a=h.q.mutate('A',n=>{n.rows[0].v='A';});
 const undo=h.q.after(async()=>{const reverted={rows:[{id:'a',v:1}],activity:['undo']};h.setServer(reverted);h.q.replaceConfirmed(structuredClone(reverted));});
 const b=h.q.mutate('B',n=>{n.rows.push({id:'b',v:'B'});});
 await h.release();await a;await undo;
 assert.equal(h.state.rows[0].v,1,'undo is reflected');assert.equal(h.state.rows[1].v,'B','pending edit still shown');
 await h.release();await b;
 assert.equal(h.server.rows[0].v,1,'pending edit did not resurrect the undone change');
 assert.deepEqual(h.server.activity,['undo','B']);
});

test('a failing edit queued behind others leaves the display intact',async()=>{
 const h=harness();
 h.q.mutate('one',n=>{n.rows[0].v=2;});
 await assert.rejects(h.q.mutate('half',n=>{n.rows[0].v='partial';throw Error('stop');}),/stop/);
 assert.equal(h.state.rows[0].v,2,'partial change from the failed edit is discarded');
 assert.equal(h.q.pending,1);
 await h.release();
 assert.equal(h.server.rows[0].v,2);
});
