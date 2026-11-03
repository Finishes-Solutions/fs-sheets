// Critical path for a scheduled sheet. Works in working-day units (weekend mask + holidays), using the
// sheet's own dates as early start/finish (the scheduler has already pushed tasks after their
// predecessors). A backward pass gives late dates; tasks with no slack are critical.
import {networkdays} from './formula-functions.mjs';

const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
export function dependencyRefs(sheet,row,depCol){
 const raw=depCol?row.cells[depCol.id]:null;if(!raw)return [];
 if(Array.isArray(raw))return raw.filter(r=>r&&r.rowId);
 return String(raw).split(/[,;]/).map(t=>t.trim()).filter(Boolean).map(t=>{const m=t.match(/^(\d+)\s*(FS|SS|FF|SF)?\s*(?:([+-])\s*(\d+)\s*d?)?$/i);if(!m)return null;const target=sheet.rows[Number(m[1])-1];return target?{rowId:target.id,type:(m[2]||'FS').toUpperCase(),lag:m[3]?Number(m[3]+m[4]):0}:null;}).filter(Boolean);
}

export function analyzeSchedule(sheet,config={}){
 const col=id=>sheet.columns.find(c=>c.id===id);
 const startC=col(config.startColumnId),endC=col(config.endColumnId),depC=col(config.dependencyColumnId);
 if(!startC||!endC)return null;
 const weekend=config.weekend||'0000001',holidays=config.holidays||[];
 const parents=new Set(sheet.rows.map(r=>r.parentId).filter(Boolean));
 const tasks=sheet.rows.filter(r=>!parents.has(r.id)&&validDate(r.cells[startC.id])&&validDate(r.cells[endC.id]));
 if(!tasks.length)return {tasks:new Map(),critical:new Set(),finish:null,links:[]};
 const base=tasks.reduce((m,r)=>r.cells[startC.id]<m?r.cells[startC.id]:m,tasks[0].cells[startC.id]);
 const idx=d=>d>=base?networkdays(base,d,weekend,holidays)-1:-(networkdays(d,base,weekend,holidays)-1);
 const info=new Map(tasks.map(r=>{const es=idx(r.cells[startC.id]),ef=Math.max(es,idx(r.cells[endC.id]));return [r.id,{es,ef,dur:ef-es+1,ls:Infinity,lf:Infinity,succ:[]}];}));
 const links=[];
 for(const r of tasks)for(const d of dependencyRefs(sheet,r,depC)){if(!info.has(d.rowId))continue;info.get(d.rowId).succ.push({rowId:r.id,type:d.type,lag:Number(d.lag)||0});links.push({from:d.rowId,to:r.id,type:d.type,lag:Number(d.lag)||0});}
 const projectFinish=Math.max(...[...info.values()].map(t=>t.ef));
 // backward pass in reverse topological order (iterate until stable; graphs are small)
 for(const t of info.values())if(!t.succ.length)t.lf=projectFinish;
 for(let pass=0;pass<info.size+1;pass++){let changed=false;
  for(const t of info.values()){let lf=projectFinish;// every task must also finish by the project finish (SS/SF successors alone don't cap it)
   for(const s of t.succ){const n=info.get(s.rowId);if(!Number.isFinite(n.lf))continue;const nls=n.lf-n.dur+1;
    const bound=s.type==='FS'?nls-s.lag-1:s.type==='SS'?nls-s.lag+t.dur-1:s.type==='FF'?n.lf-s.lag:n.lf-s.lag+t.dur;// SF: successor finishes on the predecessor's start + lag - 1 (as the scheduler places it)
    lf=Math.min(lf,bound);}
   if(Number.isFinite(lf)&&lf!==t.lf){t.lf=lf;changed=true;}}
  if(!changed)break;}
 const out=new Map(),critical=new Set();
 for(const [id,t] of info){const float=Number.isFinite(t.lf)?t.lf-t.ef:0;out.set(id,{float,critical:float<=0});if(float<=0)critical.add(id);}
 const finishRow=tasks.reduce((m,r)=>r.cells[endC.id]>m?r.cells[endC.id]:m,tasks[0].cells[endC.id]);
 return {tasks:out,critical,finish:finishRow,links:links.map(l=>({...l,critical:critical.has(l.from)&&critical.has(l.to)}))};
}
