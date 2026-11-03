// Automatic imports from a folder: CSV or Excel files dropped into a watched folder update a sheet.
// Rows are matched on a key column (update matching rows, add new ones) or simply appended.
// Locked rows are never changed. Nothing here touches the filesystem; see server.mjs for the watcher.
import {parseCell,validateCell,isReadOnly} from './columns.mjs';

export function parseCSV(text){
 text=String(text).replace(/^﻿/,'');const sep=(()=>{const line=text.split(/\r?\n/,1)[0]||'';const counts=[',',';','\t'].map(s=>[s,line.split(s).length]);counts.sort((a,b)=>b[1]-a[1]);return counts[0][0];})();
 const rows=[];let row=[],cell='',q=false;
 for(let i=0;i<text.length;i++){const ch=text[i];
  if(q){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=ch;continue;}
  if(ch==='"'&&cell==='')q=true;else if(ch===sep){row.push(cell);cell='';}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}else cell+=ch;}
 if(cell!==''||row.length){row.push(cell);rows.push(row);}
 return rows.filter(r=>r.some(v=>String(v).trim()!==''));
}
const norm=s=>String(s??'').trim().toLowerCase().replace(/\s+/g,' ');
const text=v=>v==null?'':Array.isArray(v)?v.join(', '):String(v);

// table: array of rows; first row = headers. Returns {sheet, added, updated, unchanged, skippedLocked, unmatched, errors}.
export function applyImport(sheet,table,{keyColumnId=null,mode='upsert',makeId,now=new Date().toISOString(),source=''}={}){
 if(!Array.isArray(table)||table.length<1)throw Error('The file is empty.');
 const headers=table[0].map(h=>String(h??'').trim()),byName=new Map(sheet.columns.map(c=>[norm(c.name),c]));
 const map=headers.map(h=>{const c=byName.get(norm(h));return c&&!isReadOnly(c)?c:null;});
 const unmatched=headers.filter((h,i)=>h&&!map[i]);
 if(!map.some(Boolean))throw Error('None of the file’s column headers match this sheet’s columns.');
 const key=keyColumnId&&sheet.columns.find(c=>c.id===keyColumnId);
 if(mode==='upsert'&&!key)throw Error('Choose the column that identifies each row.');
 if(mode==='upsert'&&!map.includes(key))throw Error(`The file has no “${key.name}” column to match rows on.`);
 const next=structuredClone(sheet),index=new Map();if(key)for(const r of next.rows){const k=norm(text(r.cells[key.id]));if(k&&!index.has(k))index.set(k,r);}
 let added=0,updated=0,unchanged=0,skippedLocked=0;const errors=[];
 table.slice(1).forEach((line,li)=>{const cells={};
  map.forEach((c,i)=>{if(!c)return;const raw=line[i];if(raw===undefined||raw===null||raw==='')return;try{const v=typeof raw==='number'||typeof raw==='boolean'?(['text','longText'].includes(c.type)?String(raw):raw):parseCell(c,String(raw));validateCell(c,v);cells[c.id]=v;}catch(e){if(errors.length<30)errors.push(`Row ${li+2}, ${c.name}: ${e.message}`);}});
  if(!Object.keys(cells).length)return;
  if(mode==='upsert'&&!norm(text(cells[key.id]))){if(errors.length<30)errors.push(`Row ${li+2}: no ${key.name} value, so it was skipped (it can’t be matched next time).`);return;}
  const existing=mode==='upsert'?index.get(norm(text(cells[key.id]))):null;
  if(existing){if(existing.locked){skippedLocked++;return;}const changed=Object.entries(cells).filter(([k,v])=>JSON.stringify(existing.cells[k]??'')!==JSON.stringify(v));if(!changed.length){unchanged++;return;}for(const [k,v] of changed)existing.cells[k]=v;existing.updatedAt=now;updated++;}
  else{const row={id:makeId(),parentId:null,cells:Object.fromEntries(next.columns.map(c=>[c.id,cells[c.id]??(c.type==='checkbox'?false:'')])),comments:[],attachments:[],createdAt:now,updatedAt:now,source:{folderImport:source}};next.rows.push(row);if(key){const k=norm(text(cells[key.id]));if(k)index.set(k,row);}added++;}
 });
 if(next.rows.length>20000)throw Error('The sheet would exceed 20,000 rows.');
 return {sheet:next,added,updated,unchanged,skippedLocked,unmatched,errors};
}
