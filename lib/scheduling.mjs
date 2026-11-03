import {workday,networkdays} from './formula-functions.mjs';
import {createCalculator} from './formulas.mjs';
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v));
export function scheduleSheet(state,sheet,config){
 const s=structuredClone(sheet),calc=createCalculator(state),start=s.columns.find(c=>c.id===config.startColumnId),finish=s.columns.find(c=>c.id===config.endColumnId),duration=s.columns.find(c=>c.id===config.durationColumnId),predecessor=s.columns.find(c=>c.id===config.dependencyColumnId),weekend=config.weekend||'0000001',holidays=config.holidays||[];
 if(start?.type!=='date'||finish?.type!=='date'||start.formula||finish.formula)throw Error('Choose editable start and finish date columns');
 if(!/^[01]{7}$/.test(weekend)||weekend==='1111111'||!holidays.every(validDate))throw Error('Invalid work calendar');
 const rows=new Map(s.rows.map(r=>[r.id,r])),active=new Set(),done=new Map(),children=new Set(s.rows.map(r=>r.parentId).filter(Boolean)),changes=[];
 function refs(row){const raw=predecessor?row.cells[predecessor.id]:[];if(!raw)return [];if(Array.isArray(raw))return raw;if(typeof raw!=='string')throw Error('Invalid predecessors on row '+(s.rows.indexOf(row)+1));return raw.split(/[,;]/).filter(x=>x.trim()).map(text=>{const m=text.trim().match(/^(\d+)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)d?$/i)||text.trim().match(/^(\d+)\s*(FS|SS|FF|SF)?$/i);if(!m||!s.rows[Number(m[1])-1])throw Error('Unresolved predecessor on row '+(s.rows.indexOf(row)+1)+': '+text);return {rowId:s.rows[Number(m[1])-1].id,type:(m[2]||'FS').toUpperCase(),lag:Number((m[3]||'0').replace(/\s/g,''))};});}
 const move=(date,n)=>workday(date,n,weekend,holidays),working=date=>networkdays(date,date,weekend,holidays)>0;
 function task(row){
  if(done.has(row.id))return done.get(row.id);if(active.has(row.id))throw Error('Circular dependency at row '+(s.rows.indexOf(row)+1));active.add(row.id);
  let a=row.cells[start.id],b=row.cells[finish.id];const rawDuration=duration?calc.get(sheet,sheet.rows.find(r=>r.id===row.id),sheet.columns.find(c=>c.id===duration.id)):'';
  let days=typeof rawDuration==='number'?rawDuration:/^\d+(?:\.\d+)?d?$/.test(String(rawDuration))?Number(String(rawDuration).replace(/d$/,'')):validDate(a)&&validDate(b)?Math.max(1,networkdays(a,b,weekend,holidays)):1;
  if(!Number.isFinite(days)||days<0||days>10000)throw Error('Invalid duration on row '+(s.rows.indexOf(row)+1));days=Math.max(1,Math.ceil(days));
  const dependencies=refs(row);let constrained=a;
  for(const ref of dependencies){const source=rows.get(ref.rowId);if(!source||source===row)throw Error('Invalid predecessor row');const p=task(source);if(!validDate(p.start)||!validDate(p.finish))throw Error('A predecessor is missing dates');let earliest;
   if(ref.type==='FS')earliest=move(p.finish,Number(ref.lag)+1);
   else if(ref.type==='SS')earliest=move(p.start,Number(ref.lag));
   else if(ref.type==='FF')earliest=move(move(p.finish,Number(ref.lag)),-(days-1));
   else if(ref.type==='SF')earliest=move(move(p.start,Number(ref.lag)-1),-(days-1));
   else throw Error('Invalid dependency relationship');
   if(!validDate(constrained)||earliest>constrained)constrained=earliest;
  }
  if(validDate(constrained)&&dependencies.length&&!children.has(row.id)){if(!working(constrained))constrained=move(constrained,1);a=constrained;b=move(a,days-1);if(row.locked&&(a!==row.cells[start.id]||b!==row.cells[finish.id]))throw Error('A dependent row is locked');if(a!==row.cells[start.id]||b!==row.cells[finish.id]){changes.push({rowId:row.id,row:s.rows.indexOf(row)+1,startBefore:row.cells[start.id],finishBefore:row.cells[finish.id],start:a,finish:b});row.cells[start.id]=a;row.cells[finish.id]=b;}}
  const result={start:a,finish:b};done.set(row.id,result);active.delete(row.id);return result;
 }
 for(const r of s.rows)task(r);
 s.scheduleConfig=structuredClone(config);return {sheet:s,changes};
}
export function captureBaseline(sheet,{startColumnId,endColumnId,id=()=>crypto.randomUUID()}){
 const next=structuredClone(sheet),start=next.columns.find(c=>c.id===startColumnId),finish=next.columns.find(c=>c.id===endColumnId);if(!start||!finish)throw Error('Choose source date columns');
 for(const [name,source] of [['Baseline Start',start],['Baseline Finish',finish]]){let c=next.columns.find(c=>c.name===name);if(c&&c.type!=='date')throw Error(name+' must be a date column');if(!c){c={id:id(),name,type:'date',options:[],formula:'',width:160};next.columns.push(c);}for(const row of next.rows){if(row.locked)throw Error('Unlock rows before capturing a baseline');row.cells[c.id]=row.cells[source.id]||'';}}
 next.baselineCapturedAt=new Date().toISOString();return next;
}
// Automatic rescheduling: for sheets whose schedule is set to update automatically, re-run the
// scheduler when dates, durations or predecessors change (or rows are added/removed). Errors such as
// a circular dependency never block the save; they are shown on the sheet (scheduleError).
export function autoSchedule(before,after){
 let ran=0;
 for(let i=0;i<after.sheets.length;i++){const s=after.sheets[i],cfg=s.scheduleConfig;if(!cfg?.auto)continue;
  const prev=before.sheets.find(x=>x.id===s.id);const keys=[cfg.startColumnId,cfg.endColumnId,cfg.durationColumnId,cfg.dependencyColumnId].filter(Boolean);
  const sig=sh=>JSON.stringify(sh.rows.map(r=>[r.id,r.parentId||null,keys.map(k=>r.cells[k]??null)]))+JSON.stringify(sh.scheduleConfig||null);
  if(prev&&sig(prev)===sig(s))continue;
  try{const {sheet}=scheduleSheet(after,s,cfg);rollUpParents(sheet,cfg);delete sheet.scheduleError;after.sheets[i]=sheet;ran++;}
  catch(e){s.scheduleError=String(e.message).slice(0,200);}
 }
 return ran;
}

// Summary (parent) rows span their children: earliest start to latest finish. Locked parents are kept.
export function rollUpParents(sheet,cfg){
 const kids=new Map();for(const r of sheet.rows)if(r.parentId){if(!kids.has(r.parentId))kids.set(r.parentId,[]);kids.get(r.parentId).push(r);}
 const byId=new Map(sheet.rows.map(r=>[r.id,r])),done=new Map();
 const span=r=>{if(done.has(r.id))return done.get(r.id);const list=kids.get(r.id);let out;
  if(!list){const a=r.cells[cfg.startColumnId],b=r.cells[cfg.endColumnId];out=validDate(a)&&validDate(b)?[a,b]:null;}
  else{const spans=list.map(span).filter(Boolean);out=spans.length?[spans.reduce((m,x)=>x[0]<m?x[0]:m,spans[0][0]),spans.reduce((m,x)=>x[1]>m?x[1]:m,spans[0][1])]:null;
   if(out&&!r.locked){r.cells[cfg.startColumnId]=out[0];r.cells[cfg.endColumnId]=out[1];}}
  done.set(r.id,out);return out;};
 for(const r of sheet.rows)if(!r.parentId||!byId.has(r.parentId))span(r);
}
