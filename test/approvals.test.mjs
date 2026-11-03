import test from 'node:test';
import assert from 'node:assert/strict';
import {recordApprovals,decide,APPROVAL_COLUMN} from '../lib/approvals.mjs';

const base=()=>({sheets:[{id:'s',rows:[{id:'r',cells:{}}]}],requests:[]});
test('requests, each decision and the outcome are written to row history', () => {
  const before=base(),after=base();
  after.requests.push({id:'q',sheetId:'s',rowId:'r',type:'approval',title:'Change order #12',assignees:['Pat','Lee'],status:'Open',by:'Sam',at:'2026-11-03T10:00:00Z',responses:[]});
  recordApprovals(before,after,'Sam','2026-11-03T10:00:00Z');
  const h=()=>after.sheets[0].rows[0].cellHistory.filter(e=>e.col===APPROVAL_COLUMN).map(e=>e.by+': '+e.to);
  assert.deepEqual(h(),['Sam: Approval requested from Pat, Lee: Change order #12']);
  const b2=structuredClone(after);decide(after.requests[0],{by:'Pat',decision:'Approved',note:'OK under $5k',id:'a1'});
  assert.equal(after.requests[0].status,'Open','still waiting on Lee');
  recordApprovals(b2,after,'Pat');
  const b3=structuredClone(after);decide(after.requests[0],{by:'Lee',decision:'Approved',id:'a2'});
  assert.equal(after.requests[0].status,'Approved');recordApprovals(b3,after,'Lee');
  assert.deepEqual(h().slice(1),['Pat: Approved — OK under $5k (Change order #12)','Lee: Approved (Change order #12)','Lee: Approval approved: Change order #12']);
});

test('only listed approvers can respond, once, while the request is open; one decline declines', () => {
  const q={assignees:['Pat','Lee'],status:'Open',responses:[]};
  assert.throws(()=>decide(q,{by:'Sam',decision:'Approved',id:'x'}),/Only Pat, Lee/);
  decide(q,{by:'pat',decision:'Declined',note:'Over budget',id:'1'});assert.equal(q.status,'Declined');
  assert.throws(()=>decide(q,{by:'Lee',decision:'Approved',id:'2'}),/already declined/);
  const q2={assignees:['Pat'],status:'Open',responses:[]};decide(q2,{by:'Pat',decision:'Approved',id:'1'});assert.throws(()=>decide({...q2,status:'Open'},{by:'Pat',decision:'Approved',id:'3'}),/already responded/);
});
