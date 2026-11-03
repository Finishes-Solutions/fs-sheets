import {isReadOnly,validateCell} from './columns.mjs';

const normalize=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases={
 titleColumn:['taskname','task','purchasedescription','description','name','category'],
 statusColumn:['status','projectstatus','paymentstatus'],
 progressColumn:['percentcomplete','complete','completed','progress','completion'],
 costColumn:['budget','contractamount','poamount','cost','amount','purchaseamountincludeanytaxesfees'],
 dueColumn:['due','duedate','finish','finishdate','paymentduedate','enddate'],
 ownerColumn:['owner','assignedto','assignee','manageremail','submittersemail']
};
// Suggestions are based only on explicit field names; never silently assign an arbitrary numeric field.
export function inferSheetMappings(sheet){
 return Object.fromEntries(Object.entries(aliases).map(([key,names])=>{
  const column=names.map(name=>sheet.columns.find(c=>normalize(c.name)===name)).find(Boolean);
  return [key,column?.id||(key==='titleColumn'?sheet.columns[0]?.id:'')||''];
 }));
}
export function workspacePlan(state,workspaceId){
 const sources=state.sheets.filter(s=>s.workspaceId===workspaceId);
 return {workspaceId,name:'Workspace portfolio',sheetIds:sources.map(s=>s.id),sheetMappings:Object.fromEntries(sources.map(s=>[s.id,inferSheetMappings(s)])),changes:[],excludedSheetIds:[],projectSettings:{}};
}
export function completionValue(status,progress){
 if(/^(complete|completed|done|closed|paid)$/i.test(String(status).trim()))return 1;
 if(progress==null||progress==='')return 0;
 const str=String(progress).trim(),number=Number(str.replace('%',''));
 if(!Number.isFinite(number))return 0;
 return Math.max(0,Math.min(1,str.includes('%')||number>1?number/100:number));
}
export function buildBulkChanges(state,scenario,{sheetId,columnId,mode,amount}){
 const sheet=state.sheets.find(s=>s.id===sheetId&&scenario.sheetIds.includes(s.id));
 const column=sheet?.columns.find(c=>c.id===columnId);
 if(!column||isReadOnly(column))throw Error('Choose an editable source column.');
 if(!['percent','add','days'].includes(mode)||!Number.isFinite(Number(amount)))throw Error('Enter a valid adjustment.');
 if(mode==='days'&&(!['date','datetime'].includes(column.type)||!Number.isInteger(Number(amount))))throw Error('Date shifts need a date field and whole days.');
 if(mode!=='days'&&!['number','currency','percent','rating','duration'].includes(column.type))throw Error('Choose a numeric field for this adjustment.');
 const parents=new Set(sheet.rows.map(r=>r.parentId).filter(Boolean)),changes=[];let skipped=0;
 for(const row of sheet.rows){
  const raw=row.cells[column.id];
  if(parents.has(row.id)||row.locked||raw==null||raw===''||String(raw).startsWith('=')){skipped++;continue;}
  const prior=(scenario.changes||[]).find(c=>c.sheetId===sheet.id&&c.rowId===row.id&&c.columnId===column.id),base=prior?.value??raw;
  let value;
  if(mode==='days'){
   if(!/^\d{4}-\d{2}-\d{2}/.test(String(base))||!Number.isFinite(Date.parse(base))){skipped++;continue;}
   const date=new Date(base);date.setUTCDate(date.getUTCDate()+Number(amount));value=date.toISOString().slice(0,column.type==='date'?10:16);
  }else{
   if(!Number.isFinite(Number(base))){skipped++;continue;}
   value=mode==='percent'?Number(base)*(1+Number(amount)/100):Number(base)+Number(amount);
   value=Math.round(value*1e8)/1e8;
  }
  validateCell(column,value);
  if(JSON.stringify(value)!==JSON.stringify(base))changes.push({sheetId:sheet.id,rowId:row.id,columnId:column.id,value,baseValue:structuredClone(prior?.baseValue??raw)});
 }
 return {changes,skipped};
}
export function mergeScenarioChanges(existing,changes){
 const key=c=>JSON.stringify([c.sheetId,c.rowId,c.columnId]),map=new Map(existing.map(c=>[key(c),c]));
 for(const change of changes)map.set(key(change),change);
 return [...map.values()];
}
