// Notifications outside the app. In-app inbox items (mentions, requests, workflow reminders, and
// now row watching) are turned into emails for people who have an email address and want them;
// a daily digest summarizes unread items. Delivery runs from an outbox table (see server.mjs).
import {randomUUID} from 'node:crypto';

export const DEFAULT_PREFS={mention:true,request:true,reminder:true,watch:true,digest:true};
export const prefsFor=person=>({...DEFAULT_PREFS,...(person?.notify||{})});
const kindPref=kind=>kind==='mention'?'mention':kind==='watch'?'watch':['update','approval','response'].includes(kind)?'request':'reminder';
const cellText=v=>v==null?'':Array.isArray(v)?v.join(', '):typeof v==='object'?JSON.stringify(v):String(v);
const escHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Row watching: people listed in row.watchers get an inbox item when someone else changes the row's
// cells or adds a comment or file. Runs inside the save pipeline (after workflows).
export function collectWatchers(before,after,actor,now=new Date().toISOString()){
 after.inbox||=[];let added=0;
 const oldSheets=new Map(before.sheets.map(s=>[s.id,s]));
 for(const s of after.sheets){const old=oldSheets.get(s.id);if(!old||old===s)continue;const oldRows=new Map(old.rows.map(r=>[r.id,r]));
  for(const r of s.rows){if(!Array.isArray(r.watchers)||!r.watchers.length)continue;const prev=oldRows.get(r.id);if(!prev)continue;
   const changed=s.columns.filter(c=>cellText(prev.cells[c.id])!==cellText(r.cells[c.id]));
   const newComments=(r.comments||[]).length>(prev.comments||[]).length,newFiles=(r.attachments||[]).length>(prev.attachments||[]).length;
   if(!changed.length&&!newComments&&!newFiles)continue;
   const parts=[...changed.slice(0,4).map(c=>`${c.name}: ${cellText(prev.cells[c.id])||'blank'} → ${cellText(r.cells[c.id])||'blank'}`),...(changed.length>4?[`+${changed.length-4} more`]:[]),...(newComments?['new comment']:[]),...(newFiles?['new file']:[])];
   const title=cellText(r.cells[s.columns[0]?.id])||'a row';
   for(const name of r.watchers){if(String(name).toLowerCase()===String(actor).toLowerCase())continue;
    after.inbox.push({id:randomUUID(),sheetId:s.id,rowId:r.id,to:name,by:actor,at:now,kind:'watch',read:false,text:`${actor} changed “${title.slice(0,80)}” in ${s.name}: ${parts.join('; ')}`.slice(0,500)});added++;}
  }}
 after.inbox=after.inbox.slice(-1000);return added;
}

export function newInboxItems(before,after){const seen=new Set((before.inbox||[]).map(i=>i.id));return (after.inbox||[]).filter(i=>!seen.has(i.id));}

const link=(appUrl,item,state)=>{if(!appUrl)return '';const s=state?.sheets.find(x=>x.id===item.sheetId);return s?`${appUrl.replace(/\/$/,'')}/#/sheet?workspace=${encodeURIComponent(s.workspaceId)}&sheet=${encodeURIComponent(s.id)}`:appUrl;};
// Turns new inbox items into emails for people who have an address and want this kind.
export function emailsForItems(items,state,{appUrl=''}={}){
 const people=new Map((state.people||[]).map(p=>[p.name.toLowerCase(),p])),out=[];
 for(const item of items){const p=people.get(String(item.to).toLowerCase());if(!p?.email||!/^[^@\s]+@[^@\s]+$/.test(p.email))continue;if(!prefsFor(p)[kindPref(item.kind)])continue;
  const sheet=state.sheets.find(s=>s.id===item.sheetId),url=link(appUrl,item,state);
  const subject=(item.kind==='mention'?`${item.by} mentioned you`:item.kind==='watch'?`Row changed in ${sheet?.name||'Sheets'}`:item.kind==='approval'?`Approval requested: ${sheet?.name||''}`:item.kind==='update'?`Update requested: ${sheet?.name||''}`:item.kind==='response'?`Response from ${item.by}`:`Reminder: ${sheet?.name||'Sheets'}`).trim();
  const text=`${item.text}\n\n${sheet?'Sheet: '+sheet.name+'\n':''}${url?'Open: '+url+'\n':''}\nYou get this because of your notification settings in Sheets (People).`;
  const html=`<div style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#1d1d1f"><p>${escHtml(item.text)}</p>${sheet?`<p style="color:#6b6b70">Sheet: ${escHtml(sheet.name)}</p>`:''}${url?`<p><a href="${escHtml(url)}" style="display:inline-block;background:#1d1d1f;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Open in Sheets</a></p>`:''}<p style="color:#8a8a8f;font-size:12px">You get this because of your notification settings in Sheets (People).</p></div>`;
  out.push({person:p.name,to:p.email,subject,text,html,kind:item.kind,itemId:item.id});}
 return out;
}

// Daily digest: unread items for one person since `since`, grouped by sheet.
export function digestFor(person,state,{since,appUrl=''}={}){
 if(!person?.email||!prefsFor(person).digest)return null;
 const items=(state.inbox||[]).filter(i=>String(i.to).toLowerCase()===person.name.toLowerCase()&&!i.read&&(!since||i.at>=since));
 if(!items.length)return null;
 const bySheet=new Map();for(const i of items){const n=state.sheets.find(s=>s.id===i.sheetId)?.name||'Other';if(!bySheet.has(n))bySheet.set(n,[]);bySheet.get(n).push(i);}
 const text=[`You have ${items.length} unread item${items.length===1?'':'s'} in Sheets.`,'',...[...bySheet].flatMap(([n,list])=>[n+':',...list.slice(0,20).map(i=>'  • '+i.text),list.length>20?`  …and ${list.length-20} more`:'','']),appUrl?'Open Sheets: '+appUrl:''].join('\n');
 const html=`<div style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#1d1d1f"><p><b>${items.length} unread item${items.length===1?'':'s'}</b> in Sheets.</p>${[...bySheet].map(([n,list])=>`<h3 style="font-size:14px;margin:16px 0 4px">${escHtml(n)}</h3><ul style="margin:0;padding-left:18px">${list.slice(0,20).map(i=>`<li>${escHtml(i.text)}${link(appUrl,i,state)?` — <a href="${escHtml(link(appUrl,i,state))}">open</a>`:''}</li>`).join('')}</ul>`).join('')}${appUrl?`<p><a href="${escHtml(appUrl)}">Open Sheets</a></p>`:''}</div>`;
 return {person:person.name,to:person.email,subject:`Sheets daily digest: ${items.length} unread`,text,html,kind:'digest'};
}
