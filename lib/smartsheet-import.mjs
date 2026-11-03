// Converts Smartsheet API sheets (GET /2.0/sheets/{id}) into workspace sheets, keeping formulas.
// After conversion every formula is recalculated here and compared with the value Smartsheet
// displayed; mismatches are reported, never "corrected".
import {validateCell,parseCell} from './columns.mjs';
import {createCalculator,supportedFunctions} from './formulas.mjs';

export const API_BASES={us:'https://api.smartsheet.com/2.0',eu:'https://api.smartsheet.eu/2.0',au:'https://api.smartsheet.au/2.0'};

export async function smartsheetGet(token,pathname,{base=API_BASES.us,fetchImpl=fetch}={}){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{20,}$/.test(token.trim())){const e=Error('Paste a Smartsheet API access token (Account → Apps & Integrations → API Access).');e.status=400;throw e;}
 const r=await fetchImpl(base+pathname,{headers:{Authorization:'Bearer '+token.trim(),Accept:'application/json'}});
 const body=await r.json().catch(()=>({}));
 if(!r.ok){const e=Error(r.status===401||r.status===403?'Smartsheet rejected the token (check that it is current and has access).':'Smartsheet request failed: '+(body.message||r.status));e.status=r.status===401||r.status===403?401:502;throw e;}
 return body;
}

const FORMAT_FIELDS=['fontFamily','fontSize','bold','italic','underline','strikethrough','horizontalAlign','verticalAlign','color','backgroundColor','taskbarColor','currency','decimalCount','thousandsSeparator','numberFormat','textWrap','dateFormat'];
const NUMBER_FORMATS=['','number','currency','percent'];
const ALIGN=['','left','center','right'];
// Smartsheet format descriptors index into server format tables; colors need the palette from /serverinfo.
export function parseFormat(descriptor,palette=[]){
 if(typeof descriptor!=='string'||!descriptor)return {};
 const parts=descriptor.split(','),get=k=>parts[FORMAT_FIELDS.indexOf(k)],out={};
 if(get('bold')==='1')out.bold=true;if(get('italic')==='1')out.italic=true;if(get('underline')==='1')out.underline=true;if(get('strikethrough')==='1')out.strike=true;if(get('textWrap')==='1')out.wrap=true;
 const a=ALIGN[Number(get('horizontalAlign'))];if(a)out.align=a;
 const color=palette[Number(get('color'))],fill=palette[Number(get('backgroundColor'))];
 if(get('color')&&/^#[0-9a-f]{6}$/i.test(color||''))out.color=color;if(get('backgroundColor')&&/^#[0-9a-f]{6}$/i.test(fill||''))out.fill=fill;
 const nf=NUMBER_FORMATS[Number(get('numberFormat'))];if(nf)out.numberFormat=nf;
 return out;
}

const SYSTEM_AS_TEXT=new Set(['AUTO_NUMBER','CREATED_DATE','MODIFIED_DATE','CREATED_BY','MODIFIED_BY']);
function columnType(c){
 if(c.systemColumnType&&SYSTEM_AS_TEXT.has(c.systemColumnType))return 'text';
 switch(c.type){case 'DATE':return 'date';case 'DATETIME':case 'ABSTRACT_DATETIME':return 'datetime';case 'CHECKBOX':return 'checkbox';case 'PICKLIST':return c.symbol?'symbol':'select';case 'MULTI_PICKLIST':return 'multiselect';case 'CONTACT_LIST':return 'contact';case 'MULTI_CONTACT_LIST':return 'people';case 'DURATION':return 'duration';default:return 'text';}
}
function cellValue(cell,col){
 if(cell.formula)return cell.formula;
 const ov=cell.objectValue;
 if(col.type==='multiselect')return ov?.values||(cell.value!=null?String(cell.value).split(/\s*,\s*/).filter(Boolean):'');
 if(col.type==='people')return (ov?.values||[]).map(v=>v.email||v.name).filter(Boolean).join(', ')||cell.displayValue||'';
 if(col.type==='contact')return ov?.email||cell.value||cell.displayValue||'';
 if(col.type==='checkbox')return cell.value===true;
 if(col.type==='datetime')return cell.value?String(cell.value).slice(0,16):'';
 if(col.type==='text')return cell.value??cell.displayValue??'';
 return cell.value??cell.displayValue??'';
}

// Rewrites Smartsheet named cross-sheet ranges {Range Name} into {Sheet::Column} when they cover one whole column.
function rewriteCrossRefs(formula,refs,sheetNames,report){
 if(!refs?.length||typeof formula!=='string')return formula;
 return formula.replace(/\{([^}:]+)\}/g,(m,name)=>{const ref=refs.find(r=>r.name===name.trim());if(!ref){report.crossSheetUnresolved++;return m;}
  const whole=!ref.startRowId&&!ref.endRowId&&ref.startColumnId&&ref.startColumnId===ref.endColumnId,target=sheetNames.get(String(ref.sourceSheetId));
  if(!whole||!target||!target.columns.has(String(ref.startColumnId))){report.crossSheetUnresolved++;return m;}
  return '{'+target.name+'::'+target.columns.get(String(ref.startColumnId))+'}';});
}

// apiSheets: full sheet objects. Returns {sheets, report}. `known` maps Smartsheet sheet id → {name, columns: Map(colId→title)} for cross-sheet rewriting.
export function convertSheets(apiSheets,{workspaceId,makeId,palette=[],existingNames=new Set(),now=new Date().toISOString()}){
 const used=new Set([...existingNames].map(n=>n.toLowerCase())),report={sheets:[],crossSheetUnresolved:0},pending=[];
 const named=apiSheets.map(a=>{let name=String(a.name||'Smartsheet sheet').trim(),n=2;const base=name;while(used.has(name.toLowerCase()))name=base+' (Smartsheet'+(n>2?' '+(n-1):'')+')',n++;used.add(name.toLowerCase());return name;});
 const sheetNames=new Map(apiSheets.map((a,i)=>[String(a.id),{name:named[i],columns:new Map((a.columns||[]).map(c=>[String(c.id),c.title]))}]));
 const sheets=apiSheets.map((a,si)=>{
  const sr={name:named[si],smartsheetId:a.id,rows:0,columns:0,formulas:0,formulaMatches:0,formulaMismatches:[],typeFallbacks:[],comments:0,attachmentsNotCopied:0,attachmentsCopied:0,attachmentsSkipped:[]};
  const colMap=new Map(),columns=[...(a.columns||[])].sort((x,y)=>(x.primary?-1:0)-(y.primary?-1:0)||x.index-y.index).map(c=>{const fmt=parseFormat(c.format,palette);const col={id:makeId(),name:String(c.title||'Column').slice(0,80),type:columnType(c),options:Array.isArray(c.options)?c.options.map(String):[],formula:c.formula?rewriteCrossRefs(c.formula,a.crossSheetReferences,sheetNames,report):'',width:Math.max(80,Math.min(600,Number(c.width)||150)),hidden:!!c.hidden,source:{smartsheetColumnId:c.id,type:c.type,systemColumnType:c.systemColumnType||null}};if(fmt.numberFormat&&col.type==='text')col.numericFormat=fmt.numberFormat;const {numberFormat,...style}=fmt;if(Object.keys(style).length)col.format=style;colMap.set(String(c.id),col);return col;});
  // unique, non-empty names
  const seen=new Set();for(const c of columns){let n=c.name.trim()||'Column',k=2;const base=n;while(seen.has(n.toLowerCase()))n=base+' '+k++;seen.add(n.toLowerCase());c.name=n;}
  if(columns[0])columns[0].type='text';
  const rowIds=new Map((a.rows||[]).map(r=>[String(r.id),makeId()]));
  const discussions=new Map();for(const d of a.discussions||[])if(d.parentType==='ROW'){const list=discussions.get(String(d.parentId))||[];for(const c of d.comments||[])list.push({id:makeId(),text:String(c.text||''),by:c.createdBy?.name||c.createdBy?.email||'Smartsheet user',at:c.createdAt||now});discussions.set(String(d.parentId),list);}
  const rows=(a.rows||[]).map(r=>{const row={id:rowIds.get(String(r.id)),parentId:r.parentId?rowIds.get(String(r.parentId))||null:null,cells:{},comments:discussions.get(String(r.id))||[],attachments:[],createdAt:r.createdAt||now,updatedAt:r.modifiedAt||now,source:{smartsheetRowId:r.id,rowNumber:r.rowNumber}};
   if(r.locked)row.locked=true;const rf=parseFormat(r.format,palette);delete rf.numberFormat;if(Object.keys(rf).length)row.format=rf;
   sr.comments+=row.comments.length;for(const att of r.attachments||[])queueAttachment(pending,sr,{sheetIndex:si,smartsheetSheetId:a.id,rowId:row.id,rowNumber:r.rowNumber??null,att});
   for(const cell of r.cells||[]){const col=colMap.get(String(cell.columnId));if(!col)continue;
    let v=cellValue(cell,col);if(typeof v==='string'&&v.startsWith('='))v=rewriteCrossRefs(v,a.crossSheetReferences,sheetNames,report);
    if(typeof v==='string'&&v.startsWith('=')&&col.formula)(row.formulaOverrides||={})[col.id]=true;
    if(col.type==='text'&&(typeof v==='number'||typeof v==='boolean')){}
    else if(!(typeof v==='string'&&v.startsWith('='))){try{const p=parseCell(col,v);validateCell(col,p);v=p;}catch{if(!sr.typeFallbacks.includes(col.name))sr.typeFallbacks.push(col.name);col.type='text';v=cell.displayValue??String(cell.value??'');}}
    if(v!==''&&v!==false&&v!=null)row.cells[col.id]=v;
    if(cell.hyperlink?.url&&/^https?:\/\//i.test(cell.hyperlink.url))(row.cellLinks||={})[col.id]=cell.hyperlink.url;
    const cf=parseFormat(cell.format,palette);delete cf.numberFormat;if(Object.keys(cf).length)(row.cellFormats||={})[col.id]=cf;
    if(cell.formula||col.formula)(row.smartsheetValues||={})[col.id]=cell.value??null;}
   return row;});
  // columns converted to text after some rows: re-stringify any non-string values for consistency
  for(const c of columns)if(c.type==='text')for(const r of rows){const v=r.cells[c.id];if(v!=null&&typeof v==='object')r.cells[c.id]=Array.isArray(v)?v.join(', '):JSON.stringify(v);}
  sr.rows=rows.length;sr.columns=columns.length;report.sheets.push(sr);
  return {id:makeId(),workspaceId,folderId:null,name:named[si],description:'Imported from Smartsheet',columns,rows,forms:[],automations:[],source:{system:'smartsheet',smartsheetId:a.id,importedAt:now,permalink:a.permalink||null}};
 });
 return {sheets,report,pendingAttachments:pending};
}

// ---- Attachments ----
// Files up to the app's 2 MB per-file limit are downloaded and stored on the row like a local upload.
// Links (Google Drive, Box, URLs…) and larger files are listed in the report, never silently dropped.
export const MAX_ATTACHMENT_BYTES=2*1024*1024;
function queueAttachment(pending,sr,{sheetIndex,smartsheetSheetId,rowId,rowNumber,att}){
 const name=String(att.name||'attachment').slice(0,200),skip=reason=>{sr.attachmentsNotCopied++;if(sr.attachmentsSkipped.length<50)sr.attachmentsSkipped.push({row:rowNumber,name,reason});};
 if(att.attachmentType&&att.attachmentType!=='FILE')return skip('link ('+String(att.attachmentType).toLowerCase().replace(/_/g,' ')+(att.url?': '+att.url:'')+')');
 if(Number(att.sizeInKb)*1024>MAX_ATTACHMENT_BYTES)return skip('larger than 2 MB');
 pending.push({sheetIndex,smartsheetSheetId,rowId,rowNumber,attachmentId:att.id,name,mimeType:att.mimeType||'application/octet-stream'});
}
// Downloads queued files (a few at a time) and adds them to the converted rows. `budgetBytes` caps the
// total so the workspace stays under its size limit; files past the cap are reported, not copied.
export async function fetchAttachments(token,sheets,report,pending,{base=API_BASES.us,fetchImpl=fetch,budgetBytes=Infinity,makeId,allowHttp=false}={}){
 let used=0,i=0;const rowsById=sheets.map(s=>new Map(s.rows.map(r=>[r.id,r])));
 const skip=(p,reason)=>{const sr=report.sheets[p.sheetIndex];sr.attachmentsNotCopied++;if(sr.attachmentsSkipped.length<50)sr.attachmentsSkipped.push({row:p.rowNumber,name:p.name,reason});};
 const worker=async()=>{while(i<pending.length){const p=pending[i++];try{
   const meta=await smartsheetGet(token,'/sheets/'+p.smartsheetSheetId+'/attachments/'+p.attachmentId,{base,fetchImpl});
   if(typeof meta.url!=='string'||!(/^https:\/\//i.test(meta.url)||(allowHttp&&/^http:\/\//i.test(meta.url))))throw Error('no download link');
   const res=await fetchImpl(meta.url,{signal:AbortSignal.timeout(60000)});if(!res.ok)throw Error('download failed ('+res.status+')');
   const buf=Buffer.from(await res.arrayBuffer());if(buf.length>MAX_ATTACHMENT_BYTES){skip(p,'larger than 2 MB');continue;}
   const dataUrl='data:'+String(meta.mimeType||p.mimeType).replace(/[^\w.+\/-]/g,'')+';base64,'+buf.toString('base64');
   if(used+dataUrl.length>budgetBytes){skip(p,'workspace size limit reached');continue;}
   used+=dataUrl.length;rowsById[p.sheetIndex].get(p.rowId)?.attachments.push({id:makeId(),name:p.name,type:meta.mimeType||p.mimeType,data:dataUrl,source:{smartsheetAttachmentId:p.attachmentId}});
   report.sheets[p.sheetIndex].attachmentsCopied++;
  }catch(e){skip(p,e.message==='no download link'?'no download link':'could not download ('+String(e.message).slice(0,80)+')');}}};
 await Promise.all(Array.from({length:Math.min(4,pending.length)},worker));
 return {copied:pending.length?report.sheets.reduce((n,s)=>n+s.attachmentsCopied,0):0,bytes:used};
}

// Recalculates every formula and compares it with Smartsheet's own value (stored as row.smartsheetValues).
export function verifyFormulas(state,sheets,report){
 const calc=createCalculator(state);
 const known=new Set(supportedFunctions),missing=new Map();
 for(const s of sheets){const scan=f=>{if(typeof f!=='string'||!f.startsWith('='))return;for(const [,name] of f.replace(/"(?:[^"]|"")*"/g,'""').replace(/\{[^}]*\}|\[[^\]]*\]/g,'x').matchAll(/([A-Za-z][A-Za-z0-9.]*)\s*\(/g)){const u=name.toUpperCase();if(!known.has(u))missing.set(u,(missing.get(u)||0)+1);}};for(const c of s.columns)scan(c.formula);for(const r of s.rows)for(const v of Object.values(r.cells))scan(v);}
 report.unsupportedFunctions=[...missing].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
 sheets.forEach((s,i)=>{const sr=report.sheets[i];for(const r of s.rows)for(const [colId,expected] of Object.entries(r.smartsheetValues||{})){const c=s.columns.find(x=>x.id===colId);sr.formulas++;const got=calc.get(s,r,c);
  const same=got===expected||(expected==null&&(got===''||got==null))||(typeof got==='number'&&typeof expected==='number'&&Math.abs(got-expected)<=Math.max(1e-9,Math.abs(expected)*1e-12))||String(got)===String(expected);
  if(same)sr.formulaMatches++;else if(sr.formulaMismatches.length<25)sr.formulaMismatches.push({row:s.rows.indexOf(r)+1,column:c.name,smartsheet:expected,here:got});else sr.formulaMismatchOverflow=(sr.formulaMismatchOverflow||0)+1;}});
 return report;
}
