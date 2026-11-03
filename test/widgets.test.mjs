import test from 'node:test';
import assert from 'node:assert/strict';
import {widgetData,validateWidgets} from '../lib/widgets.mjs';
import {barChart,lineChart,donutChart} from '../public/charts.mjs';

const state=()=>({sheets:[{id:'s',name:'Jobs',columns:[{id:'job',name:'Job',type:'text',formula:'',options:[]},{id:'amt',name:'Amount',type:'currency',formula:'',options:[]},{id:'due',name:'Due',type:'date',formula:'',options:[]},{id:'st',name:'Status',type:'text',formula:'',options:[]}],
 rows:[{id:'p',cells:{job:'Phase'}},{id:'a',parentId:'p',cells:{job:'A',amt:100,due:'2026-11-03',st:'Open'}},{id:'b',parentId:'p',cells:{job:'B',amt:50,due:'2026-11-20',st:'Done'}},{id:'c',parentId:'p',cells:{job:'A',amt:25,due:'2026-12-01',st:'Open'}}]}]});

test('totals and groups use leaf rows, filters and aggregations', () => {
  const st=state();
  assert.equal(widgetData(st,{type:'metric',sheetId:'s',agg:'sum',valueColumn:'amt'}).value,175,'parent row excluded');
  assert.equal(widgetData(st,{type:'metric',sheetId:'s',agg:'count',filterColumn:'st',filterValue:'open'}).value,2);
  assert.deepEqual(widgetData(st,{type:'bar',sheetId:'s',groupBy:'job',agg:'sum',valueColumn:'amt'}).points,[{label:'A',value:125},{label:'B',value:50}]);
  assert.deepEqual(widgetData(st,{type:'line',sheetId:'s',groupBy:'due',agg:'count'}).points.map(p=>p.value),[2,1],'grouped by month in order');
  assert.throws(()=>validateWidgets(st,{widgets:[{id:'w',type:'pie',sheetId:'s'}]}),/Invalid dashboard widget/);
  assert.throws(()=>validateWidgets(st,{widgets:[{id:'w',type:'bar',sheetId:'gone'}]}),/deleted sheet/);
});

test('charts label every value and escape text', () => {
  const pts=[{label:'<b>A</b>',value:3},{label:'B',value:1}];
  for(const svg of [barChart(pts),lineChart(pts),donutChart(pts)]){assert.ok(!svg.includes('<b>A'));assert.ok(svg.includes('&lt;b&gt;A'));}
  assert.match(donutChart(pts),/75%/);
});
