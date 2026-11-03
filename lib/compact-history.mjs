// Older versions stored every undo step as a full copy of the workspace (about 16 MB each for a
// workspace with the 11,444-row budget), so 31 undo steps made the database ~590 MB, and every
// backup and Dropbox sync carried all of it. Newer versions store only what changed ("patch").
// This converts the old full copies into patches, one time, and checks each one: applying the new
// patch must give back exactly the workspace the old copy held (activity log aside, which undo
// rewrites anyway). If any step does not check out, nothing is changed.
import {applyPatch,historyPatch} from './state-patch.mjs';

const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
const withoutActivity=s=>{const {activity,...rest}=s;return rest;};

// Returns {converted, before, after} sizes in bytes. `currentBody` is the workspace JSON as stored now.
export function convertLegacyHistory(db,currentBody,{table='history'}={}){
 const legacy=db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE kind='state'`).get().n;
 if(!legacy)return {converted:0};
 const rows=db.prepare(`SELECT id,body,kind FROM ${table} ORDER BY id DESC`).all();
 const sizeBefore=rows.reduce((n,r)=>n+r.body.length,0);
 let after=JSON.parse(currentBody);const updates=[];
 for(const r of rows){
  let before;
  if(r.kind==='patch')before=applyPatch(structuredClone(after),JSON.parse(r.body),{force:true});
  else{
   before=JSON.parse(r.body);
   const patch=historyPatch(after,before),check=applyPatch(structuredClone(after),structuredClone(patch),{force:true});
   if(stable(withoutActivity(check))!==stable(withoutActivity(before)))throw Error(`Undo step ${r.id} could not be converted exactly; nothing was changed.`);
   updates.push([r.id,JSON.stringify(patch)]);
  }
  after=before;
 }
 const stmt=db.prepare(`UPDATE ${table} SET body=?, kind='patch' WHERE id=? AND kind='state'`);
 db.exec('BEGIN IMMEDIATE');
 try{for(const [id,body] of updates)stmt.run(body,id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 const sizeAfter=db.prepare(`SELECT COALESCE(SUM(LENGTH(body)),0) n FROM ${table}`).get().n;
 return {converted:updates.length,before:sizeBefore,after:sizeAfter};
}

// Gives unused space back to the disk when most of the file is empty (after the conversion above).
export function compactIfMostlyEmpty(db,{minFreeBytes=64*1024*1024,minFreeShare=0.4}={}){
 const pageSize=db.prepare('PRAGMA page_size').get().page_size,pages=db.prepare('PRAGMA page_count').get().page_count,free=db.prepare('PRAGMA freelist_count').get().freelist_count;
 const freeBytes=free*pageSize;
 if(freeBytes<minFreeBytes||free/pages<minFreeShare)return {compacted:false,freeBytes};
 db.exec('VACUUM');
 const now=db.prepare('PRAGMA page_count').get().page_count*pageSize;
 return {compacted:true,from:pages*pageSize,to:now};
}
