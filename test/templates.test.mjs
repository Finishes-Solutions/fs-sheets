import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {instantiateTemplate,summaryValue} from '../lib/templates.mjs';
import {portfolioMetrics} from '../lib/planning.mjs';
import {createCalculator} from '../lib/formulas.mjs';
import {budgetActualChart} from '../public/charts.mjs';

const U=()=>randomUUID();
function workspace(){
 const [b,s,qty,unit,tot,item,task,cost]=[U(),U(),U(),U(),U(),U(),U(),U()],[r1,r2,r3]=[U(),U(),U()];
 const budget={id:b,workspaceId:'w',folderId:'tpl',name:'Budget',columns:[{id:item,name:'Item',type:'text',formula:''},{id:qty,name:'Qty',type:'number',formula:''},{id:unit,name:'Unit',type:'currency',formula:''},{id:tot,name:'Total',type:'currency',formula:'=[Qty]@row * [Unit]@row'}],
  rows:[{id:r1,cells:{[item]:'Sitework'},comments:[{id:U(),text:'x',by:'a',at:'t'}],attachments:[]},{id:r2,parentId:r1,cells:{[item]:'Grading',[qty]:2,[unit]:100},comments:[],attachments:[],budgetSource:{x:1}},{id:r3,parentId:r1,cells:{[item]:'Paving',[qty]:3,[unit]:'=CELLREF("'+r2+'", "'+unit+'")'},comments:[],attachments:[]}],
  summaryFields:[{id:U(),name:'Total budget',value:'=SUM([Total]:[Total])'}],forms:[{id:U(),name:'Intake',columnIds:[item,qty]}],automations:[],formatRules:[{id:U(),conditions:[{columnId:tot,operator:'gt',value:'100'}],targetIds:[tot],format:{bold:true}}]};
 const sched={id:s,workspaceId:'w',folderId:'tpl',name:'Schedule',columns:[{id:task,name:'Task',type:'text',formula:''},{id:cost,name:'Cost',type:'currency',formula:''}],rows:[{id:U(),cells:{[task]:'Kickoff',[cost]:'=SUM({Budget::Total})'},comments:[],attachments:[]}],forms:[],automations:[]};
 return {workspaces:[{id:'w',name:'W'}],folders:[{id:'tpl',workspaceId:'w',name:'Project template',template:true}],sheets:[budget,sched],reports:[{id:U(),workspaceId:'w',name:'Open items',sheetIds:[b,s],columns:['$task']},{id:U(),workspaceId:'w',name:'Other',sheetIds:[b,'elsewhere']}],dashboards:[]};
}
const values=st=>{const c=createCalculator(st);return st.sheets.map(s=>s.rows.map(r=>s.columns.map(col=>c.get(s,r,col))));};

test('a project from a template is an independent copy with rewired references',()=>{
 const st=workspace(),before=JSON.stringify(st);
 const p=instantiateTemplate(st,{folderId:'tpl',projectName:'Job 42',mode:'all',workspaceId:'w',makeId:U});
 assert.equal(JSON.stringify(st),before,'template untouched');
 assert.deepEqual(p.sheets.map(s=>s.name),['Job 42 – Budget','Job 42 – Schedule']);
 const oldIds=new Set();JSON.stringify(st.sheets,(k,v)=>{if(k==='id')oldIds.add(v);return v;});
 JSON.stringify(p.sheets,(k,v)=>{if(k==='id')assert.ok(!oldIds.has(v),'every id is new');return v;});
 assert.equal(p.sheets[1].rows[0].cells[p.sheets[1].columns[1].id],'=SUM({Job 42 – Budget::Total})');
 assert.match(p.sheets[0].rows[2].cells[p.sheets[0].columns[2].id],new RegExp('CELLREF\\("'+p.sheets[0].rows[1].id+'", "'+p.sheets[0].columns[2].id+'"\\)'),'CELLREF ids follow the copies');
 assert.equal(p.sheets[0].rows[1].parentId,p.sheets[0].rows[0].id);assert.deepEqual(p.sheets[0].forms[0].columnIds,p.sheets[0].columns.slice(0,2).map(c=>c.id));
 assert.equal(p.sheets[0].rows[0].comments.length,0);assert.equal(p.sheets[0].rows[1].budgetSource,undefined,'import audit is not copied');
 assert.equal(p.reports.length,1);assert.deepEqual(p.reports[0].sheetIds,p.sheets.map(s=>s.id));assert.equal(p.reports[0].name,'Job 42 – Open items');
 const next={...st,folders:[...st.folders,p.folder],sheets:[...st.sheets,...p.sheets]};
 assert.deepEqual(values(next).slice(2),values(st),'copies calculate exactly like the template');
});

test('copy modes: clear entered values, or structure only',()=>{
 const st=workspace();
 const c=instantiateTemplate(st,{folderId:'tpl',projectName:'Job 43',mode:'clear',workspaceId:'w',makeId:U}).sheets[0];
 assert.equal(c.rows.length,3);assert.equal(c.rows[1].cells[c.columns[0].id],'Grading','row titles kept');assert.equal(c.rows[1].cells[c.columns[1].id],'','amounts cleared');assert.match(c.rows[2].cells[c.columns[2].id],/^=CELLREF/,'formulas kept');
 const s=instantiateTemplate(st,{folderId:'tpl',projectName:'Job 44',mode:'structure',workspaceId:'w',makeId:U}).sheets[0];
 assert.equal(s.rows.length,0);assert.equal(s.columns[3].formula,'=[Qty]@row * [Unit]@row');assert.equal(s.formatRules.length,1);
 assert.throws(()=>instantiateTemplate(st,{folderId:'tpl',projectName:' ',workspaceId:'w',makeId:U}),/project name/);
 const again=instantiateTemplate({...st,sheets:[...st.sheets,{...st.sheets[0],id:'x',name:'Job 45 – Budget'}]},{folderId:'tpl',projectName:'Job 45',workspaceId:'w',makeId:U});
 assert.equal(again.sheets[0].name,'Job 45 – Budget 2','names stay unique');
});

test('portfolio rollup: budget from a summary field avoids double-counting; variance and chart',()=>{
 const st=workspace(),b=st.sheets[0];
 b.summaryFields.push({id:U(),name:'Actual to date',value:'1,250'});
 assert.equal(summaryValue(st,b,'total budget'),500);
 const [m]=portfolioMetrics(st,{sheetIds:[b.id],sheetMappings:{[b.id]:{budgetSummary:'Total budget',actualSummary:'Actual to date'}}});
 assert.equal(m.budget,500);assert.equal(m.actual,1250);assert.equal(m.variance,-750);assert.equal(m.budgetSource,'Summary · Total budget');
 const [leaf]=portfolioMetrics(st,{sheetIds:[b.id],budgetColumn:'Total'});
 assert.equal(leaf.budget,500,'leaf rows only (the parent row is excluded)');assert.equal(leaf.actual,null);
 const svg=budgetActualChart([{name:'Job <A>',budget:100,actual:120},{name:'Job B',budget:50,actual:null}],{format:v=>v==null?'—':'$'+v});
 assert.match(svg,/^<svg/);assert.match(svg,/Job &lt;A&gt;/);assert.match(svg,/\$120 ▲/);assert.ok(!/#(?:f00|ff0000|0f0|00ff00)/i.test(svg),'monochrome');
});
