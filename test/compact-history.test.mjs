import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {convertLegacyHistory,compactIfMostlyEmpty} from '../lib/compact-history.mjs';
import {applyPatch,historyPatch} from '../lib/state-patch.mjs';

const ws=rows=>({schemaVersion:1,workspaces:[{id:'w',name:'W'}],activity:[],sheets:[{id:'s1',name:'Budget',workspaceId:'w',columns:[{id:'c1',name:'Item'},{id:'c2',name:'Cost'}],rows}]});
const db=()=>{const d=new DatabaseSync(':memory:');d.exec("CREATE TABLE history (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL, created_at TEXT NOT NULL, client_id TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'state')");return d;};
const add=(d,body,kind='state')=>d.prepare("INSERT INTO history(body,created_at,kind) VALUES (?,?,?)").run(body,'2026-01-01',kind);

test('old full-copy undo steps become patches that restore the same workspace',()=>{
 const s0=ws([{id:'r1',cells:{c1:'Slab',c2:100}}]);
 const s1=ws([{id:'r1',cells:{c1:'Slab',c2:120},cellFormats:{c2:{bold:true}}}]);
 const s2=ws([{id:'r1',cells:{c1:'Slab',c2:120},cellFormats:{c2:{bold:true}}},{id:'r2',cells:{c1:'Frame',c2:50}}]);
 const s3=structuredClone(s2);s3.sheets[0].rows[1].cells.c2=75;
 const d=db();add(d,JSON.stringify(s0));add(d,JSON.stringify(s1));add(d,JSON.stringify(historyPatch(s3,s2)),'patch');
 const r=convertLegacyHistory(d,JSON.stringify(s3));
 assert.equal(r.converted,2);
 const rows=d.prepare('SELECT body,kind FROM history ORDER BY id DESC').all();
 assert.ok(rows.every(x=>x.kind==='patch'));
 let cur=structuredClone(s3);
 for(const [i,want] of [[0,s2],[1,s1],[2,s0]].map(([i,w])=>[i,w])){cur=applyPatch(cur,JSON.parse(rows[i].body),{force:true});assert.deepEqual(cur,want);}
});

test('nothing changes when there are no old undo steps',()=>{
 const d=db();add(d,'{}','patch');assert.deepEqual(convertLegacyHistory(d,JSON.stringify(ws([]))),{converted:0});
});

test('a step that cannot be reproduced exactly leaves every step untouched',()=>{
 const d=db();const s0=ws([{id:'r1',cells:{c1:'A'}}]);
 add(d,JSON.stringify(s0));add(d,'{"not":"a workspace"}');
 assert.throws(()=>convertLegacyHistory(d,JSON.stringify(ws([]))));
 assert.deepEqual(d.prepare("SELECT kind FROM history ORDER BY id").all().map(x=>x.kind),['state','state']);
});

test('compaction only runs when most of the file is empty',()=>{
 const d=db();assert.equal(compactIfMostlyEmpty(d).compacted,false);
 assert.equal(compactIfMostlyEmpty(d,{minFreeBytes:0,minFreeShare:0}).compacted,true);
});
