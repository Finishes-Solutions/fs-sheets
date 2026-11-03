// Named versions and automatic backups of the workspace. Each version is the workspace JSON,
// gzipped, plus a small sidecar with its name and a per-sheet summary. Restoring is per sheet and
// is an ordinary, undoable save — either as a copy beside the current sheet or replacing it (after
// automatically saving a "before restore" version). A whole-workspace rollback is deliberately not
// offered, so a restore can never overwrite other people's newer work in other sheets.
import {gzip,gunzip} from 'node:zlib';
import {promisify} from 'node:util';
import {mkdir,readdir,readFile,writeFile,rm,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {collectIds,remapIds} from './templates.mjs';
const zip=promisify(gzip),unzip=promisify(gunzip);

export const KINDS=['named','auto','before-restore'];
const DAY=86_400_000;
const sheetSummary=state=>(state.sheets||[]).map(s=>({id:s.id,name:s.name,rows:s.rows.length}));
const validId=id=>/^[0-9A-Za-z-]{8,80}$/.test(String(id||''));

export function createVersionStore(dir){
 const file=(id,ext)=>path.join(dir,id+ext);
 async function list(){
  let names=[];try{names=await readdir(dir);}catch(e){if(e.code==='ENOENT')return [];throw e;}
  const out=[];for(const n of names.filter(n=>n.endsWith('.meta.json'))){try{out.push(JSON.parse(await readFile(path.join(dir,n),'utf8')));}catch{}}
  return out.sort((a,b)=>b.at.localeCompare(a.at));
 }
 async function create(body,{name='',kind='named',revision,by='Local',note='',now=new Date()}={}){
  if(!KINDS.includes(kind))throw Error('Unknown version kind');
  name=String(name||'').trim().slice(0,120);if(kind==='named'&&!name)throw Error('Name the version.');
  const state=JSON.parse(body),id=now.toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8);
  await mkdir(dir,{recursive:true});
  const data=await zip(Buffer.from(body));
  await writeFile(file(id,'.json.gz.tmp'),data);await rename(file(id,'.json.gz.tmp'),file(id,'.json.gz'));
  const meta={id,name:name||(kind==='auto'?'Automatic backup':'Before restore'),kind,at:now.toISOString(),revision,by:String(by).slice(0,60),note:String(note).slice(0,300),bytes:data.length,sheets:sheetSummary(state)};
  await writeFile(file(id,'.meta.json'),JSON.stringify(meta));
  return meta;
 }
 async function load(id){if(!validId(id))throw Object.assign(Error('Version not found'),{status:404});try{return JSON.parse((await unzip(await readFile(file(id,'.json.gz')))).toString());}catch(e){if(e.code==='ENOENT')throw Object.assign(Error('Version not found'),{status:404});throw e;}}
 async function remove(id){if(!validId(id))return;await rm(file(id,'.json.gz'),{force:true});await rm(file(id,'.meta.json'),{force:true});}
 // Keeps every named version; automatic backups: newest 14 days daily + one per week for 8 weeks;
 // "before restore" versions for 30 days.
 async function prune(now=Date.now()){
  const all=await list(),keep=new Set(),weeks=new Set(),days=new Set();
  for(const v of all){const t=Date.parse(v.at),age=now-t;
   if(v.kind==='named')keep.add(v.id);
   else if(v.kind==='before-restore'){if(age<30*DAY)keep.add(v.id);}
   else{const day=v.at.slice(0,10),week=Math.floor(t/(7*DAY));if(age<14*DAY){if(!days.has(day)){days.add(day);weeks.add(week);keep.add(v.id);}}else if(age<56*DAY&&!weeks.has(week)){weeks.add(week);keep.add(v.id);}}}
  const gone=all.filter(v=>!keep.has(v.id));for(const v of gone)await remove(v.id);return gone.length;
 }
 // Creates an automatic backup when the last one is older than `everyMs` and the workspace changed.
 async function autoBackup(readBody,{everyMs=DAY,now=new Date(),revision}={}){
  const last=(await list()).find(v=>v.kind==='auto');
  if(last&&now-Date.parse(last.at)<everyMs)return null;
  if(last&&last.revision===revision)return null;
  const meta=await create(readBody(),{kind:'auto',revision,by:'Automatic',now});await prune(now.getTime());return meta;
 }
 return {dir,list,create,load,remove,prune,autoBackup};
}

const cellText=v=>v==null?'':typeof v==='object'?JSON.stringify(v):String(v);
// Compares one sheet (or every sheet) between a version and now.
export function compareStates(then,now,{sheetId=null,limit=60}={}){
 const ids=new Set([...(then.sheets||[]),...(now.sheets||[])].map(s=>s.id).filter(id=>!sheetId||id===sheetId));
 const out=[];
 for(const id of ids){const a=then.sheets.find(s=>s.id===id),b=now.sheets.find(s=>s.id===id);
  if(!a||!b){out.push({sheetId:id,name:(a||b).name,status:a?'deleted since':'added since',rows:(a||b).rows.length});continue;}
  const cols=new Map([...a.columns,...b.columns].map(c=>[c.id,c.name])),ra=new Map(a.rows.map(r=>[r.id,r])),rb=new Map(b.rows.map(r=>[r.id,r]));
  let added=0,removed=0,changedRows=0,changedCells=0;const samples=[];
  const label=r=>cellText(r.cells[(b.columns[0]||a.columns[0]).id]).slice(0,80)||'Row';
  for(const [rid,r] of rb)if(!ra.has(rid)){added++;if(samples.length<limit)samples.push({kind:'row added',row:b.rows.indexOf(r)+1,title:label(r)});}
  for(const [rid,r] of ra)if(!rb.has(rid)){removed++;if(samples.length<limit)samples.push({kind:'row deleted',row:a.rows.indexOf(r)+1,title:label(r)});}
  for(const [rid,r] of rb){const old=ra.get(rid);if(!old)continue;let rowChanged=false;
   for(const cid of new Set([...Object.keys(old.cells),...Object.keys(r.cells)])){const x=cellText(old.cells[cid]),y=cellText(r.cells[cid]);if(x!==y){changedCells++;rowChanged=true;if(samples.length<limit)samples.push({kind:'cell',row:b.rows.indexOf(r)+1,title:label(r),column:cols.get(cid)||'(deleted column)',then:x.slice(0,120),now:y.slice(0,120)});}}
   if(rowChanged)changedRows++;}
  const colChanges=[...cols.keys()].filter(c=>!a.columns.some(x=>x.id===c)||!b.columns.some(x=>x.id===c)).length+(a.name!==b.name?1:0);
  out.push({sheetId:id,name:b.name,thenName:a.name,status:added||removed||changedCells||colChanges?'changed':'same',rowsThen:a.rows.length,rowsNow:b.rows.length,added,removed,changedRows,changedCells,columnChanges:colChanges,samples});
 }
 return out.sort((x,y)=>(x.status==='same')-(y.status==='same')||x.name.localeCompare(y.name));
}

// Returns the next state with one sheet restored from `then`.
export function restoreSheet(current,then,sheetId,{mode='copy',makeId,dateLabel}){
 const old=then.sheets.find(s=>s.id===sheetId);if(!old)throw Object.assign(Error('That sheet is not in this version.'),{status:404});
 const next=structuredClone(current);
 if(mode==='copy'){
  const ids=collectIds(old,new Set()),mapping=new Map([...ids].map(id=>[id,makeId()]));
  const copy=remapIds(old,mapping),names=new Set(next.sheets.map(s=>s.name.toLowerCase()));
  let name=`${old.name} (restored ${dateLabel})`,k=2;const base=name;while(names.has(name.toLowerCase()))name=base+' '+k++;
  copy.name=name;
  if(!next.workspaces.some(w=>w.id===copy.workspaceId))copy.workspaceId=next.workspaces[0].id;
  if(copy.folderId&&!next.folders.some(f=>f.id===copy.folderId&&f.workspaceId===copy.workspaceId))copy.folderId=null;
  for(const r of copy.rows){delete r.lockedBy;delete r.lockedAt;}
  const at=next.sheets.findIndex(s=>s.id===sheetId);next.sheets.splice(at<0?next.sheets.length:at+1,0,copy);
  return {state:next,sheetId:copy.id};
 }
 if(mode!=='replace')throw Error('Choose how to restore.');
 const at=next.sheets.findIndex(s=>s.id===sheetId);
 const restored=structuredClone(old);
 if(at<0){if(!next.workspaces.some(w=>w.id===restored.workspaceId))restored.workspaceId=next.workspaces[0].id;if(restored.folderId&&!next.folders.some(f=>f.id===restored.folderId))restored.folderId=null;next.sheets.push(restored);}
 else{const cur=next.sheets[at];restored.workspaceId=cur.workspaceId;restored.folderId=cur.folderId;next.sheets[at]=restored;}
 return {state:next,sheetId};
}
