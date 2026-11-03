import {createCalculator} from './formulas.mjs';
const same=(a,b)=>String(a??'')===String(b??'')||(typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)<1e-8);
const blank=v=>v==null||v==='';
export function inferFormulas(state,{asOf='2026-11-02'}={}){
 const report=[];
 for(const s of state.sheets.filter(s=>s.source?.file)){
  const has=name=>s.columns.some(c=>c.name===name),ref=name=>'['+name+']@row';
  const candidates=[];
  if(has('Submit Date')){
   for(const [target,expr,reason] of [
    ['Month','MONTH([Submit Date]@row)','Calendar month of submission'],['Year','YEAR([Submit Date]@row)','Calendar year of submission'],
    ['1 day late','WORKDAY(DATEONLY([Submit Date]@row), 1)','One weekday after submission; no holiday calendar was exported'],
    ['2 days','WORKDAY(DATEONLY([Submit Date]@row), 2)','Two weekdays after submission; no holiday calendar was exported'],
    ['4 days','WORKDAY(DATEONLY([Submit Date]@row), 4)','Four weekdays after submission; no holiday calendar was exported'],
    ['Archive:','DAYS(TODAY(), DATEONLY([Submit Date]@row))','Elapsed calendar days since submission; dynamic TODAY() replaces the export snapshot date']
   ])if(has(target))candidates.push({target,formula:`=IF(ISBLANK([Submit Date]@row), "", ${expr})`,reason});
  }
  const start=has('Start')?'Start':has('Start Date:')?'Start Date:':null,end=has('Finish')?'Finish':has('Finish Date')?'Finish Date':null;
  if(start&&end&&has('Duration'))candidates.push({target:'Duration',formula:`=IF(OR(ISBLANK(${ref(start)}), ISBLANK(${ref(end)})), "", MAX(1, NETWORKDAYS.INTL(${ref(start)}, ${ref(end)}, 11)) & "d")`,reason:'Inclusive duration on a Monday–Saturday calendar; same-day Sunday tasks have a minimum of one day'});
  if(end&&has('Baseline Finish')&&has('Variance'))candidates.push({target:'Variance',formula:`=IF(OR(ISBLANK([Baseline Finish]@row), ISBLANK(${ref(end)})), "", IF([Baseline Finish]@row = ${ref(end)}, 0, IF([Baseline Finish]@row > ${ref(end)}, NETWORKDAYS.INTL(${ref(end)}, [Baseline Finish]@row, 11) - 1, -(NETWORKDAYS.INTL([Baseline Finish]@row, ${ref(end)}, 11) - 1)) & "d"))`,reason:'Baseline finish minus actual finish in working-day boundaries, Monday–Saturday; positive is early and negative is late'});
  if(has('Balance Left:')&&has('Schedule Totals:')&&has('Pay App:'))candidates.push({target:'Balance Left:',formula:'=IF(ISBLANK([Schedule Totals:]@row), "", [Schedule Totals:]@row - [Pay App:]@row)',reason:'Candidate subtraction; grouped payment allocations may explain mismatches. Financial values are left unchanged.',financial:true});
  for(const candidate of candidates){
   const c=s.columns.find(c=>c.name===candidate.target);if(c.formula)continue;
   // Freeze TODAY only for testing against the known export date. Installed
   // formulas use TODAY and are explicitly labeled as live age calculations.
   const [y,m,d]=asOf.split('-').map(Number),comparison=candidate.formula.replace(/TODAY\(\)/g,`DATE(${y},${m},${d})`),computed={...c,formula:comparison},calculator=createCalculator(state);
   const exceptions=[];let eligible=0,matched=0,errors=0;const overrides=[];
   for(const r of s.rows){
    const original=r.cells[c.id]??'',result=calculator.get(s,r,computed);
    if(!blank(original)){eligible++;if(same(original,result))matched++;else{exceptions.push({rowId:r.id,row:r.sourceRow? r.sourceRow-1:s.rows.indexOf(r)+1,original,predicted:result});if(String(result).startsWith('#'))errors++;}}
    if(!same(original,result))overrides.push(r.id);
   }
   const ratio=eligible?matched/eligible:0,canApply=eligible>=20&&ratio>=.99&&errors===0&&!candidate.financial&&!s.rows.some(r=>r.locked);
   report.push({...candidate,sheetId:s.id,sheetName:s.name,columnId:c.id,asOf,eligible,matched,ratio,errors,exceptions,overrideRowIds:overrides,canApply,status:canApply?'ready':'review-only',origin:'Inferred from exported values; not an original formula'});
  }
 }
 return report;
}
export function applyInferredFormulas(state,report){
 const next=structuredClone(state);
 for(const inference of report.filter(x=>x.canApply)){
  const s=next.sheets.find(s=>s.id===inference.sheetId),c=s.columns.find(c=>c.id===inference.columnId);
  c.formula=inference.formula;c.formulaInference={...inference,status:'applied'};
  for(const rowId of inference.overrideRowIds){const r=s.rows.find(r=>r.id===rowId);r.formulaOverrides={...r.formulaOverrides,[c.id]:true};}
 }
 for(const s of next.sheets){const suggestions=report.filter(x=>x.sheetId===s.id&&!x.canApply);if(suggestions.length)s.formulaSuggestions=suggestions;}
 return next;
}
