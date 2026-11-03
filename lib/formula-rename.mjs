// Keeps formulas and name-based settings working when a column or sheet is renamed
// (Smartsheet behavior). References are rewritten everywhere except inside "quoted text".

const lower=v=>String(v??'').toLowerCase();
const isFormula=v=>typeof v==='string'&&v.startsWith('=');

// Applies `fn` to the parts of a formula outside string literals.
function outsideStrings(formula,fn){
 let out='',i=0;
 while(i<formula.length){
  const q=formula.indexOf('"',i);
  if(q<0){out+=fn(formula.slice(i));break;}
  out+=fn(formula.slice(i,q));
  let j=q+1;while(j<formula.length){if(formula[j]==='"'){if(formula[j+1]==='"'){j+=2;continue;}j++;break;}j++;}
  out+=formula.slice(q,j);i=j;
 }
 return out;
}
const escapeRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export function renameColumnInFormula(formula,oldName,newName){
 if(!isFormula(formula))return formula;
 const re=new RegExp('\\['+escapeRe(oldName)+'\\]','gi');
 return outsideStrings(formula,part=>part.replace(re,()=>'['+newName+']'));
}
export function renameCrossColumnInFormula(formula,sheetName,oldName,newName){
 if(!isFormula(formula))return formula;
 const re=new RegExp('\\{\\s*'+escapeRe(sheetName)+'\\s*::\\s*'+escapeRe(oldName)+'\\s*\\}','gi');
 return outsideStrings(formula,part=>part.replace(re,()=>'{'+sheetName+'::'+newName+'}'));
}
export function renameSheetInFormula(formula,oldName,newName){
 if(!isFormula(formula))return formula;
 const cross=new RegExp('\\{\\s*'+escapeRe(oldName)+'\\s*::','gi');
 const quotedA1=new RegExp("'"+escapeRe(oldName.replace(/'/g,"''"))+"'!",'gi');
 const bareA1=/^[A-Za-z_][\w.]*$/.test(oldName)?new RegExp('(^|[^\\w.\'])'+escapeRe(oldName)+'!','gi'):null;
 const quoteNew=/^[A-Za-z_][\w.]*$/.test(newName)?newName:"'"+newName.replace(/'/g,"''")+"'";
 return outsideStrings(formula,part=>{let p=part.replace(cross,()=>'{'+newName+'::').replace(quotedA1,()=>quoteNew+'!');if(bareA1)p=p.replace(bareA1,(m,pre)=>pre+quoteNew+'!');return p;});
}

// Visits every formula location in a sheet: cells, column formulas and sheet-summary fields.
function rewriteSheet(sh,fn,where){
 for(const c of sh.columns){if(c.formula){const n=fn(c.formula);if(n!==c.formula){where.push({sheet:sh,kind:'column',column:c});c.formula=n;}}}
 for(const r of sh.rows)for(const [k,v] of Object.entries(r.cells||{}))if(isFormula(v)){const n=fn(v);if(n!==v){where.push({sheet:sh,kind:'cell',row:r});r.cells[k]=n;}}
 for(const f of sh.summaryFields||[])if(isFormula(f.value)){const n=fn(f.value);if(n!==f.value){where.push({sheet:sh,kind:'summary'});f.value=n;}}
}

function lockError(where){
 const blocked=where.filter(w=>w.kind==='cell'&&w.row.locked).map(w=>`${w.sheet.name} row ${w.sheet.rows.indexOf(w.row)+1}`);
 const colBlocked=where.filter(w=>w.kind==='column'&&w.sheet.rows.some(r=>r.locked)).map(w=>`${w.sheet.name} · ${w.column.name}`);
 if(!blocked.length&&!colBlocked.length)return;
 const list=[...new Set([...blocked,...colBlocked])];
 throw Error('This rename would update formulas in locked rows ('+list.slice(0,5).join(', ')+(list.length>5?', …':'')+'). Unlock them first so their references stay correct.');
}

const FIELD_KEYS=['groupBy','sortBy','statusColumn','costColumn','dueColumn','ownerColumn','dateColumn','metricColumn','budgetColumn','actualColumn'];
function renameSettings(state,sheetId,oldName,newName){
 const sheets=new Map(state.sheets.map(s=>[s.id,s]));
 const unambiguous=item=>(item.sheetIds||[]).filter(id=>id!==sheetId).every(id=>!sheets.get(id)?.columns.some(c=>lower(c.name)===lower(oldName)));
 const swap=v=>lower(v)===lower(oldName)?newName:v;let n=0;
 for(const key of ['reports','dashboards','portfolios','scenarios'])for(const item of state[key]||[]){
  if(!Array.isArray(item.sheetIds)||!item.sheetIds.includes(sheetId))continue;
  const map=item.mappings?.[sheetId];if(map&&typeof map==='object')for(const [k,v] of Object.entries(map))if(lower(v)===lower(oldName)){map[k]=newName;n++;}
  if(!unambiguous(item))continue;
  if(Array.isArray(item.columns))item.columns=item.columns.map(v=>{const x=swap(v);if(x!==v)n++;return x;});
  for(const f of item.filters||[])if(lower(f.column)===lower(oldName)){f.column=newName;n++;}
  for(const k of FIELD_KEYS)if(typeof item[k]==='string'&&lower(item[k])===lower(oldName)){item[k]=newName;n++;}
 }
 return n;
}

// Mutates `state`. Returns how many places were updated. Throws (before any change) when locked rows would be touched.
export function applyColumnRename(state,sheetId,oldName,newName){
 if(!oldName||!newName||oldName===newName)return 0;
 const sh=state.sheets.find(s=>s.id===sheetId);if(!sh)return 0;
 const probe=structuredClone(state),where=[];
 rewriteSheet(probe.sheets.find(s=>s.id===sheetId),f=>renameColumnInFormula(f,oldName,newName),where);
 for(const other of probe.sheets)rewriteSheet(other,f=>renameCrossColumnInFormula(f,sh.name,oldName,newName),where);
 lockError(where);
 const done=[];
 rewriteSheet(sh,f=>renameColumnInFormula(f,oldName,newName),done);
 for(const other of state.sheets)rewriteSheet(other,f=>renameCrossColumnInFormula(f,sh.name,oldName,newName),done);
 return done.length+renameSettings(state,sheetId,oldName,newName);
}

export function applySheetRename(state,oldName,newName){
 if(!oldName||!newName||oldName===newName)return 0;
 const probe=structuredClone(state),where=[];
 for(const s of probe.sheets)rewriteSheet(s,f=>renameSheetInFormula(f,oldName,newName),where);
 lockError(where);
 const done=[];for(const s of state.sheets)rewriteSheet(s,f=>renameSheetInFormula(f,oldName,newName),done);
 return done.length;
}
