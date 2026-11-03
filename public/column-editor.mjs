// Column editor model: type grouping, header glyphs, insertion positions and
// validated column construction. Pure functions so they run in the browser and
// in node:test without a DOM.
import {columnTypes,systemTypes} from '../lib/columns.mjs';

export const typeGroups=[
 ['Common',['text','number','currency','percent','date','checkbox','select','contact']],
 ['Text & choices',['longText','multiselect','symbol','tags','rating','color','country']],
 ['People & time',['people','datetime','duration','timeline','week','worldClock','timeTracking']],
 ['Links & relationships',['link','email','phone','location','connected','mirror','dependency','button','vote']],
 ['Automatic & calculated',['formula','autoNumber','itemId','createdAt','createdBy','updatedAt','updatedBy','files','latestComment','progress']]
];

const glyphs={text:'T',longText:'¶',number:'#',currency:'$',percent:'%',date:'▦',datetime:'◷',checkbox:'☑',select:'▾',multiselect:'☰',contact:'@',people:'@',symbol:'★',itemId:'ID',autoNumber:'№',timeline:'↔',connected:'⇄',link:'↗',location:'⌖',email:'✉',phone:'☏',rating:'★',tags:'#',duration:'⧗',createdAt:'◷',createdBy:'@',updatedAt:'◷',updatedBy:'@',formula:'ƒ',files:'⎘',latestComment:'❝',mirror:'⇋',dependency:'⤳',timeTracking:'⏱',worldClock:'◴',country:'⚑',color:'◐',vote:'↑',button:'▭',week:'W',progress:'▰'};
export function typeGlyph(c){if(c?.numericFormat==='currency')return '$';if(c?.numericFormat==='percent')return '%';if(c?.numericFormat==='number')return '#';return glyphs[c?.type]||'T';}
export function typeLabel(c){const label=columnTypes.find(([t])=>t===c?.type)?.[1]||'Text / number';return c?.numericFormat?label+' · '+c.numericFormat+' format':label;}

export const typeHints={
 text:'Short text or numbers. Formulas start with =.',longText:'Multi-line notes edited in a larger field.',number:'Numeric values; sums and comparisons treat them as numbers.',currency:'Money amounts shown with a currency symbol.',percent:'Stored as fractions: 0.25 displays as 25%.',date:'Calendar dates with a date picker and shortcuts such as t or +3.',datetime:'Date with time of day.',checkbox:'True/false values.',select:'One choice from a list. List order controls sorting.',multiselect:'Several choices from a list.',contact:'One person name or email.',people:'Several people.',symbol:'One symbol choice from a list.',itemId:'Stable automatic row ID.',autoNumber:'Automatic sequence with optional prefix.',timeline:'Start and end date range.',connected:'Links rows from another sheet.',link:'Web address with an optional label.',location:'Address or coordinates.',email:'Email address.',phone:'Phone number.',rating:'Rating from 0 to 5.',tags:'Free-form tags.',duration:'Days of work; accepts 2d, 1w, 4h.',createdAt:'Set automatically when the row is created.',createdBy:'Set automatically to the row creator.',updatedAt:'Updated automatically on every change.',updatedBy:'Updated automatically to the last editor.',formula:'Every cell is calculated from the column formula.',files:'Shows the row attachment count.',latestComment:'Shows the newest row comment.',mirror:'Reads a field from rows in a connected-sheet column.',dependency:'Predecessor rows for scheduling.',timeTracking:'Start/stop timer per row.',worldClock:'Time zone clock.',country:'Country selection.',color:'Color swatch value.',vote:'Up-votes per row.',button:'Clickable link button.',week:'ISO week value.',progress:'Percent complete from chosen checkbox columns.'
};

// Which optional sections of the editor apply to a type.
export function typeSections(type){
 const s=new Set();
 if(['select','multiselect','symbol','tags'].includes(type))s.add('options');
 if(!systemTypes.includes(type))s.add('formula');
 if(['autoNumber','itemId'].includes(type))s.add('numbering');
 if(type==='currency')s.add('currency');
 if(type==='mirror')s.add('mirror');
 if(type==='progress')s.add('progress');
 return s;
}

// Insertion index 0 is reserved: the first column is the primary (hierarchy) column.
export function insertPositions(columns){
 return columns.map((c,i)=>({value:String(i+1),label:(i===columns.length-1?'At the end, after “':'After “')+c.name+'”'+(c.hidden?' (hidden)':'')}));
}
export function defaultInsertIndex(columns,activeColumnId){
 const i=columns.findIndex(c=>c.id===activeColumnId);
 return i<0?columns.length:Math.max(1,i+1);
}
export function uniqueColumnName(columns,base='New column'){
 const taken=new Set(columns.map(c=>c.name.toLowerCase()));if(!taken.has(base.toLowerCase()))return base;
 for(let n=2;;n++)if(!taken.has((base+' '+n).toLowerCase()))return base+' '+n;
}
export function clampInsertIndex(columns,value){const n=Number(value);return Number.isInteger(n)?Math.max(1,Math.min(columns.length,n)):columns.length;}

// Builds a validated column from editor fields. Throws readable errors.
export function buildColumn(f,columns,existing,makeId){
 const name=String(f.name||'').trim();
 if(!name||columns.some(c=>c.id!==existing?.id&&c.name.toLowerCase()===name.toLowerCase()))throw Error('Use a unique column name.');
 if(name.length>80)throw Error('Column names are limited to 80 characters.');
 const type=String(f.type||'text');
 if(!columnTypes.some(([t])=>t===type))throw Error('Choose a column type.');
 if(existing&&existing.id===columns[0]?.id&&type!=='text')throw Error('Keep the primary column as text.');
 const checkboxes=columns.filter(c=>c.type==='checkbox');
 const c={...existing,id:existing?.id||makeId(),name,type,width:Math.max(80,Math.min(600,Number(f.width)||existing?.width||180)),hidden:existing?.hidden||false,
  options:String(f.options||'').split(',').map(x=>x.trim()).filter(Boolean),formula:String(f.formula||'').trim()?String(f.formula).trim().replace(/^=?/,'='):'',
  prefix:f.prefix??existing?.prefix??'',digits:Math.max(1,Math.min(12,Number(f.digits)||1)),currency:f.currency||existing?.currency||'USD',
  connectionColumnId:f.connectionColumnId??existing?.connectionColumnId??'',mirrorColumn:f.mirrorColumn??existing?.mirrorColumn??'',mirrorAggregate:f.mirrorAggregate||existing?.mirrorAggregate||'join',
  progressColumnIds:checkboxes.filter(x=>f['progress-'+x.id]).map(x=>x.id)};
 if(type==='mirror'&&(!c.connectionColumnId||!c.mirrorColumn))throw Error('Choose a connected column and mirrored field');
 if(type==='progress'&&!c.progressColumnIds.length)throw Error('Choose at least one checkbox to track progress');
 if(systemTypes.includes(type)&&c.formula)throw Error('Automatic columns cannot have formulas.');
 if(type==='formula'&&!c.formula)throw Error('Enter a column formula.');
 return c;
}
