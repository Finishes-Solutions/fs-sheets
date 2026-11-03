// Shared typed-cell contract. Display values remain useful to formulas and reports.
export const columnTypes = [
 ['text','Text / number'],['longText','Long text'],['number','Number'],['currency','Currency'],['percent','Percent'],['date','Date'],['datetime','Date and time'],['checkbox','Checkbox'],['select','Dropdown / status'],['multiselect','Multi-select dropdown'],['contact','Contact'],['people','People / multiple contacts'],['symbol','Symbols'],['itemId','Item ID'],['autoNumber','Auto-number'],['timeline','Timeline'],['connected','Connected sheet'],['link','Link'],['location','Location'],['email','Email'],['phone','Phone'],['rating','Rating'],['tags','Tags'],['duration','Duration (days)'],['createdAt','Created date'],['createdBy','Created by'],['updatedAt','Modified date'],['updatedBy','Modified by'],['formula','Formula'],['files','Files / row attachments'],['latestComment','Latest comment'],['mirror','Mirror'],['dependency','Dependencies'],['timeTracking','Time tracking'],['worldClock','World clock'],['country','Country'],['color','Color picker'],['vote','Vote'],['button','Button'],['week','Week'],['progress','Progress tracking']
];
export const systemTypes = ['itemId','autoNumber','createdAt','createdBy','updatedAt','updatedBy','files','latestComment','mirror','progress'];
export const richTypes = ['longText','multiselect','people','tags','timeline','connected','link','location','dependency','timeTracking','worldClock','country','color','vote','button','week'];
export const numericTypes = ['number','currency','percent','rating','duration'];
export const isReadOnly = c => !!c.formula || systemTypes.includes(c.type) || c.type==='formula';
const blank = v => v==null||v==='';
export function parseCell(c,v){
 if(blank(v))return c.type==='checkbox'?false:'';
 if(typeof v==='string'&&v.startsWith('=')&&!systemTypes.includes(c.type))return v;
 if(c.numericFormat&&typeof v==='string'){let text=v.trim(),negative=/^\(.*\)$/.test(text);if(negative)text=text.slice(1,-1);const percent=text.endsWith('%');text=text.replace(/^[$£€]\s*/,'').replace(/%$/,'');if(/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+|\d*\.\d+)(?:\.\d+)?$/.test(text)){const n=Number(text.replaceAll(',',''))*(negative?-1:1);return percent?n/100:n;}}
 if(c.type==='duration'&&typeof v==='string'&&!Number.isFinite(Number(v))){let total=0,rest=v.trim().toLowerCase();const pieces=[...rest.matchAll(/([+-]?\d+(?:\.\d+)?)\s*(w|d|h|m)\b/g)];if(!pieces.length||rest.replace(/([+-]?\d+(?:\.\d+)?)\s*(w|d|h|m)\b/g,'').trim())throw Error('Use a number of days or units such as 2d 4h');for(const [,n,unit] of pieces)total+=Number(n)*({w:c.workDaysPerWeek||5,d:1,h:1/(c.hoursPerDay||8),m:1/((c.hoursPerDay||8)*60)})[unit];if(total<0)throw Error('Duration must be nonnegative');return total;}
 if(numericTypes.includes(c.type)){const n=Number(v);if(!Number.isFinite(n))throw Error(`${c.name}: enter a number`);if(c.type==='rating'&&(n<0||n>5))throw Error('Rating must be between 0 and 5');return n;}
 if(c.type==='checkbox')return v===true||/^(true|yes|1|on)$/i.test(String(v));
 if(['people','tags','multiselect'].includes(c.type))return [...new Set((Array.isArray(v)?v:String(v).split(',')).map(x=>String(x).trim()).filter(Boolean))];
 if(c.type==='vote')return Array.isArray(v)?v:String(v).split(',').map(x=>x.trim()).filter(Boolean);
 if(c.type==='button')return typeof v==='object'?v:{url:String(v),label:'Open'};
 if(c.type==='dependency'){if(!Array.isArray(v))throw Error('Choose predecessor rows with the dependency editor');return v;}
 if(c.type==='timeTracking'){if(typeof v!=='object')throw Error('Use the time tracking controls');return v;}
 if(c.type==='week'){if(typeof v==='object')return v;const m=String(v).match(/^(\d{4})-W(\d{2})$/);if(!m||Number(m[2])<1||Number(m[2])>53)throw Error('Choose an ISO week');const jan=new Date(Date.UTC(Number(m[1]),0,4)),start=new Date(+jan-((jan.getUTCDay()+6)%7)*864e5+(Number(m[2])-1)*7*864e5);if(new Date(+start+3*864e5).getUTCFullYear()!==Number(m[1]))throw Error('Choose a valid ISO week for that year');return {start:start.toISOString().slice(0,10),end:new Date(+start+6*864e5).toISOString().slice(0,10)};}
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
 else if(c.type==='datetime')ok=typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(v)&&day(v.slice(0,10))&&!Number.isNaN(Date.parse(v));
 else if(['people','tags','multiselect'].includes(c.type))ok=strings(v);
 else if(c.type==='vote')ok=strings(v)&&new Set(v).size===v.length;
 else if(c.type==='dependency')ok=Array.isArray(v)&&v.length<=100&&v.every(x=>x&&typeof x.rowId==='string'&&['FS','SS','FF','SF'].includes(x.type)&&Number.isFinite(x.lag)&&Math.abs(x.lag)<=10000);
 else if(c.type==='timeTracking')ok=v&&typeof v==='object'&&Number.isFinite(v.totalSeconds)&&v.totalSeconds>=0&&(!v.runningSince||!Number.isNaN(Date.parse(v.runningSince)))&&Array.isArray(v.sessions)&&v.sessions.length<=1000&&v.sessions.every(x=>x&&typeof x.start==='string'&&typeof x.end==='string'&&!Number.isNaN(Date.parse(x.start))&&!Number.isNaN(Date.parse(x.end))&&Number.isFinite(x.seconds)&&x.seconds>=0);
 else if(c.type==='worldClock'){try{new Intl.DateTimeFormat('en-US',{timeZone:v});ok=typeof v==='string';}catch{ok=false;}}
 else if(c.type==='color')ok=typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
 else if(c.type==='country')ok=typeof v==='string'&&v.length<=120;
 else if(c.type==='week')ok=v&&day(v.start)&&day(v.end)&&(Date.parse(v.end)-Date.parse(v.start))===6*864e5&&new Date(v.start).getUTCDay()===1;
 else if(c.type==='button')ok=v&&typeof v.url==='string'&&/^https?:\/\//i.test(v.url)&&typeof v.label==='string';
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
 case 'timeTracking':return v&&typeof v==='object'?v.totalSeconds+(v.runningSince?Math.max(0,(Date.now()-Date.parse(v.runningSince))/1000):0):0;
 case 'vote':return Array.isArray(v)?v.length:0;
 case 'button':return v?.label||v?.url||'';
 case 'dependency':return Array.isArray(v)?v.map(ref=>{const i=s.rows.findIndex(row=>row.id===ref.rowId);return i<0?'[Deleted row]':`${i+1}${ref.type}${ref.lag?` ${ref.lag>0?'+':''}${ref.lag}d`:''}`;}).join(', '):'';
 case 'week':return v&&typeof v==='object'?`Week of ${v.start}`:'';
 case 'worldClock':return v?`${new Intl.DateTimeFormat(undefined,{timeZone:v,hour:'2-digit',minute:'2-digit'}).format(new Date())} · ${v}`:'';
 case 'timeline':return v&&typeof v==='object'?`${v.start} → ${v.end}`:v;
 case 'link':return v&&typeof v==='object'?v.label||v.url:v;
 case 'location':return v&&typeof v==='object'?v.address:v;
 default:return Array.isArray(v)?v.join(', '):v;
 }
}
export function displayCell(v,c){
 if(v===''||v==null)return '';
 if(c.numericFormat&&typeof v==='number'){if(c.numericFormat==='number')return new Intl.NumberFormat('en-US',{maximumFractionDigits:4}).format(v);return new Intl.NumberFormat('en-US',c.numericFormat==='percent'?{style:'percent',maximumFractionDigits:2}:{style:'currency',currency:c.currency||'USD',maximumFractionDigits:2}).format(v);}
 if(c.type==='timeTracking'&&Number.isFinite(Number(v))){const n=Math.floor(Number(v));return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(x=>String(x).padStart(2,'0')).join(':');}
 if(c.type==='progress'&&Number.isFinite(Number(v)))return Math.round(Number(v)*100)+'%';
 if(c.type==='currency'&&Number.isFinite(Number(v)))return new Intl.NumberFormat(undefined,{style:'currency',currency:c.currency||'USD'}).format(Number(v));
 if(c.type==='percent'&&Number.isFinite(Number(v)))return new Intl.NumberFormat(undefined,{style:'percent',maximumFractionDigits:2}).format(Number(v));
 if(c.type==='rating'&&Number.isFinite(Number(v)))return '★'.repeat(Math.round(Number(v)))+'☆'.repeat(5-Math.round(Number(v)));
 // Display only: hide binary floating-point noise (0.1+0.2) at Excel's 15 significant digits. Stored values are untouched.
 if(typeof v==='number'&&Number.isFinite(v)&&!Number.isInteger(v))return String(Number(v.toPrecision(15)));
 return String(v);
}
