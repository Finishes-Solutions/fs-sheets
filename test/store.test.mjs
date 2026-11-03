import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {packState,readStored,writeState,writePacked,migrateToSheetStore,isSplit,PLACEHOLDER} from '../lib/store.mjs';

const sample=()=>({schemaVersion:1,workspaces:[{id:'w',name:'W'}],folders:[],sheets:[
  {id:'s1',name:'Budget',rows:[{id:'r1',cells:{a:'"sheets":"'+PLACEHOLDER+'" typed by a user'}}]},
  {id:'s2',name:'Second',rows:[]}],reports:[],activity:[]});
const legacyDb=state=>{const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, body TEXT NOT NULL)');db.prepare('INSERT INTO state VALUES (1,7,?)').run(JSON.stringify(state));return db;};

test('packed text is byte-identical to JSON.stringify, even when a cell contains the placeholder text', () => {
  const s=sample();assert.equal(packState(s).body,JSON.stringify(s));
});

test('migration backs up first, converts, and reads back identical text', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'store-'));
  try{
    const s=sample(),db=legacyDb(s);
    const m=await migrateToSheetStore(db,{backupRoot:dir});
    assert.equal(m.migrated,true);assert.equal(m.sheets,2);assert.ok(isSplit(db));
    const r=readStored(db);assert.equal(r.revision,7);assert.equal(r.body,JSON.stringify(s));
    const b=new DatabaseSync(m.backupFile,{readOnly:true});
    assert.equal(b.prepare('SELECT body FROM state').get().body,JSON.stringify(s),'backup holds the original single-row text');b.close();
    assert.equal((await migrateToSheetStore(db,{backupRoot:dir})).migrated,false,'second run is a no-op');
    assert.equal((await readdir(dir)).length,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('saves rewrite only the sheets that changed and drop deleted sheets', async () => {
  const db=legacyDb(sample());await migrateToSheetStore(db,{});
  let {known}=readStored(db);
  const next=sample();next.sheets[1].name='Renamed';
  db.exec('BEGIN');const w=writePacked(db,8,packState(next),known);db.exec('COMMIT');
  assert.equal(w.written,1);
  next.sheets.pop();
  db.exec('BEGIN');writeState(db,9,next,w.known);db.exec('COMMIT');
  assert.equal(db.prepare('SELECT count(*) n FROM sheet_store').get().n,1);
  assert.equal(readStored(db).body,JSON.stringify(next));
});

test('sheet order is preserved, and a missing sheet row is reported instead of silently dropped', async () => {
  const db=legacyDb(sample());await migrateToSheetStore(db,{});
  const s=sample();s.sheets.reverse();db.exec('BEGIN');writeState(db,8,s);db.exec('COMMIT');
  assert.equal(readStored(db).body,JSON.stringify(s));
  db.prepare("DELETE FROM sheet_store WHERE id='s2'").run();
  assert.throws(()=>readStored(db),/missing sheet s2/);
});
