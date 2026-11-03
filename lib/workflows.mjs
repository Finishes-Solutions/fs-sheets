import {createCalculator} from './formulas.mjs';
import {isReadOnly,parseCell,validateCell} from './columns.mjs';
import {matchesConditions} from './sheet-tools.mjs';
import {randomUUID} from 'node:crypto';
import {recordRowHistory} from './change-log.mjs';
const id=()=>randomUUID(),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const workflowActions=['set','lock','update','approval','notify'];
export function normalizeRule(a){return {...a,trigger:a.trigger||'change',conditions:a.conditions||[],actions:a.actions||[{type:'set',columnId:a.targetColumnId,value:a.value}]};}
export function validateWorkflows(state){
 if(state.people&&(!Array.isArray(state.people)||state.people.some(p=>typeof p.id!=='string'||typeof p.name!=='string'||!p.name.trim())||new Set(state.people.map(p=>p.name.toLowerCase())).size!==state.people.length))throw Error('Invalid people directory');
 if(state.requests&&!Array.isArray(state.requests)||state.inbox&&!Array.isArray(state.inbox))throw Error('Invalid collaboration collections');
 for(const s of state.sheets)for(const raw of s.automations){const a=normalizeRule(raw);if(!Array.isArray(a.conditions)||a.conditions.some(f=>!s.columns.some(c=>c.id===f.columnId)&&!['$locked','$attachments','$comments'].includes(f.columnId)))throw Error('Invalid workflow condition');if(typeof a.name!=='string'||!['change','added','date'].includes(a.trigger)||a.trigger!=='added'&&!s.columns.some(c=>c.id===a.columnId))throw Error('Invalid workflow trigger');
 if(!Array.isArray(a.actions)||!a.actions.length||a.actions.length>10)throw Error('Add 1–10 workflow actions');
 for(const action of a.actions){if(!workflowActions.includes(action.type))throw Error('Invalid workflow action');if(action.type==='set'){const c=s.columns.find(c=>c.id===action.columnId);if(!c||isReadOnly(c))throw Error('Choose an editable automation target');validateCell(c,parseCell(c,action.value));}if(['update','approval','notify'].includes(action.type)&&!String(action.assignees||'').trim())throw Error('Choose local recipients');}
 }
 for(const q of state.requests||[]){const s=state.sheets.find(x=>x.id===q.sheetId);if(!s||!s.rows.some(r=>r.id===q.rowId))continue;if(!['update','approval'].includes(q.type)||!['Open','Submitted','Approved','Declined','Cancelled'].includes(q.status)||!Array.isArray(q.assignees)||!Array.isArray(q.columnIds)||q.columnIds.some(id=>!s.columns.some(c=>c.id===id)))throw Error('Invalid local request');}
}
export function normalizeMetadata(before,after,actor,now=new Date().toISOString()){
 after.people||=[];after.requests||=[];after.inbox||=[];
 const oldSheets=new Map(before.sheets.map(x=>[x.id,x]));
 for(const s of after.sheets){const old=oldSheets.get(s.id);if(old===s)continue;let next=s.nextItemNumber||1;for(const r of old?.rows||[])next=Math.max(next,(r.itemNumber||0)+1);const oldRows=new Map((old?.rows||[]).map(x=>[x.id,x]));
 for(const r of s.rows){const prev=oldRows.get(r.id);if(prev===r){next=Math.max(next,(r.itemNumber||0)+1);continue;}r.itemNumber=prev?.itemNumber||next++;r.createdAt=prev?.createdAt||r.createdAt||now;r.createdBy=prev?.createdBy||actor;
 if(!prev||!equal(prev.cells,r.cells)){r.updatedAt=now;r.updatedBy=actor;recordRowHistory(prev,r,actor,now);}else{r.updatedAt=prev.updatedAt;r.updatedBy=prev.updatedBy||actor;if(prev.cellHistory)r.cellHistory=prev.cellHistory;else delete r.cellHistory;}
 if(r.locked&&!prev?.locked){r.lockedBy=actor;r.lockedAt=now;}
 }
 s.nextItemNumber=next;
 }
}
export function collectMentions(before,after,actor,now=new Date().toISOString()){
 after.inbox||=[];
 const oldSheets=new Map(before.sheets.map(x=>[x.id,x]));
 for(const s of after.sheets){if(oldSheets.get(s.id)===s)continue;const oldRows=new Map((oldSheets.get(s.id)?.rows||[]).map(x=>[x.id,x]));for(const r of s.rows){if(!r.comments?.length)continue;const old=oldRows.get(r.id);for(const comment of r.comments){if(old?.comments.some(x=>x.id===comment.id))continue;
 const names=[...String(comment.text).matchAll(/@\[([^\]]+)\]/g)].map(x=>x[1].toLowerCase());
 comment.mentions=(after.people||[]).filter(p=>names.includes(p.name.toLowerCase())).map(p=>p.id);
 for(const person of (after.people||[]).filter(p=>comment.mentions.includes(p.id)))after.inbox.push({id:id(),sheetId:s.id,rowId:r.id,by:actor,to:person.name,at:now,text:`${actor} mentioned you: ${comment.text}`,kind:'mention',read:false});
 }}}
 after.inbox=after.inbox.slice(-1000);
}
export function runWorkflows(before,after,{scheduled=false,now=new Date().toISOString()}={}){
 let count=0;const asOf=now.slice(0,10);after.requests||=[];after.inbox||=[];
 for(const s of after.sheets){const prev=before.sheets.find(x=>x.id===s.id);if(!s.automations.length)continue;if(prev===s&&!scheduled)continue;const prevRows=new Map((prev?.rows||[]).map(x=>[x.id,x]));
 for(const raw of s.automations){const a=normalizeRule(raw);if(a.enabled===false)continue;if(scheduled&&a.trigger!=='date')continue;
 // Unchanged rows can be the same objects as in `before` (the save fast path shares them): copy a row before writing to it.
 if(prev&&s.rows===prev.rows)s.rows=s.rows.slice();
 for(let ri=0;ri<s.rows.length;ri++){let r=s.rows[ri];const old=prevRows.get(r.id),calculator=createCalculator(after);let fires=false;const own=()=>{if(old===r){r=structuredClone(r);s.rows[ri]=r;}};
 if(a.trigger==='added')fires=!old;
 if(a.trigger==='change'){const c=s.columns.find(c=>c.id===a.columnId);const value=c?calculator.get(s,r,c):'';fires=String(value)===String(a.equals)&&(!old||!equal(old.cells[a.columnId],r.cells[a.columnId]));}
 if(a.trigger==='date'){const v=r.cells[a.columnId];fires=!!v&&String(v).slice(0,10)<=asOf&&raw.dateRuns?.[r.id]!==String(v).slice(0,10);}
 if(!fires||!matchesConditions(s,r,a.conditions,a.match,calculator.get,asOf))continue;
 let ran=false;
 for(const action of a.actions){
 if(action.type==='set'){if(r.locked)continue;const c=s.columns.find(x=>x.id===action.columnId);if(!c||isReadOnly(c))continue;const v=parseCell(c,action.value);validateCell(c,v);own();r.cells[c.id]=v;r.updatedAt=now;r.updatedBy='Automation';ran=true;}
 else if(action.type==='lock'){own();r.locked=true;r.lockedBy='Automation';r.lockedAt=now;ran=true;}
 else {const recipients=String(action.assignees||'').split(',').map(x=>x.trim()).filter(Boolean);if(['update','approval'].includes(action.type))after.requests.push({id:id(),sheetId:s.id,rowId:r.id,type:action.type,title:action.message||a.name,assignees:recipients,columnIds:(action.columnIds||s.columns.filter(c=>!isReadOnly(c)).map(c=>c.id)),status:'Open',by:'Automation',at:now,responses:[]});
 for(const to of recipients)after.inbox.push({id:id(),sheetId:s.id,rowId:r.id,to,by:'Automation',at:now,text:action.message||a.name,kind:action.type,requestId:['update','approval'].includes(action.type)?after.requests.at(-1).id:undefined,read:false});ran=true;}
 }
 if(ran){if(a.trigger==='date'){raw.dateRuns||={};raw.dateRuns[r.id]=String(r.cells[a.columnId]).slice(0,10);}raw.lastRun=now;raw.runCount=(raw.runCount||0)+1;count++;after.activity.push({id:id(),at:now,by:'Automation',message:`Workflow “${a.name}” ran in ${s.name}`});}
 }
 }
 }
 after.activity=after.activity.slice(-300);after.inbox=after.inbox.slice(-1000);return count;
}
