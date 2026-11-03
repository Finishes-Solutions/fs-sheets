import {completionValue} from './planning-workspace.mjs';
import {createCalculator} from './formulas.mjs';
import {matchesConditions,validateSheetTools} from './sheet-tools.mjs';
import {isReadOnly,validateCell} from './columns.mjs';
export function validatePlanning(state){
 for(const key of ['portfolios','scenarios','dataTables','dynamicViews']){
  const items=state[key]||[];
  if(!Array.isArray(items)||items.length>100||new Set(items.map(x=>x?.id)).size!==items.length)throw Error('Invalid '+key);
  for(const x of items){
   if(!x||typeof x.id!=='string'||typeof x.name!=='string'||!x.name.trim()||!state.workspaces.some(w=>w.id===x.workspaceId))throw Error('Invalid '+key+' definition');
   if(key==='portfolios'||key==='scenarios'){
    if(!Array.isArray(x.sheetIds)||!x.sheetIds.length||x.sheetIds.some(id=>!state.sheets.some(s=>s.id===id&&s.workspaceId===x.workspaceId)))throw Error('Choose existing source sheets');
   }
   if(key==='scenarios'){for(const limit of ['budgetLimit','capacityLimit'])if(x[limit]!=null&&x[limit]!==''&&(!Number.isFinite(Number(x[limit]))||Number(x[limit])<0))throw Error('Invalid scenario constraint');if((x.excludedSheetIds||[]).some(id=>!x.sheetIds.includes(id)))throw Error('Invalid scenario selection');for(const v of Object.values(x.projectSettings||{}))if(!Number.isFinite(Number(v.effort||0))||Number(v.effort||0)<0||!Number.isFinite(Number(v.priority??1)))throw Error('Invalid scenario project settings');}
   if(key==='scenarios')for(const change of x.changes||[]){
    const s=state.sheets.find(s=>s.id===change.sheetId),r=s?.rows.find(r=>r.id===change.rowId),c=s?.columns.find(c=>c.id===change.columnId);
    if(!x.sheetIds.includes(change.sheetId)||!r||!c||isReadOnly(c))throw Error('Scenario needs an editable, unlocked source cell');validateCell(c,change.value);
   }
   if(key==='dynamicViews'){
    const s=state.sheets.find(s=>s.id===x.sheetId&&s.workspaceId===x.workspaceId);
    if(!s||!Array.isArray(x.columnIds)||!x.columnIds.length||x.columnIds.some(id=>!s.columns.some(c=>c.id===id))||!Array.isArray(x.editableIds)||x.editableIds.some(id=>!x.columnIds.includes(id)))throw Error('Invalid view columns');
    if((x.requiredIds||[]).some(id=>!x.columnIds.includes(id))||!Array.isArray(x.fieldRules||[])||(x.fieldRules||[]).some(r=>!x.columnIds.includes(r.columnId)))throw Error('Invalid view field rule');validateSheetTools({...s,savedFilters:[{id:x.id,name:x.name,conditions:x.conditions||[]},...(x.fieldRules||[]).map(r=>({id:r.id,name:'Field rule',conditions:r.conditions||[]}))],sorts:[],formatRules:[]});
   }
   if(key==='dataTables'){
    if(!Array.isArray(x.columns)||!x.columns.length||x.columns.length>100||!Array.isArray(x.rows)||x.rows.length>10000||new Set(x.columns.map(c=>c.id)).size!==x.columns.length)throw Error('Invalid data table');
    if(!Array.isArray(x.connections||[]))throw Error('Invalid table connections');for(const connection of x.connections||[]){const target=state.sheets.find(s=>s.id===connection.sheetId);if(!target||connection.sheetId===x.sourceSheetId||!x.columns.some(c=>c.id===connection.tableKeyId)||!target.columns.some(c=>c.id===connection.keyColumnId)||!Array.isArray(connection.mappings)||connection.mappings.some(m=>!x.columns.some(c=>c.id===m.from)||!target.columns.some(c=>c.id===m.to&&!isReadOnly(c))))throw Error('Invalid data connection');validateSheetTools({...x,savedFilters:[{id:connection.id,name:'Connection',conditions:connection.conditions||[]}],sorts:[],formatRules:[]});}
    if(new Set(x.rows.map(r=>r.id)).size!==x.rows.length)throw Error('Duplicate table row IDs');for(const r of x.rows){if(!r||typeof r.id!=='string'||!r.cells)throw Error('Invalid table row');for(const c of x.columns)validateCell(c,r.cells[c.id]);}
   }
  }
 }
}
export function scenarioState(state,scenario){
 const copy=structuredClone(state);
 for(const x of scenario.changes||[]){const s=copy.sheets.find(s=>s.id===x.sheetId),r=s?.rows.find(r=>r.id===x.rowId);if(r)r.cells[x.columnId]=x.value;}
 return copy;
}
export function portfolioMetrics(state,config){
 const calc=createCalculator(state);
 return config.sheetIds.map(id=>state.sheets.find(s=>s.id===id)).filter(Boolean).map(s=>{
  const parentIds=new Set(s.rows.map(r=>r.parentId).filter(Boolean)),rows=s.rows.filter(r=>!parentIds.has(r.id));
  const mapping=config.sheetMappings?.[s.id]||{},column=name=>s.columns.find(c=>c.name===name||c.id===name),status=column(mapping.statusColumn||config.statusColumn),cost=column(mapping.costColumn||config.costColumn),due=column(mapping.dueColumn||config.dueColumn),progress=column(mapping.progressColumn||config.progressColumn),asOf=new Date().toISOString().slice(0,10);
  let complete=0,totalCost=0,overdue=0;for(const r of rows){const done=completionValue(status?calc.get(s,r,status):'',progress?calc.get(s,r,progress):'')===1;if(done)complete++;if(cost){const n=Number(calc.get(s,r,cost));if(Number.isFinite(n))totalCost+=n;}if(due){const d=String(calc.get(s,r,due));if(!done&&/^\d{4}-\d{2}-\d{2}/.test(d)&&d.slice(0,10)<asOf)overdue++;}}
  return {sheetId:s.id,name:s.name,items:rows.length,complete,completion:rows.length?Math.round(complete/rows.length*100):0,cost:totalCost,overdue,mapped:{status:!!status,progress:!!progress,cost:!!cost,due:!!due},fields:{status:status?.name||progress?.name||'',cost:cost?.name||'',due:due?.name||''}};
 });
}
export function viewRows(state,view){const s=state.sheets.find(s=>s.id===view.sheetId);if(!s)return [];const calc=createCalculator(state);return s.rows.filter(r=>matchesConditions(s,r,view.conditions||[],view.match||'all',calc.get));}
