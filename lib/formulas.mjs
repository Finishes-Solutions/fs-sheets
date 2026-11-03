import {cellValue} from './columns.mjs';
import {functions,flatten,blank,number,truth,criteria,compare,isDate,date,serial,iso} from './formula-functions.mjs';
// Shared parser and interpreter. Workbook contents are never executed as code.
const bad=code=>{throw Error(code);},DAY=86400000,MAX_RANGE=200000;
const letters=index=>{let n=0;for(const c of index.toUpperCase())n=n*26+c.charCodeAt(0)-64;return n-1;};
function lex(source){
 if(typeof source!=='string'||source.length>20000)bad('#FORMULA LIMIT!');
 const out=[];let i=0;
 while(i<source.length){
  if(/\s/.test(source[i])){i++;continue;}
  let m=source.slice(i).match(/^(?:'((?:[^']|'')+)'|([A-Za-z_][\w. ]*))!(\$?[A-Za-z]{1,3}\$?\d+|\$?[A-Za-z]{1,3})(?![\w])/);
  if(m){const a=m[3].match(/^\$?([A-Za-z]+)\$?(\d+)?$/);out.push({t:'a1',v:{sheet:(m[1]||m[2]).replace(/''/g,"'"),column:letters(a[1]),row:a[2]?Number(a[2]):null}});i+=m[0].length;continue;}
  m=source.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?/);
  if(m){out.push({t:'number',v:Number(m[0])});i+=m[0].length;continue;}
  if(source[i]==='"'){let v='',closed=false;i++;while(i<source.length){if(source[i]==='"'){if(source[i+1]==='"'){v+='"';i+=2;}else{i++;closed=true;break;}}else v+=source[i++];}if(!closed)bad('#SYNTAX!');out.push({t:'string',v});continue;}
  m=source.slice(i).match(/^\$?\[([^\]]+)\](?:(@row|\$?\d+))?/i);
  if(m){out.push({t:'ref',v:{column:m[1],row:m[2]||null}});i+=m[0].length;continue;}
  if(source[i]==='{'){
   const end=source.indexOf('}',i);if(end<0)bad('#SYNTAX!');const body=source.slice(i+1,end);
   if(body.includes('::')||!/[;,]/.test(body)){out.push({t:'cross',v:body});i=end+1;continue;}
  }
  m=source.slice(i).match(/^#(?:DIV\/0!|N\/A|REF!|VALUE!|NUM!|NAME\?|NULL!|SPILL!|CALC!|CIRCULAR!)/i);
  if(m){out.push({t:'error',v:m[0].toUpperCase()});i+=m[0].length;continue;}
  m=source.slice(i).match(/^@cell\b/i);if(m){out.push({t:'criterion'});i+=m[0].length;continue;}
  m=source.slice(i).match(/^\$?([A-Za-z]{1,3})\$?(\d+)\b/);
  if(m&&!/^\s*\(/.test(source.slice(i+m[0].length))){out.push({t:'a1',v:{column:letters(m[1]),row:Number(m[2])}});i+=m[0].length;continue;}
  m=source.slice(i).match(/^\$?([A-Za-z_][A-Za-z_0-9.]*)(@row)?/i);
  if(m){out.push(m[2]?{t:'ref',v:{column:m[1],row:'@row'}}:{t:'id',v:m[1].toUpperCase(),original:m[1]});i+=m[0].length;continue;}
  m=source.slice(i).match(/^(>=|<=|<>|[+\-*/^&=><(),:;%{}])/);
  if(m){out.push({t:m[0],v:m[0]});i+=m[0].length;continue;}
  bad('#SYNTAX!');
 }
 out.push({t:'eof'});return out;
}
const parsed=new Map();
export function parseFormula(source){
 if(parsed.has(source))return parsed.get(source);
 const ts=lex(source.replace(/^=/,''));let i=0,depth=0;
 const peek=()=>ts[i],take=t=>{if(peek()?.t!==t)bad('#SYNTAX!');return ts[i++];};
 const prec={'=':1,'<>':1,'>':1,'<':1,'>=':1,'<=':1,'&':2,'+':3,'-':3,'*':4,'/':4,'^':5,':':6};
 function primary(){
  if(++depth>150)bad('#FORMULA LIMIT!');let node;const t=ts[i++];
  if(['number','string'].includes(t.t))node={kind:'value',value:t.v};
  else if(['ref','a1','cross','error'].includes(t.t))node={kind:t.t,value:t.v};
  else if(t.t==='criterion')node={kind:'criterion'};
  else if(t.t==='-'||t.t==='+')node={kind:'unary',op:t.t,value:primary()};
  else if(t.t==='('){node=expr(0);take(')');}
  else if(t.t==='{'){
   const rows=[[]];while(peek().t!=='}'){rows.at(-1).push(expr(0));if(peek().t===',')take(',');else if(peek().t===';'){take(';');rows.push([]);}else break;}take('}');if(rows.some(r=>r.length!==rows[0].length))bad('#VALUE!');node={kind:'array',rows};
  }else if(t.t==='id'){
   if(peek().t==='('){if(t.v.includes('.')&&!functions[t.v.replace(/^_XLFN\./,'')])bad('#SYNTAX!');take('(');const args=[];if(peek().t!==')'){while(true){args.push([',',';',')'].includes(peek().t)?{kind:'value',value:''}:expr(0));if(![',',';'].includes(peek().t))break;i++;}}take(')');node={kind:'call',name:t.v.replace(/^_XLFN\./,''),args};}
   else if(t.v==='TRUE'||t.v==='FALSE')node={kind:'value',value:t.v==='TRUE'};
   else node={kind:'name',value:t.original};
  }else bad('#SYNTAX!');
  while(peek().t==='%'){i++;node={kind:'percent',value:node};}
  depth--;return node;
 }
 function expr(min){let left=primary();while(prec[peek().t]>=min){const op=ts[i++].t,right=expr(prec[op]+(op==='^'?0:1));left={kind:'binary',op,left,right};}return left;}
 const ast=expr(0);take('eof');if(parsed.size>2000)parsed.clear();parsed.set(source,ast);return ast;
}
export function createCalculator(state){
 const cache=new Map(),active=new Set(),indices=new Map();let operations=0;
 const index=s=>{if(!indices.has(s.id))indices.set(s.id,{cols:new Map(s.columns.map(c=>[c.name.toLowerCase(),c])),rows:new Map(s.rows.map((r,i)=>[r.id,i])),children:new Map()});return indices.get(s.id);};
 function column(s,name){return index(s).cols.get(name.toLowerCase())||bad('#REF!');}
 function value(s,r,c){
  const key=`${s.id}/${r.id}/${c.id}`;if(cache.has(key))return cache.get(key);if(active.has(key))bad('#CIRCULAR!');if(active.size>150)bad('#FORMULA LIMIT!');
  active.add(key);try{
   if(c.type==='mirror'){
    const refs=r.cells[c.connectionColumnId]||[];if(!Array.isArray(refs))bad('#REF!');const values=refs.map(ref=>{const sh=state.sheets.find(sh=>sh.id===ref.sheetId),row=sh?.rows.find(row=>row.id===ref.rowId),cc=sh?.columns.find(cc=>cc.name===c.mirrorColumn||cc.id===c.mirrorColumn);if(!row||!cc)bad('#REF!');return value(sh,row,cc);});
    const numeric=values.filter(v=>typeof v==='number'),result=c.mirrorAggregate==='sum'?numeric.reduce((a,b)=>a+b,0):c.mirrorAggregate==='count'?values.length:c.mirrorAggregate==='min'?(numeric.length?Math.min(...numeric):''):c.mirrorAggregate==='max'?(numeric.length?Math.max(...numeric):''):values.join(', ');cache.set(key,result);return result;
   }
   if(c.type==='progress'){const columns=(c.progressColumnIds||[]).map(id=>s.columns.find(cc=>cc.id===id&&cc.type==='checkbox')).filter(Boolean),result=columns.length?columns.filter(cc=>value(s,r,cc)===true).length/columns.length:0;cache.set(key,result);return result;}
   let raw=r.formulaOverrides?.[c.id]?cellValue(state,s,r,c):c.formula||cellValue(state,s,r,c);
   if(c.formula&&!r.formulaOverrides?.[c.id]&&/\$?[A-Za-z]{1,3}\$?\d+/.test(c.formula))raw=translateFormula(c.formula,index(s).rows.get(r.id)-(c.formulaOriginRow||1)+1,0);
   const ast=typeof raw==='string'&&raw.startsWith('=')?parseFormula(raw):null;
   const excelNode=n=>n.kind==='a1'||n.kind==='binary'&&n.op===':'&&n.left.kind==='name'||(n.args||[]).some(excelNode)||n.left&&excelNode(n.left)||n.right&&excelNode(n.right)||n.value&&typeof n.value==='object'&&n.value.kind&&excelNode(n.value);
   const result=ast?evaluate(ast,s,r,c,undefined,s.formulaDialect==='excel'||!!excelNode(ast)):raw;
   if(typeof result==='number'&&!Number.isFinite(result))bad('#NUM!');cache.set(key,result);return result;
  }finally{active.delete(key);}
 }
 function resolve(n,s,r,inheritedSheet){
  if(n.kind==='a1'){
   const target=n.value.sheet?state.sheets.find(sh=>sh.name.toLowerCase()===n.value.sheet.toLowerCase()):inheritedSheet||s;if(!target)bad('#REF!');
   return {s:target,col:n.value.column,row:n.value.row==null?null:n.value.row-1};
  }
  if(n.kind==='ref')return {s,col:s.columns.indexOf(column(s,n.value.column)),row:n.value.row==null?null:n.value.row.toLowerCase()==='@row'?index(s).rows.get(r.id):Number(n.value.row.replace('$',''))-1};
  if(n.kind==='name'&&/^[A-Za-z]{1,3}$/.test(n.value))return {s:inheritedSheet||s,col:letters(n.value),row:null};
  if(n.kind==='value'&&Number.isInteger(n.value))return {s:inheritedSheet||s,col:null,row:n.value-1};
  if(n.kind==='cross'){
   const [sn,cn]=n.value.split('::'),target=state.sheets.find(sh=>sh.name===sn);if(!target||!cn)bad('#REF!');return {s:target,col:target.columns.indexOf(column(target,cn)),row:null};
  }
  bad('#REF!');
 }
 function readRef(n,s,r){const p=resolve(n,s,r);if(p.col<0||p.col>=p.s.columns.length||p.row!==null&&(p.row<0||p.row>=p.s.rows.length))bad('#REF!');return p.row==null?p.s.rows.map(rr=>value(p.s,rr,p.s.columns[p.col])):value(p.s,p.s.rows[p.row],p.s.columns[p.col]);}
 function range(a,b,s,r){
  const start=resolve(a,s,r),end=resolve(b,s,r,start.s);if(start.s!==end.s)bad('#REF!');const sh=start.s;
  const left=Math.min(start.col??0,end.col??sh.columns.length-1),right=Math.max(start.col??0,end.col??sh.columns.length-1),top=Math.min(start.row??0,end.row??sh.rows.length-1),bottom=Math.max(start.row??0,end.row??sh.rows.length-1);
  if(left<0||right>=sh.columns.length||top<0||bottom>=sh.rows.length)bad('#REF!');if((right-left+1)*(bottom-top+1)>MAX_RANGE)bad('#RANGE LIMIT!');
  return sh.rows.slice(top,bottom+1).map(rr=>sh.columns.slice(left,right+1).map(cc=>value(sh,rr,cc)));
 }
 function evaluate(n,s,r,c,criterion,excel=false){
  if(++operations>5000000)bad('#CALCULATION LIMIT!');
  const ev=node=>evaluate(node,s,r,c,criterion,excel);
  if(n.kind==='value')return n.value;if(n.kind==='error')bad(n.value);if(n.kind==='criterion')return criterion===undefined?bad('#INVALID CRITERION!'):criterion;
  if(n.kind==='array')return n.rows.map(row=>row.map(ev));
  if(['ref','a1','cross'].includes(n.kind))return readRef(n,s,r);
  if(n.kind==='name')return s.rows.map(rr=>value(s,rr,column(s,n.value)));
  if(n.kind==='percent')return number(ev(n.value))/100;
  if(n.kind==='unary'){const v=number(ev(n.value));return n.op==='-'?-v:v;}
  if(n.kind==='call'){
   const args=n.args;
   if(n.name==='CELLREF'){if(args.length!==2)bad('#ARGUMENT!');const rowId=ev(args[0]),colId=ev(args[1]),ri=rowId==='@row'?index(s).rows.get(r.id):index(s).rows.get(rowId),cc=s.columns.find(c=>c.id===colId);if(ri===undefined||!cc)bad('#REF!');return value(s,s.rows[ri],cc);}
   if(n.name==='IF'){if(args.length<2||args.length>3)bad('#ARGUMENT!');return ev(args[truth(ev(args[0]))?1:2]||{kind:'value',value:''});}
   if(['IFERROR','IFNA'].includes(n.name)){if(args.length!==2)bad('#ARGUMENT!');try{return ev(args[0]);}catch(e){if(n.name==='IFNA'&&!['#N/A','#NO MATCH'].includes(e.message))throw e;return ev(args[1]);}}
   if(['ISERROR','ISERR'].includes(n.name)){try{const v=ev(args[0]);return typeof v==='string'&&v.startsWith('#');}catch(e){return n.name==='ISERROR'||!['#N/A','#NO MATCH'].includes(e.message);}}
   if(n.name==='IFS'){for(let i=0;i<args.length;i+=2)if(truth(ev(args[i])))return args[i+1]?ev(args[i+1]):bad('#ARGUMENT!');bad('#N/A');}
   if(n.name==='SWITCH'){const v=ev(args[0]);for(let i=1;i+1<args.length;i+=2)if(compare(v,ev(args[i]))===0)return ev(args[i+1]);return args.length%2===0?ev(args.at(-1)):bad('#N/A');}
   if(n.name==='CHOOSE'){const i=number(ev(args[0]));return Number.isInteger(i)&&i>=1&&i<args.length?ev(args[i]):bad('#VALUE!');}
   if(['ROW','COLUMN'].includes(n.name)){const p=args[0]?resolve(args[0],s,r):{row:index(s).rows.get(r.id),col:s.columns.indexOf(c)};return (n.name==='ROW'?p.row:p.col)+1;}
   if(['CHILDREN','PARENT','ANCESTORS','DESCENDANTS'].includes(n.name)){
    const cc=args[0]?.kind==='ref'?column(s,args[0].value.column):args[0]?.kind==='a1'?s.columns[args[0].value.column]:c;if(!cc)bad('#REF!');
    let rows=[];
    if(['CHILDREN','DESCENDANTS'].includes(n.name)){
     const idx=index(s);if(!idx.children.size)for(const rr of s.rows){if(!idx.children.has(rr.parentId))idx.children.set(rr.parentId,[]);idx.children.get(rr.parentId).push(rr);}
     rows=idx.children.get(r.id)||[];if(n.name==='DESCENDANTS'){const seen=new Set([r.id]);const queue=[...rows];rows=[];while(queue.length){const rr=queue.shift();if(seen.has(rr.id))bad('#CIRCULAR!');seen.add(rr.id);rows.push(rr);queue.push(...(idx.children.get(rr.id)||[]));}}
    }else{let p=s.rows.find(rr=>rr.id===r.parentId);const seen=new Set([r.id]);while(p){if(seen.has(p.id))bad('#CIRCULAR!');seen.add(p.id);rows.push(p);if(n.name==='PARENT')break;p=s.rows.find(rr=>rr.id===p.parentId);}}
    return n.name==='PARENT'?(rows[0]?value(s,rows[0],cc):''):rows.map(rr=>value(s,rr,cc));
   }
   const containsCriterion=node=>node.kind==='criterion'||(node.args||[]).some(containsCriterion)||node.left&&containsCriterion(node.left)||node.right&&containsCriterion(node.right)||node.value&&typeof node.value==='object'&&containsCriterion(node.value);
   if(['COUNTIFS','SUMIFS','AVERAGEIFS','MINIFS','MAXIFS','COLLECT','COUNTIF','SUMIF','AVERAGEIF'].includes(n.name)){
    const isSingle=['COUNTIF','SUMIF','AVERAGEIF'].includes(n.name),isCount=['COUNTIF','COUNTIFS'].includes(n.name),offset=isCount?0:1;
    let data,tests;
    if(isSingle){if(args.length<2||args.length>3)bad('#ARGUMENT!');data=flatten([ev(args[2]||args[0])]);tests=[[args[0],args[1]]];}
    else{if(args.length<offset+2||(args.length-offset)%2)bad('#ARGUMENT!');data=isCount?flatten([ev(args[0])]):flatten([ev(args[0])]);tests=[];for(let i=offset;i<args.length;i+=2)tests.push([args[i],args[i+1]]);}
    const checks=tests.map(([range,cond])=>({values:flatten([ev(range)]),cond,expr:containsCriterion(cond),target:containsCriterion(cond)?null:ev(cond)}));
    if(checks.some(t=>t.values.length!==data.length))bad('#RANGE SIZE!');
    const found=data.filter((v,i)=>checks.every(t=>t.expr?truth(evaluate(t.cond,s,r,c,t.values[i],excel)):criteria(t.values[i],t.target)));
    if(isCount)return found.length;if(n.name==='COLLECT')return found;
    const numeric=found.filter(v=>typeof v==='number');if(['AVERAGEIF','AVERAGEIFS'].includes(n.name))return numeric.length?numeric.reduce((a,b)=>a+b,0)/numeric.length:bad('#DIV/0!');if(n.name==='MINIFS')return numeric.length?Math.min(...numeric):0;if(n.name==='MAXIFS')return numeric.length?Math.max(...numeric):0;return numeric.reduce((a,b)=>a+b,0);
   }
   const fn=functions[n.name];if(!fn)bad('#UNSUPPORTED!');const vals=args.map(ev);
   // COUNT follows Excel's numeric-only behavior for A1 formulas; named-column
   // formulas keep Smartsheet's count of nonempty values.
   if(n.name==='COUNT'&&excel)return flatten(vals).filter(v=>typeof v==='number').length;
   return fn(...vals);
  }
  if(n.kind!=='binary')bad('#SYNTAX!');if(n.op===':')return range(n.left,n.right,s,r);
  const a=ev(n.left),b=ev(n.right);
  if(Array.isArray(a)||Array.isArray(b)){
   // Array arithmetic supports SUMPRODUCT/FILTER masks without spilling cells.
   const aa=Array.isArray(a)?a.map(x=>Array.isArray(x)?x:[x]):null,bb=Array.isArray(b)?b.map(x=>Array.isArray(x)?x:[x]):null;
   if(aa&&bb&&(aa.length!==bb.length||aa.some((row,i)=>row.length!==bb[i].length)))bad('#RANGE SIZE!');
   return (aa||bb).map((row,i)=>row.map((_,j)=>binary(n.op,aa?aa[i][j]:a,bb?bb[i][j]:b)));
  }
  return binary(n.op,a,b);
 }
 function binary(op,a,b){
  if(['=','<>','>','<','>=','<='].includes(op)){const n=compare(a,b);return {'=':n===0,'<>':n!==0,'>':n>0,'<':n<0,'>=':n>=0,'<=':n<=0}[op];}
  if(op==='&')return String(a??'')+String(b??'');
  if((op==='+'||op==='-')&&isDate(a)){if(isDate(b))return op==='-'?Math.round((date(a)-date(b))/DAY):bad('#VALUE!');return iso(new Date(+date(a)+(op==='+'?1:-1)*number(b)*DAY));}
  if(op==='+'&&isDate(b))return iso(new Date(+date(b)+number(a)*DAY));
  switch(op){case '+':return number(a)+number(b);case '-':return number(a)-number(b);case '*':return number(a)*number(b);case '/':return number(b)===0?bad('#DIV/0!'):number(a)/number(b);case '^':return number(a)**number(b);}bad('#SYNTAX!');
 }
 const get=(s,r,c)=>{operations=0;try{const v=value(s,r,c);return Array.isArray(v)?flatten(v).join(', '):v;}catch(e){return e.message.startsWith('#')?e.message:'#ERROR!';}};
 return {get,raw:(s,r,c)=>{operations=0;return value(s,r,c);},dependencies:(source)=>{const result=[];const visit=n=>{if(['ref','a1','cross'].includes(n.kind))result.push({kind:n.kind,...(typeof n.value==='object'?n.value:{name:n.value})});for(const a of n.args||[])visit(a);if(n.left)visit(n.left);if(n.right)visit(n.right);if(n.value&&typeof n.value==='object'&&n.value.kind)visit(n.value);};visit(parseFormula(source));return result;}};
}
export const supportedFunctions=[...new Set([...Object.keys(functions),'IF','IFERROR','IFNA','ISERROR','ISERR','IFS','SWITCH','CHOOSE','ROW','COLUMN','CHILDREN','PARENT','ANCESTORS','DESCENDANTS','CELLREF','COUNTIFS','SUMIFS','AVERAGEIFS','MINIFS','MAXIFS','COLLECT'])].sort();

export function translateFormula(source,rowDelta=0,columnDelta=0){
 const label=n=>{if(n<0)return null;let out='';for(n++;n;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out;};
 let result='',i=0;
 while(i<source.length){
  if(source[i]==='"'){const start=i++;while(i<source.length){if(source[i++]==='"'){if(source[i]==='"')i++;else break;}}result+=source.slice(start,i);continue;}
  if(source[i]==="'"){const start=i++;while(i<source.length){if(source[i++]==="'"){if(source[i]==="'")i++;else break;}}result+=source.slice(start,i);continue;}
  const named=source.slice(i).match(/^(\$?\[[^\]]+\])(\$?)(\d+)/);
  if(named){const n=Number(named[3])+(named[2]?0:rowDelta);result+=n<1?'#REF!':named[1]+named[2]+n;i+=named[0].length;continue;}
  const bracket=source.slice(i).match(/^\$?\[[^\]]+\](?:@row)?|^\{[^}]+\}/i);if(bracket){result+=bracket[0];i+=bracket[0].length;continue;}
  const a=source.slice(i).match(/^(\$?)([A-Za-z]{1,3})(\$?)(\d+)\b/);
  if(a&&(i===0||!/[\w.]/.test(source[i-1]))&&!/^\s*[(!]/.test(source.slice(i+a[0].length))){const c=label(letters(a[2])+(a[1]?0:columnDelta)),r=Number(a[4])+(a[3]?0:rowDelta);result+=!c||r<1?'#REF!':a[1]+c+a[3]+r;i+=a[0].length;continue;}
  result+=source[i++];
 }
 return result;
}
