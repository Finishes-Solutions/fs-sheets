// Shared typed-cell contract. Display values remain useful to formulas and reports.
export const columnTypes = [
 ['text','Text / number'],['longText','Long text'],['number','Number'],['currency','Currency'],['percent','Percent'],['date','Date'],['checkbox','Checkbox'],['select','Dropdown / status'],['multiselect','Multi-select dropdown'],['contact','Contact'],['people','People / multiple contacts'],['symbol','Symbols'],['itemId','Item ID'],['autoNumber','Auto-number'],['timeline','Timeline'],['connected','Connected sheet'],['link','Link'],['location','Location'],['email','Email'],['phone','Phone'],['rating','Rating'],['tags','Tags'],['duration','Duration (days)'],['createdAt','Created date'],['createdBy','Created by'],['updatedAt','Modified date'],['updatedBy','Modified by'],['formula','Formula'],['files','Files / row attachments'],['latestComment','Latest comment']
];
export const systemTypes = ['itemId','autoNumber','createdAt','createdBy','updatedAt','updatedBy','files','latestComment'];
export const richTypes = ['longText','multiselect','people','tags','timeline','connected','link','location'];
export const numericTypes = ['number','currency','percent','rating','duration'];
export const isReadOnly = c => !!c.formula || systemTypes.includes(c.type) || c.type==='formula';
const blank = v => v==null||v==='';
export function parseCell(c,v){
 if(blank(v))return c.type==='checkbox'?false:'';
 if(typeof v==='string'&&v.startsWith('=')&&!systemTypes.includes(c.type))return v;
 if(numericTypes.includes(c.type)){const n=Number(v);if(!Number.isFinite(n))throw Error(`${c.name}: enter a number`);if(c.type==='rating'&&(n<0||n>5))throw Error('Rating must be between 0 and 5');return n;}
 if(c.type==='checkbox')return v===true||/^(true|yes|1|on)$/i.test(String(v));
 if(['people','tags','multiselect'].includes(c.type))return [...new Set((Array.isArray(v)?v:String(v).split(',')).map(x=>String(x).trim()).filter(Boolean))];
 if(c.type==='timeline'){if(typeof v==='object')return v;const [start,end]=String(v).split(/\s*\.\.\s*/);return {start:start||'',end:end||''};}
 if(c.type==='link')return typeof v==='object'?v:{url:String(v),label:''};
 if(c.type==='location')return typeof v==='object'?v:{address:String(v),lat:'',lng:''};
 if(c.type==='connected'){if(!Array.isArray(v))throw Error('Choose connected rows using the cell picker');return v;}
 return String(v);
}
export function validateCell(c,v){
 if(blank(v))return;
 if(typeof v==='string'&&v.startsWith('='))return;
 const strings=a=>Array.isArray(a)&&a.length<=100&&a.every(x=>typeof x==='string'&&x.length<=1000);
 const day=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
 let ok=true;
 if(numericTypes.includes(c.type))ok=typeof v==='number'&&Number.isFinite(v)&&(c.type!=='rating'||(v>=0&&v<=5));
 else if(c.type==='checkbox')ok=typeof v==='boolean';
 else if(c.type==='date')ok=day(v);
 else if(['people','tags','multiselect'].includes(c.type))ok=strings(v);
 else if(c.type==='timeline')ok=v&&typeof v==='object'&&!Array.isArray(v)&&day(v.start)&&day(v.end)&&v.end>=v.start;
 else if(c.type==='link')ok=v&&typeof v.url==='string'&&/^https?:\/\//i.test(v.url)&&typeof v.label==='string';
 else if(c.type==='location')ok=v&&typeof v.address==='string'&&['lat','lng'].every(k=>v[k]===''||(typeof v[k]==='number'&&Number.isFinite(v[k])&&Math.abs(v[k])<=(k==='lat'?90:180)));
 else if(c.type==='connected')ok=Array.isArray(v)&&v.length<=100&&v.every(x=>x&&typeof x.sheetId==='string'&&typeof x.rowId==='string');
 else ok=['string','number','boolean'].includes(typeof v);
 if(!ok)throw Error(`Invalid ${c.name} value (${c.type})`);
}
export function cellValue(state,s,r,c){
 const v=r.cells[c.id]??'';
 if(typeof v==='string'&&v.startsWith('=')&&!systemTypes.includes(c.type))return v;
 switch(c.type){
 case 'itemId':return r.id;
 case 'autoNumber':return r.itemNumber==null?'':`${c.prefix||''}${String(r.itemNumber).padStart(c.digits||1,'0')}`;
 case 'createdAt':case 'updatedAt':return r[c.type]||'';
 case 'createdBy':case 'updatedBy':return r[c.type]||'Local';
 case 'latestComment':return r.comments?.at(-1)?.text||'';
 case 'files':return (r.attachments||[]).map(a=>a.name).join(', ');
 case 'connected':return Array.isArray(v)?v.map(ref=>{const sh=state.sheets.find(x=>x.id===ref.sheetId),row=sh?.rows.find(x=>x.id===ref.rowId);return row?String(row.cells[sh.columns[0].id]||'Untitled'):'[Deleted row]';}).join(', '):'';
 case 'timeline':return v&&typeof v==='object'?`${v.start} → ${v.end}`:v;
 case 'link':return v&&typeof v==='object'?v.label||v.url:v;
 case 'location':return v&&typeof v==='object'?v.address:v;
 default:return Array.isArray(v)?v.join(', '):v;
 }
}
export function displayCell(v,c){
 if(v===''||v==null)return '';
 if(c.type==='currency'&&Number.isFinite(Number(v)))return new Intl.NumberFormat(undefined,{style:'currency',currency:c.currency||'USD'}).format(Number(v));
 if(c.type==='percent'&&Number.isFinite(Number(v)))return new Intl.NumberFormat(undefined,{style:'percent',maximumFractionDigits:2}).format(Number(v));
 if(c.type==='rating'&&Number.isFinite(Number(v)))return '★'.repeat(Math.round(Number(v)))+'☆'.repeat(5-Math.round(Number(v)));
 return String(v);
}
