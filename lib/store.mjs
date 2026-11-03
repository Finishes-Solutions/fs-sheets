// Workspace storage. The workspace is still one JSON document to the rest of the app, but on disk
// each sheet lives in its own row (sheet_store) and the `state` row keeps everything else with a
// placeholder where the sheets array goes. A save rewrites only the sheets whose JSON changed.
//
// The assembled text is byte-identical to JSON.stringify(state), so history patches, revision
// checks and API responses are unaffected.
import {backup} from 'node:sqlite';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

export const PLACEHOLDER='__fs_sheet_store__';
const MARK='"sheets":"'+PLACEHOLDER+'"';

const columns=(db,table)=>db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
export function ensureSchema(db){
 db.exec('CREATE TABLE IF NOT EXISTS sheet_store (id TEXT PRIMARY KEY, body TEXT NOT NULL)');
 if(!columns(db,'state').includes('sheet_ids'))db.exec('ALTER TABLE state ADD COLUMN sheet_ids TEXT');
}
export function isSplit(db){
 if(!columns(db,'state').includes('sheet_ids'))return false;
 return !!db.prepare('SELECT sheet_ids FROM state WHERE id=1').get()?.sheet_ids;
}
const splice=(meta,sheetsJSON)=>{const i=meta.indexOf(MARK);if(i<0||meta.indexOf(MARK,i+1)>=0)throw Error('Stored workspace is damaged (sheet placeholder).');return meta.slice(0,i)+'"sheets":'+sheetsJSON+meta.slice(i+MARK.length);};

// Serializes a state once: per-sheet JSON, the remainder, and the full body.
export function packState(state,cache=null){
 if(!Array.isArray(state?.sheets))throw Error('Project is missing required collections');
 const sheets=state.sheets.map(s=>[s.id,cache?.get(s)??JSON.stringify(s)]);
 const meta=JSON.stringify({...state,sheets:PLACEHOLDER});
 return {ids:sheets.map(([id])=>id),sheets,meta,body:splice(meta,'['+sheets.map(([,j])=>j).join(',')+']')};
}

// Returns {revision, body, known} where `known` maps sheet id → stored JSON (for change detection).
export function readStored(db){
 const hasIds=columns(db,'state').includes('sheet_ids');
 const r=db.prepare(`SELECT revision,body${hasIds?',sheet_ids':''} FROM state WHERE id=1`).get();
 if(!r)return null;
 if(!r.sheet_ids)return {revision:r.revision,body:r.body,known:null};
 const ids=JSON.parse(r.sheet_ids),known=new Map();
 for(const row of db.prepare('SELECT id,body FROM sheet_store').iterate())known.set(row.id,row.body);
 const parts=ids.map(id=>{const j=known.get(id);if(j===undefined)throw Error('Stored workspace is damaged (missing sheet '+id+').');return j;});
 return {revision:r.revision,body:splice(r.body,'['+parts.join(',')+']'),known};
}

// Writes a packed state. Call inside a transaction. `known` (optional) is the id → JSON map of
// what is on disk now; unchanged sheets are skipped. Returns the new known map and write count.
export function writePacked(db,revision,packed,known=null){
 ensureSchema(db);
 const upsert=db.prepare('INSERT INTO sheet_store(id,body) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body');
 let written=0;const next=new Map();
 for(const [id,json] of packed.sheets){if(!known||known.get(id)!==json){upsert.run(id,json);written++;}next.set(id,json);}
 if(!known||[...known.keys()].some(id=>!next.has(id)))db.prepare('DELETE FROM sheet_store WHERE id NOT IN (SELECT value FROM json_each(?))').run(JSON.stringify(packed.ids));
 db.prepare('UPDATE state SET revision=?,body=?,sheet_ids=? WHERE id=1').run(revision,packed.meta,JSON.stringify(packed.ids));
 return {known:next,written};
}
export const writeState=(db,revision,state,known=null)=>writePacked(db,revision,packState(state),known);

// One-time conversion from the single-row format. Makes a consistent SQLite backup first, then
// converts in one transaction and verifies the reassembled text is identical before committing.
export async function migrateToSheetStore(db,{backupRoot,now=new Date()}={}){
 if(isSplit(db))return {migrated:false};
 const row=db.prepare('SELECT revision,body FROM state WHERE id=1').get();if(!row)return {migrated:false};
 let backupFile=null;
 if(backupRoot){const dir=path.join(backupRoot,'before-sheet-store-'+now.toISOString().replace(/[:.]/g,'-')+'-'+Math.random().toString(36).slice(2,8));await mkdir(dir,{recursive:true});backupFile=path.join(dir,'fs-sheet.sqlite');await backup(db,backupFile);}
 db.exec('BEGIN IMMEDIATE');
 try{
  const latest=db.prepare('SELECT revision,body FROM state WHERE id=1').get();
  if(latest.revision!==row.revision||latest.body!==row.body)throw Error('Workspace changed while converting storage; restart to retry.');
  const state=JSON.parse(latest.body),packed=packState(state),canonical=JSON.stringify(state);
  if(packed.body!==canonical)throw Error('Storage conversion check failed (text differs); nothing was changed.');
  writePacked(db,latest.revision,packed,null);
  const check=readStored(db);
  if(check.body!==canonical||check.revision!==latest.revision)throw Error('Storage conversion check failed (read-back differs); nothing was changed.');
  db.exec('COMMIT');
  return {migrated:true,backupFile,sheets:packed.ids.length,identical:latest.body===canonical};
 }catch(e){db.exec('ROLLBACK');if(backupFile)e.message+=' Backup: '+backupFile;throw e;}
}
