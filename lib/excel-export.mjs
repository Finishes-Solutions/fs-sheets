// Builds an Excel workbook description (written to .xlsx by scripts/export_xlsx.py) with live formulas.
// Sheet formulas use Smartsheet-style references; they are translated to Excel A1 references.
// Anything that cannot be translated faithfully is exported as its computed value with a note
// holding the original formula, so no number in the workbook is silently wrong.
import {createCalculator,translateFormula as shiftFormula} from './formulas.mjs';
import {cellFormat} from './sheet-tools.mjs';
import {displayCell,systemTypes} from './columns.mjs';

export const letter=i=>{let s='';i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;};
const lettersToIndex=l=>[...l.toUpperCase()].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0)-1;
const EXCEL_FUNCTIONS=new Set('SUM AVERAGE AVERAGEIF AVERAGEIFS COUNT COUNTA COUNTBLANK COUNTIF COUNTIFS IF IFERROR IFNA IFS AND OR NOT XOR MAX MIN MAXIFS MINIFS MEDIAN ROUND ROUNDUP ROUNDDOWN INT ABS MOD POWER SQRT EXP LN LOG LOG10 PI CEILING FLOOR MROUND TRUNC SIGN PRODUCT SUMIF SUMIFS SUMPRODUCT VLOOKUP HLOOKUP INDEX MATCH XLOOKUP XMATCH CHOOSE SWITCH LEFT RIGHT MID LEN LOWER UPPER PROPER TRIM SUBSTITUTE REPLACE REPT FIND SEARCH TEXT VALUE CONCATENATE CONCAT TEXTJOIN EXACT CHAR CODE CLEAN DATE DAY MONTH YEAR WEEKDAY TODAY NOW EDATE EOMONTH NETWORKDAYS NETWORKDAYS.INTL WORKDAY WORKDAY.INTL DAYS DATEVALUE ISBLANK ISNUMBER ISTEXT ISERROR ISERR ISLOGICAL ISEVEN ISODD N NA LARGE SMALL STDEV STDEV.S STDEV.P PMT PV FV TRUE FALSE'.split(' '));
const FUTURE=new Set(['XLOOKUP','XMATCH','IFS','SWITCH','CONCAT','TEXTJOIN','MAXIFS','MINIFS','IFNA','DAYS','STDEV.S','STDEV.P']);
const RENAMES={AVG:'AVERAGE'};

function maskBrackets(seg,fn){let out='',buf='',depth=null;for(const ch of seg){if(depth){out+=ch;if(ch===depth)depth=null;continue;}if(ch==='['||ch==='{'){out+=fn(buf);buf='';out+=ch;depth=ch==='['?']':'}';continue;}buf+=ch;}return out+fn(buf);}
function outsideStrings(formula,fn){let out='',i=0;while(i<formula.length){const q=formula.indexOf('"',i);if(q<0){out+=fn(formula.slice(i));break;}out+=fn(formula.slice(i,q));let j=q+1;while(j<formula.length){if(formula[j]==='"'){if(formula[j+1]==='"'){j+=2;continue;}j++;break;}j++;}out+=formula.slice(q,j);i=j;}return out;}
class Untranslatable extends Error{}
const fail=reason=>{throw new Untranslatable(reason);};
const quoteSheet=t=>"'"+t.replace(/'/g,"''")+"'";

// ctx: {sheet, rowIndex, colIndex, colLetter: Map(lowerName→letter), idLetter: Map(colId→letter), rowExcel: Map(rowId→excelRow),
//       children: Map(rowId→[rowIds]), sheets: Map(lowerSheetName→{title,colLetter})}
export function toExcelFormula(formula,ctx){
 try{
  if(typeof formula!=='string'||!formula.startsWith('='))fail('not a formula');
  const here=ctx.rowIndex+2,me=ctx.sheet.rows[ctx.rowIndex]?.id;
  const col=name=>{const l=ctx.colLetter.get(String(name).toLowerCase());if(!l)fail('unknown column '+name);return l;};
  // 1. A1 references: shift rows past the Excel header row (letters already match the exported column order).
  //    Bracketed column names and {cross-sheet} bodies are masked so text like [Lot A1] is never touched.
  const shiftA1=part=>maskBrackets(part,seg=>seg
   .replace(/((?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)(\$?[A-Za-z]{1,3}\$?)(\d+)/g,(m,sheetPart,c,n)=>{const name=sheetPart.slice(0,-1).replace(/^'|'$/g,'').replace(/''/g,"'");const target=ctx.sheets.get(name.toLowerCase());if(!target)fail('sheet not exported: '+name);return quoteSheet(target.title)+'!'+c.toUpperCase()+'\u0000'+(Number(n)+1);})
   .replace(/(^|[^A-Za-z0-9_.'!$\u0000])(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![\d(A-Za-z_.])/g,(m,pre,d1,l,d2,n)=>/^(LOG|ATAN|DEC)$/i.test(l)?m:pre+d1+l.toUpperCase()+d2+(Number(n)+1))
   .replace(/\u0000/g,''));
  let f=outsideStrings(formula,shiftA1);
  // 2. Stable CELLREF("row","column") references.
  f=f.replace(/CELLREF\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g,(m,row,c)=>{const l=ctx.idLetter.get(c);if(!l)fail('unknown CELLREF column');if(row==='@row')return l+here;const r=ctx.rowExcel.get(row);if(!r)fail('unknown CELLREF row');return l+r;});
  f=outsideStrings(f,seg=>{
   // 3. Cross-sheet column references.
   seg=seg.replace(/\{([^}]*)\}/g,(m,body)=>{const [sn,cn]=body.split('::');if(cn===undefined)fail('named cross-sheet range');const t=ctx.sheets.get(sn.trim().toLowerCase());if(!t)fail('sheet not exported: '+sn);const l=t.colLetter.get(cn.trim().toLowerCase());if(!l)fail('unknown column in '+sn);return quoteSheet(t.title)+'!'+l+':'+l;});
   // 4. CHILDREN() / CHILDREN([Col]@row) → explicit child cells of this row.
   seg=seg.replace(/CHILDREN\(\s*(?:\[([^\]]+)\](?:@row)?)?\s*\)/gi,(m,c)=>{const l=c?col(c):letter(ctx.colIndex);const kids=ctx.children.get(me)||[];if(!kids.length)fail('row has no children');if(kids.length>250)fail('too many children');return kids.map(id=>l+ctx.rowExcel.get(id)).join(',');});
   // 5. Ranges [A]1:[B]5 and whole columns [A]:[A].
   seg=seg.replace(/(\$?)\[([^\]]+)\](\$?)(\d+)?\s*:\s*(\$?)\[([^\]]+)\](\$?)(\d+)?/g,(m,a1,ca,a2,ra,b1,cb,b2,rb)=>{if((ra===undefined)!==(rb===undefined))fail('mixed range');if(ra===undefined)return col(ca)+':'+col(cb);return a1+col(ca)+a2+(Number(ra)+1)+':'+b1+col(cb)+b2+(Number(rb)+1);});
   // 6. Single references [Col]@row, [Col]12, $[Col]$12.
   seg=seg.replace(/(\$?)\[([^\]]+)\](\$?)(@row|\d+)?/gi,(m,d1,c,d2,r)=>{if(r===undefined)fail('reference without a row');return d1+col(c)+(r.toLowerCase()==='@row'?here:d2+(Number(r)+1));});
   if(/@(row|cell)\b/i.test(seg))fail('@cell criteria');
   seg=seg.replace(/!=/g,'<>');
   // 7. Functions must exist in Excel.
   seg=seg.replace(/([A-Za-z_][A-Za-z0-9_.]*)\s*\(/g,(m,name)=>{let n=name.toUpperCase();n=RENAMES[n]||n;if(n.startsWith('_XLFN.'))return m;if(!EXCEL_FUNCTIONS.has(n))fail('function '+n+' has no Excel equivalent');return (FUTURE.has(n)?'_xlfn.':'')+n+'(';});
   return seg;
  });
  return {ok:true,formula:f};
 }catch(e){if(e instanceof Untranslatable)return {ok:false,reason:e.message};throw e;}
}

const safeTitle=(name,used)=>{let t=String(name).replace(/[\[\]:*?\/\\]/g,' ').trim().slice(0,31)||'Sheet';let base=t,n=2;while(used.has(t.toLowerCase()))t=(base.slice(0,28)+' '+n++).slice(0,31);used.add(t.toLowerCase());return t;};
const MAX_NOTE=1500;

function numberFormat(c,values){
 const kind=c.numericFormat||(['currency','percent','number','rating','duration'].includes(c.type)?c.type:null);
 if(kind==='currency')return (c.currency&&c.currency!=='USD')?'#,##0.00 "'+c.currency+'"':'"$"#,##0.00';
 if(kind==='percent')return '0.00%';
 if(kind==='number'||kind==='duration'||kind==='rating')return values.every(v=>typeof v!=='number'||Number.isInteger(v))?'#,##0':'#,##0.00##';
 if(c.type==='date')return 'mm/dd/yyyy';
 return null;
}

// Returns {sheets:[...], stats:{formulas, translated, values}} for the requested sheet ids.
export function buildWorkbookSpec(state,sheetIds){
 const calc=createCalculator(state),used=new Set(),chosen=sheetIds.map(id=>state.sheets.find(s=>s.id===id)).filter(Boolean);
 const meta=new Map(chosen.map(s=>{const colLetter=new Map(),idLetter=new Map();s.columns.forEach((c,i)=>{colLetter.set(c.name.toLowerCase(),letter(i));idLetter.set(c.id,letter(i));});return [s.id,{title:safeTitle(s.name,used),colLetter,idLetter}];}));
 const sheetsByName=new Map(chosen.map(s=>[s.name.toLowerCase(),meta.get(s.id)]));
 const stats={formulas:0,translated:0,values:0,untranslated:[]};
 const out=chosen.map(s=>{
  const m=meta.get(s.id),rowExcel=new Map(s.rows.map((r,i)=>[r.id,i+2])),children=new Map(),byId=new Map(s.rows.map(r=>[r.id,r]));
  for(const r of s.rows)if(r.parentId){if(!children.has(r.parentId))children.set(r.parentId,[]);children.get(r.parentId).push(r.id);}
  const depth=r=>{let d=0,p=r.parentId;while(p&&d<7){d++;p=byId.get(p)?.parentId;}return d;};
  const values=s.columns.map(c=>s.rows.map(r=>calc.get(s,r,c)));
  const columns=s.columns.map((c,i)=>({header:c.name,width:Math.max(6,Math.min(80,Math.round((c.width||150)/7))),hidden:!!c.hidden,numFmt:numberFormat(c,values[i])}));
  const rows=s.rows.map((r,ri)=>({level:depth(r),cells:s.columns.map((c,ci)=>{
   const v=values[ci][ri],raw=r.cells[c.id],cell={};
   let formula=typeof raw==='string'&&raw.startsWith('=')?raw:(c.formula&&!r.formulaOverrides?.[c.id]&&!systemTypes.includes(c.type)?shiftFormula(c.formula,ri-((c.formulaOriginRow||1)-1),0):null);
   if(formula){stats.formulas++;const t=toExcelFormula(formula,{sheet:s,rowIndex:ri,colIndex:ci,colLetter:m.colLetter,idLetter:m.idLetter,rowExcel,children,sheets:sheetsByName});
    if(t.ok){cell.f=t.formula;stats.translated++;}else{stats.values++;if(stats.untranslated.length<20)stats.untranslated.push({sheet:s.name,row:ri+1,column:c.name,reason:t.reason});cell.note=('Formula exported as its value ('+t.reason+'):\n'+formula).slice(0,MAX_NOTE);}}
   if(!cell.f){
    if(v===''||v==null){}
    else if(typeof v==='number'&&Number.isFinite(v)){cell.v=v;cell.t='n';}
    else if(typeof v==='boolean'){cell.v=v;cell.t='b';}
    else if(c.type==='date'&&typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)){cell.v=v;cell.t='d';}
    else{cell.v=typeof v==='object'?String(displayCell(v,c)):String(v);cell.t='s';}
   }
   const f=cellFormat(s,r,c,calc.get)||{},fmt={};
   if(f.bold)fmt.b=1;if(f.italic)fmt.i=1;if(f.underline)fmt.u=1;if(f.strike||f.strikethrough)fmt.s=1;if(f.wrap)fmt.wrap=1;
   if(/^#[0-9a-f]{6}$/i.test(f.fill||''))fmt.fill=f.fill.slice(1).toUpperCase();if(/^#[0-9a-f]{6}$/i.test(f.color||''))fmt.color=f.color.slice(1).toUpperCase();
   if(['left','center','right'].includes(f.align))fmt.align=f.align;if(Number(f.size)>0)fmt.size=Number(f.size);
   if(Object.keys(fmt).length)cell.fmt=fmt;
   const link=r.cellLinks?.[c.id];if(/^https?:\/\//i.test(link||''))cell.link=link;
   if(ci===0&&r.comments?.length){const thread=r.comments.map(x=>`${x.by} (${String(x.at).slice(0,10)}): ${x.text}`).join('\n');cell.note=((cell.note?cell.note+'\n\n':'')+'Comments:\n'+thread).slice(0,MAX_NOTE);}
   return cell;})}));
  const frozen=Math.max(0,Math.min(Number(s.frozenColumns)||0,s.columns.length));
  return {title:m.title,columns,rows,freeze:{row:2,col:frozen+1}};
 });
 return {sheets:out,stats};
}
