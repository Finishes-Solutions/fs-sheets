import test from 'node:test';
import assert from 'node:assert/strict';
import {createCalculator,translateFormula,supportedFunctions} from '../lib/formulas.mjs';
const setup=(formula)=>{const s={id:'s',name:'Main',columns:[{id:'a',name:'Amount'},{id:'b',name:'Type'},{id:'c',name:'Result'}],rows:[{id:'r1',cells:{a:10,b:'A',c:formula}},{id:'r2',cells:{a:20,b:'B'}},{id:'r3',cells:{a:30,b:'A'}}]};const other={id:'o',name:"Other sheet",columns:[{id:'oa',name:'Amount'}],rows:[{id:'or',cells:{oa:40}}]};const state={sheets:[s,other]};return {s,state,get:()=>createCalculator(state).get(s,s.rows[0],s.columns[2])};};
const cases=[
 ['=SUM(A1:A3)',60],['=SUM($A$1:$A$3)',60],['=SUM(A:A)',60],['=SUM(A1:B3)',60],['=SUM(\'Other sheet\'!A1:A1)',40],['=\'Other sheet\'!$A$1+A2',60],['=2.5E2+10%',250.1],
 ['=SUMIFS(A1:A3,B1:B3,"A",A1:A3,">10")',30],['=COUNTIFS(B1:B3,"a",A1:A3,">=10")',2],['=AVERAGEIFS(A1:A3,B1:B3,"A")',20],['=MINIFS(A1:A3,B1:B3,"A")',10],['=MAXIFS(A1:A3,B1:B3,"A")',30],
 ['=SUM(COLLECT([Amount],[Type],"A",[Amount],@cell > 10))',30],['=COUNTIF([Amount],AND(@cell > 10,@cell < 30))',1],['=COUNTIF(B1:B3,"a*")',2],['=COUNTIF(B1:B3,"<>A")',1],['=COUNTIF(B1:B3,"~*")',0],
 ['=IFERROR(1/0,42)',42],['=IFNA(NA(),5)',5],['=IFNA(1/0,5)','#DIV/0!'],['=ISERROR(NA())',true],['=IFS(FALSE,1,TRUE,2)',2],['=SWITCH(2,1,"one",2,"two","other")','two'],['=CHOOSE(2,1,9,1/0)',9],
 ['=VLOOKUP(20,A1:B3,2,FALSE)', 'B'],['=XLOOKUP(30,A1:A3,B1:B3,"missing")','A'],['=XLOOKUP(99,A1:A3,B1:B3,"missing")','missing'],['=INDEX(A1:B3,2,2)','B'],['=MATCH(20,A1:A3,0)',2],['=MATCH(21,A1:A3,1)',2],
 ['=SUMPRODUCT(A1:A3,A1:A3)',1400],['=SUMPRODUCT((A1:A3>10)*A1:A3)',50],['=SUM(FILTER(A1:A3,A1:A3>10))',50],['=SUM(SEQUENCE(2,3))',21],['=INDEX(TRANSPOSE(A1:B3),2,2)','B'],['=COUNTA(UNIQUE(B1:B3))',2],
 ['=TEXTJOIN("-",TRUE,"a","","b")','a-b'],['=TRIM("  a   b  ")','a b'],['=SUBSTITUTE("a-b-a","a","z",2)','a-b-z'],['=MID("abcdef",2,3)','bcd'],['=RIGHT("abc",0)',''],['=SEARCH("B","abc")',2],['=VALUE("$1,234.50")',1234.5],
 ['=ROUND(-1.25,1)',-1.3],['=ROUNDDOWN(-1.29,1)',-1.2],['=ROUNDUP(1.21,1)',1.3],['=MOD(-3,2)',1],['=MEDIAN(1,7,3)',3],['=LARGE(A1:A3,2)',20],['=SQRT(-1)','#NUM!'],
 ['=WORKDAY(DATE(2026,11,6),1)','2026-11-09'],['=WORKDAY.INTL(DATE(2026,11,6),1,11)','2026-11-07'],['=WORKDAY(DATE(2026,11,6),-1)','2026-11-05'],['=NETWORKDAYS.INTL(DATE(2025,9,16),DATE(2026,4,7),11)',175],['=NETWORKDAYS(DATE(2026,11,6),DATE(2026,11,9))',2],
 ['=EOMONTH(DATE(2024,2,1),0)','2024-02-29'],['=EDATE(DATE(2024,1,31),1)','2024-02-29'],['=DATE(2026,11,2)+4','2026-11-06'],['=DATE(2026,11,6)-DATE(2026,11,2)',4],['=DATEONLY("2026-11-02T23:55:00")','2026-11-02'],['=YEAR(1)',1900],['=DATEVALUE("1900-01-01")',1],['=TEXT(DATE(2026,11,2),"yyyy-mm-dd")','2026-11-02'],
 ['=SUM(A3:A1)',60],['=SUM(A1:A99)','#REF!'],['=COUNTIFS(A1:A3,">0",B1:B2,"A")','#RANGE SIZE!'],['=MISSING(1)','#UNSUPPORTED!'],['=IF(FALSE,1/0,7)',7],['=IF(TRUE;9;1/0)',9],['=SUM({1,2;3,4})',10],
];
for(const [formula,expected] of cases)test(formula,()=>assert.equal(setup(formula).get(),expected));
test('relative and absolute copy references preserve strings, named columns, and quoted sheet names',()=>{
 assert.equal(translateFormula('=A1+$B$2+C$3+$D4+SUM(A1:B5)+"A1"+\'A1 sheet\'!A2+[Amount]2+[Amount]$1',2,1),'=B3+$B$2+D$3+$D6+SUM(B3:C7)+"A1"+\'A1 sheet\'!B4+[Amount]4+[Amount]$1');
 assert.equal(translateFormula('=A1',-1,0),'=#REF!');
});
test('column A1 formulas fill relatively while literal inference exceptions remain unchanged',()=>{
 const {s,state}=setup('');s.columns[2].formula='=A1*2';s.rows[1].formulaOverrides={c:true};s.rows[1].cells.c=99;
 const calc=createCalculator(state);assert.deepEqual(s.rows.map(r=>calc.get(s,r,s.columns[2])),[20,99,60]);
});
test('named and A1 references detect cross-sheet circular dependencies and expose dependency metadata',()=>{
 const {s,state}=setup("='Other sheet'!A1");state.sheets[1].rows[0].cells.oa='=Main!C1';assert.equal(createCalculator(state).get(s,s.rows[0],s.columns[2]),'#CIRCULAR!');assert.equal(createCalculator(state).dependencies('=A1+[Amount]@row').length,2);
});
test('large formulas and invalid weekmasks stop with bounded errors',()=>{
 assert.equal(setup('=SEQUENCE(1000000)').get(),'#NUM!');assert.equal(setup('=WORKDAY.INTL(DATE(2026,11,2),1,"1111111")').get(),'#VALUE!');assert.equal(setup('=1+'.repeat(10000)).get(),'#FORMULA LIMIT!');assert.ok(supportedFunctions.length>=130);
});
for(const [formula,result] of [
 ['=COUNT(B1:B3)',0],['=COUNT(TRANSPOSE(B1:B3))',0],['=COUNT([Type])',3],['=COUNT(B:B)',0],['=SUMIF([Type],"A",[Amount])',40],['=AVERAGE(A1:A3)',20],['=AVERAGE(B1:B3)','#DIV/0!'],
 ['=WORKDAY(DATE(2026,11,6),1,{"2026-11-09","2026-11-10"})','2026-11-11'],['=NETWORKDAYS(DATE(2026,11,9),DATE(2026,11,6))',-2],['=ROW(A3)',3],['=COLUMN(B2)',2],
 ['=PMT(0,10,1000)',-100],['=FV(0,10,-100)',1000],['=PV(0,10,-100)',1000],['=IF(ISERROR(A1/0),"bad",0)','bad'],['=ISERR(NA())',false],['=SQRT(9)',3],['=COLUMNS(A1:B3)',2],['=ROWS(A1:B3)',3]
])test('additional compatibility '+formula,()=>assert.equal(setup(formula).get(),result));
for(const [formula,result] of [['=TEXT(1234.5,"$#,##0.00")','$1,234.50'],['=TEXT(0.125,"0.0%")','12.5%'],['=TEXT(123,"00000")','00123'],['=TEXT(-123,"#,##0;(#,##0)")','(123)']])test('number-format compatibility '+formula,()=>assert.equal(setup(formula).get(),result));
