import {completionValue} from './planning-workspace.mjs';
import {createCalculator} from './formulas.mjs';

export const operators = [
  ['equals','is'], ['not','is not'], ['contains','contains'], ['empty','is empty'],
  ['notEmpty','is not empty'], ['gt','greater than'], ['gte','at least'],
  ['lt','less than'], ['lte','at most'], ['before','before date'], ['after','after date']
];
export function compare(actual,operator,expected){
  const a=String(actual??'').toLowerCase(), b=String(expected??'').toLowerCase();
  switch(operator){
    case 'equals':return a===b;
    case 'not':return a!==b;
    case 'contains':return a.includes(b);
    case 'empty':return actual==null||actual==='';
    case 'notEmpty':return actual!=null&&actual!=='';
    case 'gt': case 'gte': case 'lt': case 'lte':{
      if(a===''||b===''||!Number.isFinite(Number(a))||!Number.isFinite(Number(b)))return false;
      return ({gt:()=>Number(a)>Number(b),gte:()=>Number(a)>=Number(b),lt:()=>Number(a)<Number(b),lte:()=>Number(a)<=Number(b)})[operator]();
    }
    case 'before':case 'after':{const x=Date.parse(a),y=Date.parse(b);return Number.isFinite(x)&&Number.isFinite(y)&&(operator==='before'?x<y:x>y);}
    default:return false;
  }
}
export function entriesFor(state,sheetIds,{leafOnly=false,sheetMappings={}}={}){
 const calculator=createCalculator(state),entries=[];
 for(const sheet of state.sheets.filter(s=>sheetIds.includes(s.id))){
  const parentIds=new Set(sheet.rows.map(r=>r.parentId).filter(Boolean));
  for(const row of sheet.rows){
   if(leafOnly&&parentIds.has(row.id))continue;
   const values=Object.fromEntries(sheet.columns.map(c=>[c.name,calculator.get(sheet,row,c)]));
   const mapping=sheetMappings[sheet.id]||{},mappedValue=key=>{const c=sheet.columns.find(c=>c.id===mapping[key]||c.name===mapping[key]);return c?values[c.name]:'';};
   entries.push({sheetId:sheet.id,sheetName:sheet.name,rowId:row.id,title:mappedValue('titleColumn')||values[sheet.columns[0]?.name]||'Untitled',values,mapped:{$status:mappedValue('statusColumn'),$owner:mappedValue('ownerColumn'),$due:mappedValue('dueColumn'),$cost:mappedValue('costColumn'),$progress:mappedValue('progressColumn')}});
  }
 }
 return entries;
}
export function valueOf(entry,name){if(name==='$sheet')return entry.sheetName;if(name==='$task')return entry.title;if(name?.startsWith('$'))return entry.mapped?.[name]??'';const key=Object.keys(entry.values).find(k=>k.toLowerCase()===String(name).toLowerCase());return key===undefined?'':entry.values[key];}
export function runReport(state,report){
 let rows=entriesFor(state,report.sheetIds||[],{leafOnly:!!report.leafOnly,sheetMappings:report.sheetMappings||{}});
 const filters=report.filters||(report.equals?[{column:report.column||'Status',operator:'equals',value:report.equals}]:[]);
 if(filters.length)rows=rows.filter(e=>{const results=filters.map(f=>compare(valueOf(e,f.column),f.operator,f.value));return report.match==='any'?results.some(Boolean):results.every(Boolean);});
 if(report.sortBy)rows.sort((a,b)=>String(valueOf(a,report.sortBy)).localeCompare(String(valueOf(b,report.sortBy)),undefined,{numeric:true})*(report.sortDirection==='desc'?-1:1));
 const groups=[];
 for(const row of rows){const key=report.groupBy?String(valueOf(row,report.groupBy)||'Unassigned'):'All results';let group=groups.find(g=>g.name===key);if(!group){group={name:key,rows:[]};groups.push(group);}group.rows.push(row);}
 return {rows,groups};
}
export function summarize(entries,{statusColumn='Status',dateColumn='Due',metricColumn='Budget',asOf=new Date().toISOString().slice(0,10)}={}){
 const isComplete=e=>completionValue(valueOf(e,statusColumn),statusColumn==='$status'?valueOf(e,'$progress'):'')===1;
 const complete=entries.filter(isComplete).length;
 const overdue=entries.filter(e=>{const d=valueOf(e,dateColumn);return d&&Number.isFinite(Date.parse(d))&&String(d).slice(0,10)<asOf&&!isComplete(e);}).length;
 const nums=entries.map(e=>valueOf(e,metricColumn)).filter(x=>x!==''&&Number.isFinite(Number(x))).map(Number);
 return {total:entries.length,complete,open:entries.length-complete,overdue,completion:entries.length?Math.round(complete/entries.length*100):0,sum:nums.reduce((a,b)=>a+b,0),average:nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:0};
}
export function distribution(entries,column){const counts=new Map();for(const e of entries){const key=String(valueOf(e,column)||'Unassigned');counts.set(key,(counts.get(key)||0)+1);}return [...counts].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));}
export function reportCSV(entries,columns){const quote=v=>'"'+reportDisplay(v).replaceAll('"','""')+'"';return [columns.map(c=>quote(reportColumnLabel(c))).join(','),...entries.map(e=>columns.map(c=>quote(valueOf(e,c))).join(','))].join('\r\n');}

export function reportColumnLabel(column){return ({$task:'Item',$sheet:'Source sheet',$status:'Status',$owner:'Owner',$due:'Due date',$cost:'Cost'})[column]||column;}
export function reportDisplay(value){
 if(value==null||value==='')return '';
 if(Array.isArray(value))return value.map(reportDisplay).join(', ');
 if(typeof value==='object'){if(value.label&&value.url)return value.label+' ('+value.url+')';if(value.start||value.end)return [value.start,value.end].filter(Boolean).join(' – ');if(value.name)return value.name;if(value.address)return value.address;return JSON.stringify(value);}
 return String(value);
}
