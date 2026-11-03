// Approvals on rows. Requests (state.requests, type 'approval') already exist; this records each
// request, decision and final outcome in the row's history (server-owned cellHistory), so the audit
// trail travels with the row: who asked, who approved or declined, when, and their note.
import {HISTORY_LIMIT} from './change-log.mjs';

export const APPROVAL_COLUMN='$approval';
export function recordApprovals(before,after,actor,now=new Date().toISOString()){
 const old=new Map((before.requests||[]).map(q=>[q.id,q]));let added=0;
 const rowOf=q=>after.sheets.find(s=>s.id===q.sheetId)?.rows.find(r=>r.id===q.rowId);
 const push=(row,entry)=>{row.cellHistory=[...(row.cellHistory||[]),{at:now,col:APPROVAL_COLUMN,from:'',...entry}].slice(-HISTORY_LIMIT);added++;};
 for(const q of after.requests||[]){if(q.type!=='approval')continue;const row=rowOf(q);if(!row)continue;const prev=old.get(q.id);
  if(!prev)push(row,{by:q.by||actor,to:`Approval requested from ${q.assignees.join(', ')}: ${String(q.title||'').slice(0,200)}`});
  const seen=new Set((prev?.responses||[]).map(r=>r.id));
  for(const r of q.responses||[])if(!seen.has(r.id))push(row,{by:r.by,to:`${r.decision||'Responded'}${r.text?` — ${String(r.text).slice(0,200)}`:''} (${String(q.title||'').slice(0,80)})`});
  if(prev&&prev.status!==q.status&&['Approved','Declined','Cancelled'].includes(q.status))push(row,{by:actor,to:`Approval ${q.status.toLowerCase()}: ${String(q.title||'').slice(0,120)}`});
 }
 return added;
}
// Decision helper shared by the side panel and the request dialog.
export function decide(request,{by,decision,note='',id,now=new Date().toISOString()}){
 if(request.status!=='Open')throw Error('This request is already '+request.status.toLowerCase()+'.');
 if(!request.assignees.some(n=>n.toLowerCase()===String(by).toLowerCase()))throw Error('Only '+request.assignees.join(', ')+' can respond.');
 if((request.responses||[]).some(r=>r.by.toLowerCase()===String(by).toLowerCase()))throw Error('You already responded.');
 if(!['Approved','Declined'].includes(decision))throw Error('Choose Approve or Decline.');
 request.responses=[...(request.responses||[]),{id,by,at:now,text:String(note).slice(0,500),decision}];
 request.status=request.responses.some(r=>r.decision==='Declined')?'Declined':request.assignees.every(n=>request.responses.some(r=>r.by.toLowerCase()===n.toLowerCase()&&r.decision==='Approved'))?'Approved':'Open';
 return request.status;
}
