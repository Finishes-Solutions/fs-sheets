// Dashboard widgets: a total (metric tile) or a chart (bar, line, donut) computed from any sheet.
// Shared by the browser (rendering) and the server (validation).
import {createCalculator} from './formulas.mjs';

export const WIDGET_TYPES=['metric','bar','line','donut'];
export const AGGREGATIONS=['count','sum','avg','min','max'];
export function validateWidgets(state,d){
 if(d.widgets===undefined)return;
 if(!Array.isArray(d.widgets)||d.widgets.length>24)throw Error('Invalid dashboard widgets');
 for(const w of d.widgets){if(!w||typeof w.id!=='string'||!WIDGET_TYPES.includes(w.type)||!AGGREGATIONS.includes(w.agg||'count'))throw Error('Invalid dashboard widget');
  // A chart whose sheet or column was deleted (or not there in a restored version) never blocks a save:
  // it shows a “Sheet not found” / “column was deleted” note until someone edits or removes it.
  if(typeof w.sheetId!=='string')throw Error('Invalid dashboard widget');
  for(const k of ['groupBy','valueColumn','filterColumn'])if(w[k]!=null&&typeof w[k]!=='string')throw Error('Invalid dashboard widget');}
}
const blank=v=>v===''||v==null||(Array.isArray(v)&&!v.length);
const text=v=>Array.isArray(v)?v.join(', '):typeof v==='boolean'?(v?'Yes':'No'):String(v??'');
const reduce=(agg,vals)=>{const n=vals.filter(v=>typeof v==='number'&&Number.isFinite(v));if(agg==='count')return vals.length;if(!n.length)return 0;if(agg==='sum')return n.reduce((a,b)=>a+b,0);if(agg==='avg')return n.reduce((a,b)=>a+b,0)/n.length;return agg==='min'?Math.min(...n):Math.max(...n);};

export function widgetData(state,w,{calc=createCalculator(state),limit=8}={}){
 const s=state.sheets.find(x=>x.id===w.sheetId);if(!s)return {error:'Sheet not found'};
 const col=id=>s.columns.find(c=>c.id===id),g=col(w.groupBy),v=col(w.valueColumn),f=col(w.filterColumn),agg=w.agg||'count';
 if((w.groupBy&&!g)||(w.valueColumn&&!v)||(w.filterColumn&&!f))return {error:'A column this chart uses was deleted. Edit the chart to choose another.'};
 const parents=new Set(s.rows.map(r=>r.parentId).filter(Boolean));
 let rows=s.rows.filter(r=>!(w.leafOnly!==false&&parents.has(r.id)));
 if(f&&String(w.filterValue??'')!==''){const want=String(w.filterValue).trim().toLowerCase();rows=rows.filter(r=>text(calc.get(s,r,f)).trim().toLowerCase()===want);}
 const valueOf=r=>v?calc.get(s,r,v):1;
 if(w.type==='metric'||!g){const vals=agg==='count'?rows.filter(r=>!v||!blank(calc.get(s,r,v))):rows.map(valueOf);return {value:reduce(agg,agg==='count'?vals:vals),rows:rows.length,sheet:s.name,valueColumn:v};}
 const groups=new Map();
 for(const r of rows){let key=calc.get(s,r,g);if(g.type==='date'||(typeof key==='string'&&/^\d{4}-\d{2}-\d{2}/.test(key))){if(blank(key))continue;key=String(key).slice(0,7);}else key=blank(key)?'(blank)':text(key);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(valueOf(r));}
 let points=[...groups].map(([label,vals])=>({label,value:reduce(agg,vals)}));
 if(w.type==='line'||g.type==='date')points.sort((a,b)=>a.label.localeCompare(b.label));
 else{points.sort((a,b)=>b.value-a.value);if(points.length>limit){const rest=points.slice(limit-1);points=[...points.slice(0,limit-1),{label:`Other (${rest.length})`,value:agg==='count'||agg==='sum'?rest.reduce((a,p)=>a+p.value,0):reduce(agg,rest.map(p=>p.value))}];}}
 if(g.type==='date')points=points.map(p=>({...p,label:new Date(p.label+'-01T00:00:00Z').toLocaleDateString('en-US',{month:'short',year:'2-digit',timeZone:'UTC'})}));
 return {points,rows:rows.length,sheet:s.name,valueColumn:v};
}
