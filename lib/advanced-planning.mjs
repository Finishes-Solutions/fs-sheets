import {createCalculator} from './formulas.mjs';
import {parseCell,validateCell,isReadOnly,cellValue} from './columns.mjs';
import {matchesConditions} from './sheet-tools.mjs';
import {scenarioState,portfolioMetrics} from './planning.mjs';
const clone=x=>structuredClone(x),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),blank=v=>v==null||v==='';
const key=v=>typeof v+':'+String(v??'').trim();
export function upsertTable(table,records,{keyColumnId,mode='upsert',id=()=>crypto.randomUUID()}={}){
 if(!['upsert','append','replace'].includes(mode)||!Array.isArray(records)||records.length>10000)throw Error('Invalid table ingestion');
 if(mode==='upsert'&&!table.columns.some(c=>c.id===keyColumnId))throw Error('Choose a table key');
 const incoming=records.map(input=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!table.columns.some(c=>c.id===k)))throw Error('Unknown table field');const cells={};for(const c of table.columns){const value=blank(input[c.id])?(c.type==='checkbox'?false:''):parseCell(c,input[c.id]);validateCell(c,value);if(!blank(value))cells[c.id]=value;}return {id:id(),cells,provided:Object.keys(input)};});
 const result=mode==='replace'?[]:clone(table.rows),existing=new Map();
 if(mode==='upsert')for(const r of result){const v=r.cells[keyColumnId];if(blank(v)||existing.has(key(v)))throw Error('Existing key values must be nonempty and unique');existing.set(key(v),r);}
 const seen=new Set();let inserted=0,updated=0;
 for(const r of incoming){if(mode==='upsert'){const v=r.cells[keyColumnId];if(blank(v)||seen.has(key(v)))throw Error('Incoming key values must be nonempty and unique');seen.add(key(v));const match=existing.get(key(v));if(match){const merged={...match.cells};for(const field of r.provided)merged[field]=r.cells[field]??'';if(!equal(match.cells,merged)){match.cells=merged;updated++;}continue;}}result.push({id:r.id,cells:r.cells});inserted++;}
 if(result.length>10000)throw Error('Table exceeds 10,000 rows');return {rows:result,inserted,updated};
}
export function snapshotTable(state,sheet){const calc=createCalculator(state);return {sourceSheetId:sheet.id,refreshFromSource:true,columns:sheet.columns.map(c=>({...clone(c),formula:'',type:isReadOnly(c)?'text':c.type})),rows:sheet.rows.map(r=>({id:r.id,cells:Object.fromEntries(sheet.columns.map(c=>[c.id,isReadOnly(c)?String(calc.get(sheet,r,c)):typeof r.cells[c.id]==='string'&&r.cells[c.id].startsWith('=')?calc.get(sheet,r,c):clone(r.cells[c.id]??'')]).filter(([,v])=>!blank(v)))}))};}
export function syncConnection(state,table,connection,{id=()=>crypto.randomUUID(),now=new Date().toISOString()}={}){
 const sheet=state.sheets.find(s=>s.id===connection.sheetId);if(!sheet)throw Error('Connection target sheet is missing');
 if(table.sourceSheetId===sheet.id)throw Error('A table cannot sync back into its source sheet');
 if(!table.columns.some(c=>c.id===connection.tableKeyId)||!sheet.columns.some(c=>c.id===connection.keyColumnId)||!['merge','append','update'].includes(connection.mode||'merge'))throw Error('Choose valid connection keys and mode');
 if(!Array.isArray(connection.mappings)||!connection.mappings.length||new Set(connection.mappings.map(m=>m.to)).size!==connection.mappings.length||!connection.mappings.some(m=>m.from===connection.tableKeyId&&m.to===connection.keyColumnId))throw Error('Map each target once and include the key');
 for(const m of connection.mappings){if(!table.columns.some(c=>c.id===m.from)||!sheet.columns.some(c=>c.id===m.to&&!isReadOnly(c)))throw Error('Connections can write only editable target columns');}
 const calc=createCalculator(state),sourceRows=table.rows.filter(r=>matchesConditions(table,r,connection.conditions||[],connection.match||'all',(_,r,c)=>r.cells[c.id]??'')),keys=new Set(),target=new Map();
 for(const r of sheet.rows){const v=calc.get(sheet,r,sheet.columns.find(c=>c.id===connection.keyColumnId));if(blank(v))continue;if(target.has(key(v)))throw Error('Target keys must be unique');target.set(key(v),r);}
 const planned=[],skipped=[];
 for(const r of sourceRows){const v=r.cells[connection.tableKeyId];if(blank(v)||keys.has(key(v)))throw Error('Source keys must be nonempty and unique');keys.add(key(v));const match=target.get(key(v));if(match?.locked){skipped.push(match.id);continue;}if(match&&connection.mode==='append'||!match&&connection.mode==='update')continue;
  const cells={};for(const m of connection.mappings){const c=sheet.columns.find(c=>c.id===m.to),value=parseCell(c,r.cells[m.from]??'');validateCell(c,value);cells[c.id]=value;}
  if(match){if(Object.entries(cells).some(([k,v])=>!equal(match.cells[k]??'',v)))planned.push({match,cells});}
  else planned.push({cells});
 }
 if(sheet.rows.length+planned.filter(x=>!x.match).length>10000)throw Error('Target sheet exceeds 10,000 rows');
 let inserted=0,updated=0;for(const p of planned){if(p.match){Object.assign(p.match.cells,p.cells);updated++;}else{sheet.rows.push({id:id(),parentId:null,cells:Object.fromEntries(sheet.columns.map(c=>[c.id,p.cells[c.id]??(c.type==='checkbox'?false:'')])),comments:[],attachments:[],createdAt:now,updatedAt:now});inserted++;}}
 connection.lastSync={at:now,inserted,updated,skippedLocked:skipped.length};return connection.lastSync;
}
export function syncAutoConnections(state,options={}){
 for(const table of state.dataTables||[]){const connections=(table.connections||[]).filter(c=>c.auto);if(!connections.length)continue;
  if(table.sourceSheetId&&table.refreshFromSource!==false){const source=state.sheets.find(s=>s.id===table.sourceSheetId);if(source){const fresh=snapshotTable(state,source);if(!equal(fresh.rows,table.rows)){Object.assign(table,fresh);table.refreshedAt=options.now||new Date().toISOString();}}}
  for(const c of connections){try{const result=syncConnection(state,table,c,options);if(result.inserted||result.updated)state.activity.push({id:options.id?.()||crypto.randomUUID(),at:result.at,by:'DataTable',message:`${table.name}: ${result.inserted} rows added, ${result.updated} updated`});delete c.syncError;}catch(e){c.syncError=e.message;}}
 }
}
export function scenarioSummary(state,scenario){
 const excluded=new Set(scenario.excludedSheetIds||[]),selectedIds=scenario.sheetIds.filter(id=>!excluded.has(id)),after=scenarioState(state,{...scenario,changes:(scenario.changes||[]).filter(c=>!excluded.has(c.sheetId))});
 const beforeMetrics=portfolioMetrics(state,scenario),afterMetrics=portfolioMetrics(after,{...scenario,sheetIds:selectedIds}),cost=afterMetrics.reduce((n,m)=>n+m.cost,0),effort=selectedIds.reduce((n,id)=>n+Number(scenario.projectSettings?.[id]?.effort||0),0);
 return {before:beforeMetrics,after:afterMetrics,selectedIds,cost,effort,costDelta:cost-beforeMetrics.reduce((n,m)=>n+m.cost,0),overBudget:scenario.budgetLimit!=null&&scenario.budgetLimit!==''?Math.max(0,cost-Number(scenario.budgetLimit)):0,overCapacity:scenario.capacityLimit!=null&&scenario.capacityLimit!==''?Math.max(0,effort-Number(scenario.capacityLimit)):0};
}
export function recommendSelection(state,scenario){
 const metrics=portfolioMetrics(scenarioState(state,scenario),scenario),budget=blank(scenario.budgetLimit)?Infinity:Number(scenario.budgetLimit),capacity=blank(scenario.capacityLimit)?Infinity:Number(scenario.capacityLimit);
 let cost=0,effort=0;const included=[];
 const ordered=metrics.map(m=>({...m,effort:Number(scenario.projectSettings?.[m.sheetId]?.effort||0),priority:Number(scenario.projectSettings?.[m.sheetId]?.priority??1)})).sort((a,b)=>b.priority-a.priority||a.cost-b.cost||a.sheetId.localeCompare(b.sheetId));
 for(const p of ordered){if(cost+p.cost<=budget&&effort+p.effort<=capacity){included.push(p.sheetId);cost+=p.cost;effort+=p.effort;}}
 return scenario.sheetIds.filter(id=>!included.includes(id));
}
export function applyScenario(state,scenario){
 const excluded=new Set(scenario.excludedSheetIds||[]),changes=(scenario.changes||[]).filter(c=>!excluded.has(c.sheetId));
 if(!changes.length)throw Error('No included cell changes to apply');const next=clone(state);
 for(const change of changes){const s=next.sheets.find(s=>s.id===change.sheetId),r=s?.rows.find(r=>r.id===change.rowId),c=s?.columns.find(c=>c.id===change.columnId);if(!r||!c||isReadOnly(c)||r.locked)throw Error('Scenario target is missing, calculated, or locked');if(!Object.hasOwn(change,'baseValue'))throw Error('Re-save this change to capture its source value before applying');if(!equal(r.cells[c.id]??'',change.baseValue))throw Error('Source cell changed since this scenario was saved');validateCell(c,change.value);r.cells[c.id]=clone(change.value);}
 const saved=next.scenarios.find(s=>s.id===scenario.id);if(saved){for(const c of saved.changes||[])if(!excluded.has(c.sheetId))c.baseValue=clone(c.value);saved.appliedAt=new Date().toISOString();}return next;
}
export function fieldPolicy(state,view,row){
 const s=state.sheets.find(s=>s.id===view.sheetId);if(!s)throw Error('Source sheet is missing');const calc=createCalculator(state),fields=new Map(view.columnIds.map(id=>[id,{visible:true,editable:view.editableIds.includes(id),required:(view.requiredIds||[]).includes(id)}]));
 for(const rule of view.fieldRules||[])if(matchesConditions(s,row,rule.conditions||[],rule.match||'all',calc.get)){const p=fields.get(rule.columnId);if(p){if(rule.hidden)p.visible=false;if(rule.readOnly)p.editable=false;if(rule.required)p.required=true;}}
 for(const [id,p] of fields){const c=s.columns.find(c=>c.id===id);p.editable=p.editable&&p.visible&&!row.locked&&!isReadOnly(c)&&!String(row.cells[id]||'').startsWith('=');}return fields;
}
export function projectView(state,view,{offset=0,limit=100}={}){
 const s=state.sheets.find(s=>s.id===view.sheetId);if(!s)throw Error('Source sheet is missing');const calc=createCalculator(state),rows=s.rows.filter(r=>matchesConditions(s,r,view.conditions||[],view.match||'all',calc.get));
 const visible=rows.slice(offset,offset+limit).map(r=>{const policy=fieldPolicy(state,view,r),cells={},raw={},fields={};for(const [id,p] of policy)if(p.visible){const c=s.columns.find(c=>c.id===id);cells[id]=calc.get(s,r,c);if(p.editable)raw[id]=clone(r.cells[id]??'');fields[id]=p;}
 return {id:r.id,cells,raw,fields,locked:!!r.locked,comments:view.allowComments?clone(r.comments):[],attachments:view.allowAttachments?clone(r.attachments).map(({id,name,type})=>({id,name,type})):[]};});
 return {id:view.id,name:view.name,total:rows.length,offset,columns:view.columnIds.map(id=>s.columns.find(c=>c.id===id)).filter(Boolean).map(({id,name,type,options})=>({id,name,type,options})),rows:visible,allowComments:!!view.allowComments};
}
export function editViewRow(state,view,rowId,input,actor='Local'){
 const next=clone(state),s=next.sheets.find(s=>s.id===view.sheetId),r=s?.rows.find(r=>r.id===rowId);if(!r)throw Error('Source row is missing');const calc=createCalculator(next);if(!matchesConditions(s,r,view.conditions||[],view.match||'all',calc.get))throw Error('Row is outside this view');
 if(!input.cells||typeof input.cells!=='object'||Array.isArray(input.cells))throw Error('Invalid view edits');const policy=fieldPolicy(next,view,r);
 for(const [id,value] of Object.entries(input.cells)){const p=policy.get(id),c=s.columns.find(c=>c.id===id);if(!p?.visible||!p.editable||!c)throw Error('This field is hidden, read-only, calculated, or locked');validateCell(c,value);r.cells[id]=clone(value);}
 for(const [id,p] of fieldPolicy(next,view,r))if(p.visible&&p.required&&blank(r.cells[id]))throw Error('Required field: '+s.columns.find(c=>c.id===id).name);
 if(input.comment){if(!view.allowComments)throw Error('Comments are disabled in this view');if(typeof input.comment!=='string'||input.comment.length>10000)throw Error('Invalid comment');r.comments.push({id:crypto.randomUUID(),text:input.comment.trim(),by:actor,at:new Date().toISOString()});}
 return next;
}
