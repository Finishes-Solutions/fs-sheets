import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../lib/seed.mjs';
import {validatePlanning,portfolioMetrics,scenarioState,viewRows} from '../lib/planning.mjs';
import {cellFormat} from '../lib/sheet-tools.mjs';
test('portfolios exclude parent totals and scenarios recalculate without changing live cells',()=>{
 const state=seed(),s=state.sheets[0],budget=s.columns.find(c=>c.name==='Budget'),spent=s.columns.find(c=>c.name==='Spent'),r=s.rows[1];
 const config={id:'scenario',workspaceId:s.workspaceId,name:'What if',sheetIds:[s.id],costColumn:'Remaining',changes:[{sheetId:s.id,rowId:r.id,columnId:spent.id,value:0}]};
 state.scenarios=[config];validatePlanning(state);
 const before=portfolioMetrics(state,config)[0],after=portfolioMetrics(scenarioState(state,config),config)[0];
 assert.equal(before.items,6);assert.equal(after.cost-before.cost,2800);assert.equal(r.cells[spent.id],2800);
 config.changes[0].columnId=s.columns.find(c=>c.formula).id;assert.throws(()=>validatePlanning(state),/editable/);
});
test('dynamic row filters and editable-column validation use source schema',()=>{
 const state=seed(),s=state.sheets[0],status=s.columns.find(c=>c.name==='Status');
 const view={id:'v',name:'Complete',workspaceId:s.workspaceId,sheetId:s.id,columnIds:[status.id],editableIds:[status.id],conditions:[{columnId:status.id,operator:'equals',value:'Complete'}]};
 state.dynamicViews=[view];validatePlanning(state);assert.equal(viewRows(state,view).length,1);
 view.editableIds=['other'];assert.throws(()=>validatePlanning(state),/columns/);
});
test('imported cell styling follows column identity after reorder and permits manual overrides',()=>{
 const s={columns:[{id:'b'},{id:'a'}],importColumnIds:['a','b'],importStyles:[{fill:'#ffffff',bold:false},{fill:'#ff0000',bold:true}]};
 const r={cells:{},importStyleIds:[1,0],cellFormats:{a:{italic:true}}};
 assert.deepEqual(cellFormat(s,r,s.columns[1],()=>''),{fill:'#ff0000',bold:true,italic:true});
 assert.equal(cellFormat(s,r,s.columns[0],()=> '').fill,'#ffffff');
});
