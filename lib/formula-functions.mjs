// Pure spreadsheet operations. No dynamic code evaluation or network access.
export const flatten=x=>x.flat(Infinity);
export const blank=x=>x===''||x==null;
export const number=x=>{if(blank(x))return 0;if(typeof x==='string'&&/^#/.test(x))throw Error(x);const n=Number(x);if(!Number.isFinite(n))throw Error('#VALUE!');return n;};
export const error=code=>{throw Error(code);};
export const truth=x=>{if(typeof x==='string'&&/^#/.test(x))throw Error(x);return !blank(x)&&x!==false&&x!==0&&String(x).toUpperCase()!=='FALSE';};
export const isDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(x);
const epoch=Date.UTC(1899,11,30),day=86400000;
export function date(x){if(blank(x))throw Error('#DATE!');const d=typeof x==='number'?new Date(epoch+(x<60?x+1:x)*day):new Date(isDate(x)?x.slice(0,10)+'T00:00:00Z':x);if(!Number.isFinite(+d))throw Error('#DATE!');return d;}
export const iso=x=>x.toISOString().slice(0,10);
export function serial(x){const n=(date(x)-epoch)/day;return n<61?n-1:n;}
export function compare(a,b){if(blank(a))a=typeof b==='number'?0:'';if(blank(b))b=typeof a==='number'?0:'';if(isDate(a)&&typeof b==='number')a=serial(a);if(isDate(b)&&typeof a==='number')b=serial(b);if(typeof a==='string'&&typeof b==='string')return a.toLowerCase().localeCompare(b.toLowerCase());return a===b?0:a>b?1:-1;}
export function criteria(v,c){
 if(typeof c!=='string')return compare(v,c)===0;
 const m=c.match(/^(>=|<=|<>|>|<|=)?(.*)$/s),op=m[1]||'=',text=m[2];
 if(/[*?~]/.test(text)&&['=','<>'].includes(op)){let re='';for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='~'&&i+1<text.length){re+=text[++i].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}else re+=ch==='*'?'.*':ch==='?'?'.':ch.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}const ok=new RegExp('^'+re+'$','i').test(String(v??''));return op==='='?ok:!ok;}
 const target=text!==''&&Number.isFinite(Number(text))?Number(text):/^true$/i.test(text)?true:/^false$/i.test(text)?false:text;
 const a=typeof target==='number'&&v!==''&&Number.isFinite(Number(v))?Number(v):v,n=compare(a,target);
 return {'=':n===0,'<>':n!==0,'>':n>0,'<':n<0,'>=':n>=0,'<=':n<=0}[op];
}
const nums=args=>flatten(args).filter(v=>typeof v==='number'&&Number.isFinite(v));
const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:error('#DIV/0!');
const int=x=>Math.trunc(number(x));
const round=(x,n=0,mode='round')=>{const a=number(x),p=10**int(n);return Math.sign(a)*Math[mode](Math.abs(a)*p+Number.EPSILON)/p;};
function weekend(code=1){const map={1:'0000011',2:'1000001',3:'1100000',4:'0110000',5:'0011000',6:'0001100',7:'0000110',11:'0000001',12:'1000000',13:'0100000',14:'0010000',15:'0001000',16:'0000100',17:'0000010'};const mask=typeof code==='string'&&/^[01]{7}$/.test(code)?code:map[code];if(!mask||mask==='1111111')throw Error('#VALUE!');return d=>mask[(d.getUTCDay()+6)%7]==='1';}
export function workday(start,offset,code=1,holidays=[]){let d=date(start),n=int(offset);if(Math.abs(n)>100000)throw Error('#NUM!');const off=weekend(code),hol=new Set(flatten([holidays]).filter(v=>!blank(v)).map(v=>iso(date(v)))),step=n<0?-1:1;while(n){d=new Date(+d+step*day);if(!off(d)&&!hol.has(iso(d)))n-=step;}return iso(d);}
export function networkdays(start,end,code=1,holidays=[]){let a=date(start),b=date(end),sign=1;if(a>b){[a,b]=[b,a];sign=-1;}if((b-a)/day>100000)throw Error('#NUM!');const off=weekend(code),hol=new Set(flatten([holidays]).filter(v=>!blank(v)).map(v=>iso(date(v))));let n=0;for(let d=a;d<=b;d=new Date(+d+day))if(!off(d)&&!hol.has(iso(d)))n++;return sign*n;}
const matrix=a=>Array.isArray(a)?a.map(r=>Array.isArray(r)?r:[r]):[[a]];
const exact=(a,b)=>compare(a,b)===0;
function match(x,a,mode=0){const vs=flatten([a]);if(mode===0){const i=vs.findIndex(v=>criteria(v,x));return i<0?error('#NO MATCH'):i+1;}let found=-1;for(let i=0;i<vs.length;i++)if(mode>0?compare(vs[i],x)<=0:compare(vs[i],x)>=0)found=i;return found<0?error('#NO MATCH'):found+1;}
function lookup(x,table,index,approx=true,horizontal=false){let m=matrix(table);if(horizontal)m=transpose(m);const i=match(x,m.map(r=>r[0]),approx?1:0)-1;return m[i]?.[int(index)-1]??error('#REF!');}
function transpose(a){const m=matrix(a);return Array.from({length:Math.max(0,...m.map(r=>r.length))},(_,i)=>m.map(r=>r[i]??''));}
function sumproduct(...arrays){const a=arrays.map(x=>flatten([x]));if(!a.length)return 0;if(a.some(x=>x.length!==a[0].length))throw Error('#RANGE SIZE!');return a[0].reduce((s,_,i)=>s+a.reduce((p,x)=>p*(typeof x[i]==='number'?x[i]:0),1),0);}
export const functions={
 SUM:(...x)=>nums(x).reduce((a,b)=>a+b,0),AVERAGE:(...x)=>avg(nums(x)),AVG:(...x)=>avg(nums(x)),MIN:(...x)=>Math.min(...(nums(x).length?nums(x):[0])),MAX:(...x)=>Math.max(...(nums(x).length?nums(x):[0])),
 COUNT:(...x)=>flatten(x).filter(v=>!blank(v)).length,COUNTA:(...x)=>flatten(x).filter(v=>!blank(v)).length,COUNTBLANK:(...x)=>flatten(x).filter(blank).length,COUNTM:(...x)=>flatten(x).filter(v=>!blank(v)).length,
 COUNTIF:(a,c)=>flatten([a]).filter(v=>criteria(v,c)).length,
 SUMIF:(a,c,b=a)=>{const aa=flatten([a]),bb=flatten([b]);if(aa.length!==bb.length)throw Error('#RANGE SIZE!');return aa.reduce((s,v,i)=>s+(criteria(v,c)&&typeof bb[i]==='number'?bb[i]:0),0);},
 AVERAGEIF:(a,c,b=a)=>{const aa=flatten([a]),bb=flatten([b]);if(aa.length!==bb.length)throw Error('#RANGE SIZE!');return avg(bb.filter((v,i)=>typeof v==='number'&&criteria(aa[i],c)));},
 SUMPRODUCT:sumproduct,PRODUCT:(...x)=>nums(x).reduce((a,b)=>a*b,1),MEDIAN:(...x)=>{const a=nums(x).sort((a,b)=>a-b),i=Math.floor(a.length/2);return a.length?a.length%2?a[i]:(a[i-1]+a[i])/2:error('#NUM!');},
 LARGE:(a,k)=>nums([a]).sort((a,b)=>b-a)[int(k)-1]??error('#NUM!'),SMALL:(a,k)=>nums([a]).sort((a,b)=>a-b)[int(k)-1]??error('#NUM!'),
 STDEV:(...x)=>{const a=nums(x),m=avg(a);return a.length>1?Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/(a.length-1)):error('#DIV/0!');},
 'STDEV.P':(...x)=>{const a=nums(x),m=avg(a);return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length);},
 AND:(...x)=>flatten(x).every(truth),OR:(...x)=>flatten(x).some(truth),NOT:x=>!truth(x),XOR:(...x)=>flatten(x).filter(truth).length%2===1,TRUE:()=>true,FALSE:()=>false,
 ROUND:(x,n=0)=>round(x,n),ROUNDUP:(x,n=0)=>round(x,n,'ceil'),ROUNDDOWN:(x,n=0)=>round(x,n,'floor'),INT:x=>Math.floor(number(x)),TRUNC:(x,n=0)=>round(x,n,'floor'),ABS:x=>Math.abs(number(x)),SIGN:x=>Math.sign(number(x)),
 MOD:(x,y)=>number(y)===0?error('#DIV/0!'):number(x)-number(y)*Math.floor(number(x)/number(y)),POWER:(x,y)=>number(x)**number(y),SQRT:x=>number(x)<0?error('#NUM!'):Math.sqrt(number(x)),EXP:x=>Math.exp(number(x)),LN:x=>number(x)<=0?error('#NUM!'):Math.log(number(x)),LOG:(x,b=10)=>number(x)<=0||number(b)<=0||number(b)===1?error('#NUM!'):Math.log(number(x))/Math.log(number(b)),LOG10:x=>number(x)<=0?error('#NUM!'):Math.log10(number(x)),PI:()=>Math.PI,
 CEILING:(x,s=1)=>number(s)===0?0:Math.ceil(number(x)/Math.abs(number(s)))*Math.abs(number(s)),FLOOR:(x,s=1)=>number(s)===0?0:Math.floor(number(x)/Math.abs(number(s)))*Math.abs(number(s)),MROUND:(x,m)=>number(m)===0?0:round(number(x)/number(m))*number(m),
 CONCATENATE:(...x)=>flatten(x).join(''),CONCAT:(...x)=>flatten(x).join(''),JOIN:(a,s=', ')=>flatten([a]).join(s),TEXTJOIN:(sep,ignore,...x)=>flatten(x).filter(v=>!truth(ignore)||!blank(v)).join(sep),
 LEN:x=>String(x??'').length,UPPER:x=>String(x??'').toUpperCase(),LOWER:x=>String(x??'').toLowerCase(),PROPER:x=>String(x??'').toLowerCase().replace(/\b\p{L}/gu,c=>c.toUpperCase()),TRIM:x=>String(x??'').trim().replace(/ +/g,' '),CLEAN:x=>String(x??'').replace(/[\x00-\x1F]/g,''),
 LEFT:(x,n=1)=>int(n)<0?error('#VALUE!'):String(x??'').slice(0,int(n)),RIGHT:(x,n=1)=>int(n)<0?error('#VALUE!'):int(n)===0?'':String(x??'').slice(-int(n)),MID:(x,start,n)=>int(start)<1||int(n)<0?error('#VALUE!'):String(x??'').slice(int(start)-1,int(start)-1+int(n)),
 FIND:(search,x,start=1)=>{if(int(start)<1)throw Error('#VALUE!');const i=String(x??'').indexOf(String(search),int(start)-1);return i<0?error('#VALUE!'):i+1;},SEARCH:(search,x,start=1)=>functions.FIND(String(search).toLowerCase(),String(x??'').toLowerCase(),start),
 SUBSTITUTE:(x,old,replacement,n)=>{const text=String(x??'');if(old==='')return text;if(n===undefined)return text.split(String(old)).join(String(replacement));let count=0;return text.split(String(old)).reduce((s,part,i)=>s+(i?(++count===int(n)?replacement:old):'')+part,'');},
 REPLACE:(x,start,n,replacement)=>int(start)<1||int(n)<0?error('#VALUE!'):String(x).slice(0,int(start)-1)+replacement+String(x).slice(int(start)-1+int(n)),REPT:(x,n)=>int(n)<0||String(x).length*int(n)>100000?error('#VALUE!'):String(x).repeat(int(n)),
 EXACT:(a,b)=>String(a)===String(b),CONTAINS:(x,a)=>String(a??'').includes(String(x)),HAS:(a,x)=>flatten([a]).some(v=>exact(v,x)),CHAR:x=>String.fromCharCode(int(x)),CODE:x=>String(x).charCodeAt(0),
 VALUE:x=>{if(isDate(x))return serial(x);const s=String(x).trim(),n=Number(s.replace(/[$,]/g,'').replace(/%$/,''));return Number.isFinite(n)?n*(s.endsWith('%')?.01:1):error('#VALUE!');},N:x=>typeof x==='number'?x:typeof x==='boolean'?+x:isDate(x)?serial(x):0,
 ISBLANK:blank,ISNUMBER:x=>typeof x==='number'&&Number.isFinite(x),ISTEXT:x=>typeof x==='string',ISLOGICAL:x=>typeof x==='boolean',ISEVEN:x=>int(x)%2===0,ISODD:x=>Math.abs(int(x)%2)===1,NA:()=>error('#N/A'),
 TODAY:()=>iso(new Date()),NOW:()=>new Date().toISOString(),DATE:(y,m,d)=>{let year=int(y);if(year>=0&&year<1900)year+=1900;return iso(new Date(Date.UTC(year,int(m)-1,int(d))));},DATEONLY:x=>iso(date(x)),DATEVALUE:serial,YEAR:x=>date(x).getUTCFullYear(),MONTH:x=>date(x).getUTCMonth()+1,DAY:x=>date(x).getUTCDate(),
 DAYS:(end,start)=>Math.round((date(end)-date(start))/day),NETDAYS:(start,end)=>Math.round((date(end)-date(start))/day)+1,
 WEEKDAY:(x,mode=1)=>{const d=date(x).getUTCDay();if(number(mode)===1)return d+1;if(number(mode)===2)return (d+6)%7+1;if(number(mode)===3)return (d+6)%7;throw Error('#VALUE!');},
 EDATE:(x,n)=>{const d=date(x),original=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+int(n));const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(original,last));return iso(d);},EOMONTH:(x,n)=>{const d=date(x);return iso(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+int(n)+1,0)));},
 WORKDAY:(x,n,h=[])=>workday(x,n,1,h),'WORKDAY.INTL':workday,NETWORKDAYS:(a,b,h=[])=>networkdays(a,b,1,h),'NETWORKDAYS.INTL':networkdays,
 INDEX:(a,row,col=1)=>{const m=matrix(a),r=int(row),c=int(col);if(r===0)return m.map(x=>x[c-1]??error('#REF!'));if(c===0)return m[r-1]??error('#REF!');return m[r-1]?.[c-1]??error('#REF!');},MATCH:match,XMATCH:(x,a,mode=0,search=1)=>{let vs=flatten([a]);if(search===-1){const i=[...vs].reverse().findIndex(v=>exact(v,x));return i<0?error('#N/A'):vs.length-i;}return match(x,a,mode);},
 VLOOKUP:(x,a,i,approx=true)=>lookup(x,a,i,truth(approx)),HLOOKUP:(x,a,i,approx=true)=>lookup(x,a,i,truth(approx),true),
 XLOOKUP:(x,a,b,missing,mode=0,search=1)=>{const aa=flatten([a]),bb=flatten([b]);if(aa.length!==bb.length)throw Error('#RANGE SIZE!');let indices=aa.map((_,i)=>i);if(search===-1)indices.reverse();let i=indices.find(i=>mode===2?criteria(aa[i],x):exact(aa[i],x));if(i===undefined&&[-1,1].includes(mode)){const options=indices.filter(i=>mode===-1?compare(aa[i],x)<0:compare(aa[i],x)>0).sort((i,j)=>compare(aa[i],aa[j])*(mode===-1?-1:1));i=options[0];}return i===undefined?missing===undefined?error('#N/A'):missing:bb[i];},
 ROWS:a=>matrix(a).length,COLUMNS:a=>Math.max(0,...matrix(a).map(r=>r.length)),TRANSPOSE:transpose,
 DISTINCT:a=>[...new Set(flatten([a]))],UNIQUE:a=>{const seen=new Set();return matrix(a).filter(r=>{const key=JSON.stringify(r);if(seen.has(key))return false;seen.add(key);return true;});},
 SORT:(a,index=1,order=1)=>matrix(a).slice().sort((x,y)=>compare(x[int(index)-1],y[int(index)-1])*number(order)),
 FILTER:(a,include,missing)=>{const m=matrix(a),b=flatten([include]);if(m.length!==b.length)throw Error('#RANGE SIZE!');const out=m.filter((_,i)=>truth(b[i]));return out.length?out:missing===undefined?error('#CALC!'):missing;},
 SEQUENCE:(rows=1,cols=1,start=1,step=1)=>{const r=int(rows),c=int(cols);if(r<1||c<1||r*c>10000)throw Error('#NUM!');return Array.from({length:r},(_,i)=>Array.from({length:c},(_,j)=>number(start)+(i*c+j)*number(step)));},
 PMT:(rate,nper,pv,fv=0,type=0)=>{const r=number(rate),n=number(nper),p=number(pv),f=number(fv);if(n===0)throw Error('#DIV/0!');return r===0?-(p+f)/n:-(r*(p*(1+r)**n+f))/((1+r*number(type))*((1+r)**n-1));},
 PV:(rate,nper,pmt,fv=0,type=0)=>{const r=number(rate),n=number(nper);return r===0?-number(pmt)*n-number(fv):-(number(pmt)*(1+r*number(type))*((1+r)**n-1)/r+number(fv))/(1+r)**n;},
 FV:(rate,nper,pmt,pv=0,type=0)=>{const r=number(rate),n=number(nper);return r===0?-number(pv)-number(pmt)*n:-(number(pv)*(1+r)**n+number(pmt)*(1+r*number(type))*((1+r)**n-1)/r);},
};
functions['STDEV.S']=functions.STDEV;
functions.TEXT=(x,pattern)=>{
 const original=String(pattern);if(original==='General')return String(x??'');
 if(/[0#]/.test(original)){
  const n=number(x),sections=original.split(';'),explicitNegative=n<0&&sections.length>1;
  let p=sections[n===0&&sections.length>2?2:explicitNegative?1:0].replace(/\[(?:Red|Blue|Green|Yellow|Black|White)\]/gi,'');
  if(/^"[^"]*"$/.test(p))return p.slice(1,-1);
  const m=p.match(/^([^0#?]*)([0#,]+(?:\.[0#]+)?)([^0#?]*)$/);if(!m)throw Error('#UNSUPPORTED FORMAT!');
  const clean=t=>t.replace(/"([^"]*)"/g,'$1').replace(/\\(.)/g,'$1'),prefix=clean(m[1]),suffix=clean(m[3]),fraction=m[2].split('.')[1]||'',integer=m[2].split('.')[0],minimumFractionDigits=(fraction.match(/0/g)||[]).length,maximumFractionDigits=fraction.length;
  if(maximumFractionDigits>20)throw Error('#UNSUPPORTED FORMAT!');
  return prefix+new Intl.NumberFormat('en-US',{minimumIntegerDigits:Math.max(1,Math.min(21,(integer.match(/0/g)||[]).length)),minimumFractionDigits,maximumFractionDigits,useGrouping:integer.includes(',')}).format((explicitNegative?Math.abs(n):n)*(suffix.includes('%')?100:1))+suffix;
 }
 const p=original.replace(/"[^"]*"/g,'');if(!/[ymd]/i.test(p)||/[hs]/i.test(p))throw Error('#UNSUPPORTED FORMAT!');
 const d=date(x),pad=n=>String(n).padStart(2,'0');return original.replace(/"[^"]*"|yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d/gi,k=>k.startsWith('"')?k.slice(1,-1):({yyyy:d.getUTCFullYear(),yy:String(d.getUTCFullYear()).slice(-2),mmmm:d.toLocaleString('en-US',{month:'long',timeZone:'UTC'}),mmm:d.toLocaleString('en-US',{month:'short',timeZone:'UTC'}),mm:pad(d.getUTCMonth()+1),m:d.getUTCMonth()+1,dddd:d.toLocaleString('en-US',{weekday:'long',timeZone:'UTC'}),ddd:d.toLocaleString('en-US',{weekday:'short',timeZone:'UTC'}),dd:pad(d.getUTCDate()),d:d.getUTCDate()})[k.toLowerCase()]);
};
