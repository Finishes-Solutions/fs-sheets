import {createCalculator} from './formulas.mjs';
const numeric=v=>typeof v==='number'&&Number.isFinite(v);
const close=(a,b,percent=false)=>numeric(a)&&numeric(b)&&Math.abs(a-b)<=Math.max(percent?1e-9:.005,Math.abs(a)*1e-11);
const empty=v=>v==null||v==='';
// Inferences are proposed cell by cell, then independently recalculated against
// every exported value. Ambiguous/nonmatching values are retained for review.
export function prepareBudget(input){
 const s=structuredClone(input),byName=new Map(s.columns.map(c=>[c.name,c])),col=name=>byName.get(name),ids=['Quantities/ Total Sqft','Cost Per sqft/Unit','Total Cost','Percentage of Price','Total SQFT','SQFT Price','Monthly','Yearly'].map(n=>col(n)?.id);
 if(ids.some(x=>!x)||!col('Description'))throw Error('This is not the expected project budget layout.');
 const [qty,rate,cost,percent,sqft,price,monthly,yearly]=ids,description=col('Description').id;
 const rows=new Map(s.rows.map(r=>[r.id,r])),children=new Map();for(const r of s.rows){if(!children.has(r.parentId))children.set(r.parentId,[]);children.get(r.parentId).push(r);r.budgetSource=structuredClone(r.cells);r.budgetFormulas={};}
 const source=(r,c)=>r.budgetSource[c]??'',label=r=>String(source(r,description)),ref=(r,c)=>`CELLREF("${r?.id||'@row'}", "${c}")`,self=c=>ref(null,c),checks=[],issues=[],summary=/^(?:sub\s*total|total(?: cost)?(?: project)?\s*:?)$/i;
 const propose=(r,c,formula,kind,note)=>{if(r.budgetFormulas[c])return false;r.budgetFormulas[c]={formula,kind,note,exported:source(r,c)};r.cells[c]=formula;checks.push({rowId:r.id,columnId:c,sourceRow:r.sourceRow,kind});return true;};
 const sumFormula=(r,c,list,all=false)=>all?`=SUM(CHILDREN())`:`=SUM(${list.map(x=>ref(x,c)).join(', ')})`;
 for(const r of s.rows){for(const c of s.columns){const v=source(r,c.id);if(typeof v==='string'&&v.startsWith('#'))issues.push({rowId:r.id,columnId:c.id,sourceRow:r.sourceRow,kind:'Source error',message:`Export contains ${v}. Original value retained.`});}}
 // Direct-child rollups, never descendants plus their subtotals.
 for(const r of [...s.rows].reverse())for(const c of [cost,rate,monthly,yearly,sqft]){
  const value=source(r,c),all=children.get(r.id)||[],valid=all.filter(x=>numeric(source(x,c))),detail=valid.filter(x=>!summary.test(label(x).trim()));if(!numeric(value)||value===0||!valid.length)continue;
  for(const list of [valid,detail])if(list.length&&all.every(x=>empty(source(x,c))||numeric(source(x,c)))&&close(value,list.reduce((n,x)=>n+source(x,c),0))){propose(r,c,sumFormula(r,c,list,list===valid),'Child rollup','Sum of direct children; nested detail is not counted twice.');break;}
 }
 // Explicit subtotal/total rows that follow a block of sibling costs.
 for(const r of s.rows){if(!summary.test(label(r).trim()))continue;const siblings=children.get(r.parentId)||[],i=siblings.indexOf(r);let prior=siblings.slice(0,i);let start=-1;for(let j=prior.length-1;j>=0;j--)if(summary.test(label(prior[j]).trim())){start=j;break;}
  const candidates=[prior.slice(start+1),...(start>=0?[prior.slice(start)]:[])];
  for(const c of [cost,monthly,yearly,sqft]){if(r.budgetFormulas[c]||!numeric(source(r,c))||source(r,c)===0)continue;for(const block of candidates){const list=block.filter(x=>numeric(source(x,c)));if(list.length>=2&&block.every(x=>empty(source(x,c))||numeric(source(x,c)))&&close(source(r,c),list.reduce((n,x)=>n+source(x,c),0))){propose(r,c,sumFormula(r,c,list),'Section total','Sum of preceding sibling lines, stopping at the prior total.');break;}}}
 }
 for(const r of s.rows){const q=source(r,qty),u=source(r,rate),t=source(r,cost),m=source(r,monthly),y=source(r,yearly),h=source(r,sqft),p=source(r,price);
  if(!r.budgetFormulas[cost]&&numeric(q)&&numeric(u)&&numeric(t)&&q!==0&&close(t,q*u))propose(r,cost,`=IF(OR(ISBLANK(${self(qty)}), ISBLANK(${self(rate)})), "", ${self(qty)} * ${self(rate)})`,'Quantity × rate','Quantity and unit rate are treated as editable drivers. This direction is inferred, not recovered.');
  if(!r.budgetFormulas[cost]&&numeric(q)&&numeric(u)&&numeric(t)&&q!==0&&u!==0&&t!==0&&close(t,q-u))propose(r,cost,`=IF(OR(ISBLANK(${self(qty)}), ISBLANK(${self(rate)})), "", ${self(qty)} - ${self(rate)})`,'Budget less spent','This section repurposes the quantity/rate fields as amounts: first amount minus second amount matches exported balance.');
  if(!r.budgetFormulas[rate]&&!r.budgetFormulas[cost]?.kind.includes('Quantity')&&numeric(q)&&q!==0&&numeric(u)&&numeric(t)&&close(u,t/q))propose(r,rate,`=IF(OR(ISBLANK(${self(qty)}), ${self(qty)} = 0), "", ${self(cost)} / ${self(qty)})`,'Blended unit rate','Total cost divided by quantity.');
  if(!r.budgetFormulas[monthly]&&numeric(h)&&h!==0&&numeric(p)&&numeric(m)&&m!==0&&close(m,h*p))propose(r,monthly,`=IF(OR(ISBLANK(${self(sqft)}), ISBLANK(${self(price)})), "", ${self(sqft)} * ${self(price)})`,'Monthly amount','Area/units × the rate recorded in SQFT Price.');
  if(!r.budgetFormulas[yearly]&&numeric(m)&&m!==0&&numeric(y)&&close(y,m*12))propose(r,yearly,`=IF(ISBLANK(${self(monthly)}), "", ${self(monthly)} * 12)`,'Annual amount','Monthly amount × 12.');
  if(!r.budgetFormulas[yearly]&&empty(m)&&numeric(h)&&h!==0&&numeric(p)&&numeric(y)&&y!==0&&close(y,h*p))propose(r,yearly,`=${self(sqft)} * ${self(price)}`,'Area × price','Export records area × price in Yearly with no monthly amount; retained as a sale/value calculation.');
 }
 // Shares require a matching, identifiable denominator in the same hierarchy.
 for(const r of s.rows){const t=source(r,cost),pct=source(r,percent);if(!numeric(t)||!numeric(pct)||pct===0||pct===1)continue;let parent=rows.get(r.parentId),denominator;while(parent){if(numeric(source(parent,cost))&&source(parent,cost)!==0&&close(pct,t/source(parent,cost),true)){denominator=parent;break;}parent=rows.get(parent.parentId);}
  if(!denominator){const totals=(children.get(r.parentId)||[]).filter(x=>x.id!==r.id&&summary.test(label(x).trim())&&numeric(source(x,cost))&&source(x,cost)!==0&&close(pct,t/source(x,cost),true));if(totals.length===1)denominator=totals[0];}
  if(denominator)propose(r,percent,`=IF(OR(ISBLANK(${ref(denominator,cost)}), ${ref(denominator,cost)} = 0), "", ${self(cost)} / ${ref(denominator,cost)})`,'Share of total',`Cost divided by source row ${denominator.sourceRow}: ${label(denominator)}.`);
  else issues.push({rowId:r.id,columnId:percent,sourceRow:r.sourceRow,kind:'Unresolved percentage',message:'No unique matching total in this row’s hierarchy. Exported percentage retained.'});
 }
 // Reject inferred dependency cycles and cascaded differences. Preserve source.
 let rejected=0;for(let pass=0;pass<4;pass++){const calc=createCalculator({sheets:[s]}),failures=[];for(const r of s.rows)for(const [id,evidence] of Object.entries(r.budgetFormulas)){const c=s.columns.find(x=>x.id===id),result=calc.get(s,r,c);if(!close(evidence.exported,result,id===percent))failures.push([r,id,evidence,result]);}if(!failures.length)break;for(const [r,id,evidence,result] of failures){r.cells[id]=evidence.exported;delete r.budgetFormulas[id];rejected++;issues.push({rowId:r.id,columnId:id,sourceRow:r.sourceRow,kind:'Unresolved calculation',message:`Candidate ${evidence.kind} did not reconcile (${result}). Exported value retained.`});}}
 for(const r of s.rows){const q=source(r,qty),u=source(r,rate),t=source(r,cost);if(numeric(q)&&numeric(u)&&numeric(t)&&q!==0&&!r.budgetFormulas[cost]&&!close(t,q*u))issues.push({rowId:r.id,columnId:cost,sourceRow:r.sourceRow,kind:'Quantity/rate difference',message:`Exported cost ${t} differs from quantity × rate (${q*u}). Could be a lump sum, adjustment, or repurposed columns. Retained for review.`});}
 const count={};for(const r of s.rows)for(const e of Object.values(r.budgetFormulas))count[e.kind]=(count[e.kind]||0)+1;
 const calc=createCalculator({sheets:[s]});let verified=0;for(const r of s.rows)for(const c of s.columns){const original=source(r,c.id),actual=calc.get(s,r,c);if(numeric(original)?!close(original,actual,c.id===percent):String(original)!==String(actual))throw Error(`Budget reconciliation failed at source row ${r.sourceRow}, ${c.name}: ${original} vs ${actual}`);verified++;}
 // A clean working view; all source fields and source row numbers remain intact.
 s.columns=[col('Description'),...s.columns.filter(c=>c.id!==description)];for(const c of s.columns){delete c.sourceHeaderFormat;delete c.format;if(ids.includes(c.id)){c.numericFormat=c.id===percent?'percent':c.id===qty||c.id===sqft?'number':'currency';c.format={align:'right'};}c.width=c.id===description?420:c.name==='Comments'?280:150;if(['Property Type','Column12','Column13'].includes(c.name))c.hidden=true;}
 delete s.importStyles;delete s.importColumnIds;for(const r of s.rows)delete r.importStyleIds;
 s.name='Project budgets 2024–2025';s.description='Imported budget with reconciled formula inferences. Source errors and ambiguous calculations are retained in Import review. Quantity and rate are assumed inputs where their product matches exported cost.';
 s.budgetAudit={sourceFile:s.source.file,sourceHash:s.source.sha256,importedAt:new Date().toISOString(),rowCount:s.rows.length,verifiedCells:verified,formulaCounts:count,formulaCount:Object.values(count).reduce((a,b)=>a+b,0),rejected,issues,method:'Inferred from exported values, not original formulas. All source cells reconciled within half a cent (percentages within 1e-9). Inputs and all exceptions retained.'};
 return s;
}
