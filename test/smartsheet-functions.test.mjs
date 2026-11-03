import test from 'node:test';
import assert from 'node:assert/strict';
import {functions as f} from '../lib/formula-functions.mjs';
import {createCalculator,supportedFunctions} from '../lib/formulas.mjs';

test('Smartsheet functions added in v0.11 compute like Smartsheet', () => {
  assert.equal(f.AVGW([1,2,3,'x'],[1,1,2,5]),2.25);
  assert.equal(f.STDEVS(2,4,4,4,5,5,7,9).toFixed(4),'2.1381');assert.equal(f.STDEVP(2,4,4,4,5,5,7,9),2);
  assert.equal(f.RANKEQ(5,[1,5,9]),2);assert.equal(f.RANKEQ(5,[1,5,9],1),2);assert.equal(f.RANKAVG(5,[5,5,9]),2.5);
  assert.equal(f.PERCENTILE([1,2,3,4],0.5),2.5);assert.equal(f.WEEKNUMBER('2026-11-02'),45);assert.equal(f.WEEKNUMBER('2027-01-01'),53);
  assert.equal(f.YEARDAY('2026-02-01'),32);assert.equal(f.ISDATE('2026-11-02'),true);assert.equal(f.ISBOOLEAN(false),true);
  assert.equal(f.TIME(13,5),'1:05 PM');assert.equal(f.TIME('9:30 pm'),'9:30 PM');assert.equal(f.DURATION('2w 3d 4h'),13.5);
  assert.equal(f.NPV(0.1,-100,60,60).toFixed(4),'3.7566');assert.equal(f.IRR([-100,60,60]).toFixed(6),'0.130662');assert.equal(f.UNICHAR(9731),'☃');
});

test('ISCRITICAL and TOTALFLOAT read the sheet schedule', () => {
  const cols=[{id:'s',name:'Start',type:'date',formula:'',options:[]},{id:'f',name:'Finish',type:'date',formula:'',options:[]},{id:'p',name:'Pred',type:'dependency',formula:'',options:[]},{id:'c',name:'Crit',type:'text',formula:'=ISCRITICAL([Start]@row)',options:[]},{id:'t',name:'Float',type:'text',formula:'=TOTALFLOAT([Start]@row)',options:[]}];
  const sheet={id:'x',name:'P',columns:cols,scheduleConfig:{startColumnId:'s',endColumnId:'f',dependencyColumnId:'p',weekend:'0000011'},rows:[{id:'a',cells:{s:'2026-11-02',f:'2026-11-06'}},{id:'b',cells:{s:'2026-11-09',f:'2026-11-10',p:[{rowId:'a',type:'FS',lag:0}]}},{id:'z',cells:{s:'2026-11-02',f:'2026-11-03'}}]};
  const calc=createCalculator({sheets:[sheet]});
  assert.equal(calc.get(sheet,sheet.rows[0],cols[3]),true);assert.equal(calc.get(sheet,sheet.rows[2],cols[3]),false);
  assert.equal(calc.get(sheet,sheet.rows[2],cols[4]),5);
  for(const n of ['AVGW','STDEVS','RANKEQ','WEEKNUMBER','ISCRITICAL','TOTALFLOAT','DURATION','NETWORKDAY'])assert.ok(supportedFunctions.includes(n),n);
});
