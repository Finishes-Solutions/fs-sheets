// Shared by the browser and server. A parser/interpreter, never JavaScript eval.
const flat = x => x.flat(Infinity);
const num = x => { if (x === '' || x == null) return 0; const n = Number(x); if (!Number.isFinite(n)) throw Error('#VALUE!'); return n; };
const date = x => { const d = new Date(x); if (Number.isNaN(+d)) throw Error('#DATE!'); return d; };
const iso = d => d.toISOString().slice(0, 10);
const funcs = {
  SUM: (...x) => flat(x).reduce((a,b)=>a+num(b),0),
  AVG: (...x) => {const a=flat(x).filter(v=>v!==''&&v!=null);return a.length?a.reduce((s,v)=>s+num(v),0)/a.length:0;},
  MIN: (...x) => Math.min(...flat(x).map(num)), MAX: (...x) => Math.max(...flat(x).map(num)),
  COUNT: (...x) => flat(x).filter(v=>v!==''&&v!=null).length,
  COUNTIF: (a,c) => flat([a]).filter(v=>matches(v,c)).length,
  SUMIF: (a,c,b=a) => flat([a]).reduce((s,v,i)=>s+(matches(v,c)?num(flat([b])[i]):0),0),
  AND: (...x)=>flat(x).every(Boolean), OR: (...x)=>flat(x).some(Boolean), NOT:x=>!x,
  ROUND: (x,n=0)=>Number(num(x).toFixed(Math.max(0,Math.min(12,num(n))))), ABS:x=>Math.abs(num(x)),
  CONCATENATE:(...x)=>flat(x).join(''), JOIN:(a,s=', ')=>flat([a]).join(s),
  LEN:x=>String(x??'').length, UPPER:x=>String(x??'').toUpperCase(), LOWER:x=>String(x??'').toLowerCase(),
  LEFT:(x,n=1)=>String(x??'').slice(0,num(n)), RIGHT:(x,n=1)=>String(x??'').slice(-num(n)),
  CONTAINS:(x,a)=>String(a??'').includes(String(x)), ISBLANK:x=>x===''||x==null,
  TODAY:()=>iso(new Date()), DATE:(y,m,d)=>iso(new Date(Date.UTC(num(y),num(m)-1,num(d)))),
  YEAR:x=>date(x).getUTCFullYear(), MONTH:x=>date(x).getUTCMonth()+1, DAY:x=>date(x).getUTCDate(),
  DAYS:(end,start)=>Math.round((date(end)-date(start))/86400000),
  INDEX:(a,n)=>{const v=flat([a])[num(n)-1];if(v===undefined)throw Error('#REF!');return v;},
  MATCH:(x,a)=>{const n=flat([a]).findIndex(v=>v===x);if(n<0)throw Error('#NO MATCH');return n+1;},
};
function matches(v,c){if(typeof c==='string'){const m=c.match(/^(>=|<=|<>|>|<|=)(.*)$/);if(m){const a=Number.isNaN(Number(m[2]))?String(v):num(v),b=Number.isNaN(Number(m[2]))?m[2]:Number(m[2]);return ({'>':()=>a>b,'<':()=>a<b,'>=':()=>a>=b,'<=':()=>a<=b,'<>':()=>a!==b,'=':()=>a===b})[m[1]]();}}return String(v)===String(c);}
function lex(s){let out=[],i=0;while(i<s.length){if(/\s/.test(s[i])){i++;continue;}let m=s.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);if(m){out.push({t:'number',v:Number(m[0])});i+=m[0].length;continue;}if(s[i]==='"'){let v='';i++;let closed=false;while(i<s.length){if(s[i]==='"'){if(s[i+1]==='"'){v+='"';i+=2;}else{i++;closed=true;break;}}else v+=s[i++];}if(!closed)throw Error('#SYNTAX!');out.push({t:'string',v});continue;}m=s.slice(i).match(/^\$?\[([^\]]+)\](?:(@row|\$?\d+))?/i);if(m){out.push({t:'ref',v:{column:m[1],row:m[2]||null}});i+=m[0].length;continue;}m=s.slice(i).match(/^\{([^}]+)\}/);if(m){out.push({t:'cross',v:m[1]});i+=m[0].length;continue;}m=s.slice(i).match(/^[A-Za-z_][A-Za-z_0-9]*/);if(m){out.push({t:'id',v:m[0].toUpperCase()});i+=m[0].length;continue;}m=s.slice(i).match(/^(>=|<=|<>|[+\-*/^&=><(),:])/);if(m){out.push({t:m[0],v:m[0]});i+=m[0].length;continue;}throw Error('#SYNTAX!');}out.push({t:'eof'});return out;}
export function parseFormula(source){const ts=lex(source.replace(/^=/,''));let i=0;const peek=()=>ts[i],take=t=>{if(peek().t!==t)throw Error('#SYNTAX!');return ts[i++];};
 const prec={'=':1,'<>':1,'>':1,'<':1,'>=':1,'<=':1,'&':2,'+':3,'-':3,'*':4,'/':4,'^':5,':':6};
 function primary(){const t=ts[i++];if(t.t==='number'||t.t==='string')return {kind:'value',value:t.v};if(t.t==='ref'||t.t==='cross')return {kind:t.t,value:t.v};if(t.t==='-'||t.t==='+')return {kind:'unary',op:t.t,value:primary()};if(t.t==='('){const v=expr(0);take(')');return v;}if(t.t==='id'){if(t.v==='TRUE'||t.v==='FALSE')return {kind:'value',value:t.v==='TRUE'};take('(');let args=[];if(peek().t!==')'){do {args.push(expr(0));if(peek().t!==',')break;take(',');}while(true);}take(')');return {kind:'call',name:t.v,args};}throw Error('#SYNTAX!');}
 function expr(min){let left=primary();while(prec[peek().t]>=min){const op=ts[i++].t,right=expr(prec[op]+(op==='^'?0:1));left={kind:'binary',op,left,right};}return left;}
 const ast=expr(0);take('eof');return ast;
}
export function createCalculator(state){const cache=new Map(),active=new Set();
 function value(sheet,row,col){const key=`${sheet.id}/${row.id}/${col.id}`;if(cache.has(key))return cache.get(key);if(active.has(key))throw Error('#CIRCULAR!');active.add(key);try{const raw=col.formula||(row.cells[col.id]??'');const result=typeof raw==='string'&&raw.startsWith('=')?evaluate(parseFormula(raw),sheet,row,col):raw;cache.set(key,result);return result;}finally{active.delete(key);}}
 function column(sheet,name){const c=sheet.columns.find(c=>c.name.toLowerCase()===name.toLowerCase());if(!c)throw Error('#REF!');return c;}
 function ref(node,sheet,row){const c=column(sheet,node.value.column),r=node.value.row;if(!r)return sheet.rows.map(rr=>value(sheet,rr,c));const rr=r.toLowerCase()==='@row'?row:sheet.rows[Number(r.replace('$',''))-1];if(!rr)throw Error('#REF!');return value(sheet,rr,c);}
 function evaluate(n,s,r,c){if(n.kind==='value')return n.value;if(n.kind==='ref')return ref(n,s,r);if(n.kind==='cross'){const [sn,cn]=n.value.split('::');const target=state.sheets.find(s=>s.name===sn);if(!target||!cn)throw Error('#REF!');return target.rows.map(rr=>value(target,rr,column(target,cn)));}if(n.kind==='unary'){const v=num(evaluate(n.value,s,r,c));return n.op==='-'?-v:v;}
 if(n.kind==='call'){if(n.name==='IF'){if(n.args.length<2)throw Error('#ARGUMENT!');return evaluate(n.args[evaluate(n.args[0],s,r,c)?1:2]||{kind:'value',value:''},s,r,c);}if(n.name==='IFERROR'){try{return evaluate(n.args[0],s,r,c);}catch{return evaluate(n.args[1]||{kind:'value',value:''},s,r,c);}}
 if(['CHILDREN','PARENT','ANCESTORS'].includes(n.name)){const cc=n.args[0]?.kind==='ref'?column(s,n.args[0].value.column):c;let rows=[];if(n.name==='CHILDREN')rows=s.rows.filter(rr=>rr.parentId===r.id);else{let p=s.rows.find(rr=>rr.id===r.parentId),seen=new Set();while(p&&!seen.has(p.id)){seen.add(p.id);rows.push(p);if(n.name==='PARENT')break;p=s.rows.find(rr=>rr.id===p.parentId);}}return n.name==='PARENT'?(rows[0]?value(s,rows[0],cc):''):rows.map(rr=>value(s,rr,cc));}
 const f=funcs[n.name];if(!f)throw Error('#UNSUPPORTED!');return f(...n.args.map(a=>evaluate(a,s,r,c)));}
 if(n.op===':'){if(n.left.kind!=='ref'||n.right.kind!=='ref')throw Error('#REF!');const a=n.left.value,b=n.right.value;if(a.column!==b.column)throw Error('#UNSUPPORTED RANGE!');const cc=column(s,a.column);if(!a.row&&!b.row)return s.rows.map(rr=>value(s,rr,cc));const idx=x=>x==='@row'?s.rows.indexOf(r):Number((x||'').replace('$',''))-1;return s.rows.slice(idx(a.row),idx(b.row)+1).map(rr=>value(s,rr,cc));}
 const a=evaluate(n.left,s,r,c),b=evaluate(n.right,s,r,c);switch(n.op){case '+':return num(a)+num(b);case '-':return num(a)-num(b);case '*':return num(a)*num(b);case '/':if(num(b)===0)throw Error('#DIV/0!');return num(a)/num(b);case '^':return num(a)**num(b);case '&':return String(a)+String(b);case '=':return a==b;case '<>':return a!=b;case '>':return a>b;case '<':return a<b;case '>=':return a>=b;case '<=':return a<=b;}}
 return {get:(s,r,c)=>{try{const v=value(s,r,c);return Array.isArray(v)?v.join(', '):v;}catch(e){return e.message.startsWith('#')?e.message:'#ERROR!';}}};
}
export const supportedFunctions=[...Object.keys(funcs),'IF','IFERROR','CHILDREN','PARENT','ANCESTORS'].sort();
