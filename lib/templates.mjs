// Project templates: any folder can be a blueprint. A new project copies every sheet in it with
// fresh ids, rewires references between the copied sheets, and optionally clears entered values.
import {renameSheetInFormula} from './formula-rename.mjs';
import {createCalculator} from './formulas.mjs';

const isFormula=v=>typeof v==='string'&&v.startsWith('=');
const escapeRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

// Collects every string `id` value inside an object tree (columns, rows, forms, rules, comments, …).
export function collectIds(node,out){if(Array.isArray(node))node.forEach(x=>collectIds(x,out));else if(node&&typeof node==='object'){if(typeof node.id==='string')out.add(node.id);for(const v of Object.values(node))if(v&&typeof v==='object')collectIds(v,out);}return out;}
// Replaces ids wherever they appear as JSON strings, object keys, or CELLREF("…") arguments inside formulas.
const UUID=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,IS_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function remapIds(obj,mapping){
 let text=JSON.stringify(obj).replace(UUID,m=>mapping.get(m)||m);
 const other=[...mapping.keys()].filter(k=>!IS_UUID.test(k));
 if(other.length){const pattern=new RegExp('(\\\\?")('+other.sort((a,b)=>b.length-a.length).map(escapeRe).join('|')+')(\\\\?")','g');text=text.replace(pattern,(m,q1,id,q2)=>q1===q2?q1+mapping.get(id)+q2:m);}
 return JSON.parse(text);
}

export const PROJECT_MODES={all:'Copy everything (rows and values)',clear:'Keep rows and formulas, clear entered values',structure:'Columns, formulas, rules and forms only (no rows)'};

export function instantiateTemplate(state,{folderId,projectName,mode='clear',workspaceId,makeId,separator=' – '}){
 const folder=state.folders.find(f=>f.id===folderId);if(!folder)throw Error('Template folder not found.');
 const name=String(projectName||'').trim();if(!name)throw Error('Enter a project name.');
 const sources=state.sheets.filter(s=>s.folderId===folderId);if(!sources.length)throw Error('The template folder has no sheets.');
 if(!PROJECT_MODES[mode])throw Error('Choose what to copy.');
 const taken=new Set(state.sheets.map(s=>s.name.toLowerCase()));
 const newName=s=>{let n=name+separator+s.name,k=2;const base=n;while(taken.has(n.toLowerCase()))n=base+' '+k++;taken.add(n.toLowerCase());return n;};
 const names=new Map(sources.map(s=>[s.id,newName(s)]));
 const ids=new Set();for(const s of sources)collectIds(s,ids);
 const mapping=new Map([...ids].map(id=>[id,makeId()]));
 const newFolder={id:makeId(),workspaceId,name,template:false,createdFrom:folder.id};
 const sheets=sources.map(src=>{
  const s=remapIds(src,mapping);
  Object.assign(s,{name:names.get(src.id),workspaceId,folderId:newFolder.id,description:src.description||'',createdFrom:{template:folder.name,sheetId:src.id}});
  delete s.source;delete s.budgetAudit;delete s.importColumnIds;delete s.formulaSuggestions;delete s.nextItemNumber;
  if(mode==='structure')s.rows=[];
  for(const r of s.rows){
   for(const k of ['comments','attachments','proofs'])r[k]=[];
   for(const k of ['cellHistory','smartsheetValues','budgetSource','budgetFormulas','itemNumber','createdAt','createdBy','updatedAt','updatedBy','lockedBy','lockedAt','source','sourceRow'])delete r[k];
   if(mode==='clear')for(const c of s.columns.slice(1))if(r.cells[c.id]!==undefined&&!isFormula(r.cells[c.id]))r.cells[c.id]=c.type==='checkbox'?false:'';
  }
  return s;});
 // References between template sheets follow the copies (references to other sheets are kept).
 for(const src of sources)for(const s of sheets){const rewrite=f=>renameSheetInFormula(f,src.name,names.get(src.id));for(const c of s.columns)if(c.formula)c.formula=rewrite(c.formula);for(const r of s.rows)for(const [k,v] of Object.entries(r.cells))if(isFormula(v))r.cells[k]=rewrite(v);for(const f of s.summaryFields||[])if(isFormula(f.value))f.value=rewrite(f.value);}
 const inside=item=>Array.isArray(item.sheetIds)&&item.sheetIds.length&&item.sheetIds.every(id=>names.has(id));
 const copyItem=item=>{const x=remapIds(item,new Map([...mapping,[item.id,makeId()]]));x.name=name+separator+item.name;x.workspaceId=workspaceId;return x;};
 return {folder:newFolder,sheets,reports:(state.reports||[]).filter(inside).map(copyItem),dashboards:(state.dashboards||[]).filter(inside).map(copyItem)};
}

// Value of a sheet-summary field (formula or literal), as shown in the summary panel.
export function summaryValue(state,sheet,fieldName,calc=createCalculator(state)){
 const f=(sheet.summaryFields||[]).find(x=>x.name.toLowerCase()===String(fieldName||'').toLowerCase());if(!f)return null;
 if(!isFormula(f.value)){const n=Number(String(f.value).replace(/[$,]/g,''));return Number.isFinite(n)?n:f.value;}
 return calc.get(sheet,{id:'summary-'+f.id,cells:{},parentId:null},{id:'summary',formula:f.value});
}
