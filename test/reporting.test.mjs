import test from 'node:test';
import assert from 'node:assert/strict';
import {entriesFor,runReport,summarize,distribution,compare,reportCSV} from '../lib/reporting.mjs';
const columns=[{id:'t',name:'Task'},{id:'s',name:'Status'},{id:'o',name:'Owner'},{id:'d',name:'Due'},{id:'b',name:'Budget'},{id:'c',name:'Calculated',formula:'=[Budget]@row * 2'}];
const state={sheets:[{id:'one',name:'Launch',columns,rows:[
 {id:'parent',cells:{t:'Parent',s:'In progress',o:'Alex',b:300}},
 {id:'a',parentId:'parent',cells:{t:'Design',s:'Complete',o:'Alex',d:'2026-11-01',b:100}},
 {id:'b',parentId:'parent',cells:{t:'Build',s:'In progress',o:'Sam',d:'2026-11-06',b:200}}
]},{id:'two',name:'Operations',columns,rows:[{id:'c',cells:{t:'Review',s:'In review',o:'Sam',d:'2026-10-30',b:50}},{id:'d',cells:{t:'No date',s:'Not started',o:'',b:0}}]}]};
test('report sources and leaf selection avoid duplicate totals',()=>{assert.equal(entriesFor(state,['one']).length,3);const rows=entriesFor(state,['one','two'],{leafOnly:true});assert.equal(rows.length,4);assert.equal(summarize(rows).sum,350);});
test('all and any filter modes evaluate independently',()=>{const filters=[{column:'Status',operator:'not',value:'Complete'},{column:'Owner',operator:'equals',value:'Sam'}];assert.equal(runReport(state,{sheetIds:['one','two'],filters,match:'all'}).rows.length,2);assert.equal(runReport(state,{sheetIds:['one','two'],filters,match:'any'}).rows.length,4);});
test('report queries use calculated values',()=>{const result=runReport(state,{sheetIds:['one'],filters:[{column:'Calculated',operator:'gt',value:300}],leafOnly:true});assert.deepEqual(result.rows.map(r=>r.rowId),['b']);});
test('grouping and numeric sorting preserve source identities',()=>{const r=runReport(state,{sheetIds:['one','two'],leafOnly:true,sortBy:'Budget',sortDirection:'desc',groupBy:'Owner'});assert.deepEqual(r.rows.map(e=>e.rowId),['b','a','c','d']);assert.deepEqual(r.groups.map(g=>[g.name,g.rows.length]),[['Sam',2],['Alex',1],['Unassigned',1]]);});
test('legacy report filters remain usable',()=>{assert.equal(runReport(state,{sheetIds:['one'],column:'Status',equals:'Complete'}).rows.length,1);});
test('empty and invalid numeric/date comparisons have predictable behavior',()=>{assert.equal(compare('','gt','-1'),false);assert.equal(compare('x','before','2026-11-02'),false);assert.equal(compare('','empty',''),true);assert.equal(compare(0,'notEmpty',''),true);assert.equal(compare('DESIGN','contains','sign'),true);});
test('dashboard overdue excludes completed and undated work',()=>{const result=summarize(entriesFor(state,['one','two'],{leafOnly:true}),{asOf:'2026-11-02'});assert.deepEqual(result,{total:4,complete:1,open:3,overdue:1,completion:25,sum:350,average:87.5});});
test('distributions and empty dashboards are supported',()=>{assert.deepEqual(distribution(entriesFor(state,['two']),'Owner'),[{name:'Sam',count:1},{name:'Unassigned',count:1}]);assert.equal(summarize([]).completion,0);assert.equal(summarize([]).average,0);});
test('CSV escapes quotes and exports requested columns',()=>{const rows=[{title:'A "quoted", item',sheetName:'Launch',values:{Budget:20}}];assert.equal(reportCSV(rows,['$task','$sheet','Budget']),'"Item","Source sheet","Budget"\r\n"A ""quoted"", item","Launch","20"');});
