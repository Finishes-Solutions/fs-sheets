import {compare,operators} from './reporting.mjs';
export const sheetOperators=[...operators,['notContains','does not contain'],['today','is today'],['past','is in the past'],['next7','is in the next 7 days']];
export function matchesConditions(s,r,conditions=[],match='all',get,asOf=new Date().toISOString().slice(0,10)){
 const tests=conditions.map(f=>{const c=s.columns.find(x=>x.id===f.columnId),v=f.columnId==='$locked'?!!r.locked:f.columnId==='$attachments'?(r.attachments||[]).length:f.columnId==='$comments'?(r.comments||[]).length:c?get(s,r,c):'';
 if(f.operator==='notContains')return !String(v).toLowerCase().includes(String(f.value).toLowerCase());
 if(f.operator==='today')return String(v).slice(0,10)===asOf;
 if(f.operator==='past')return !!v&&Number.isFinite(Date.parse(v))&&String(v).slice(0,10)<asOf;
 if(f.operator==='next7'){const end=new Date(Date.parse(asOf)+7*864e5).toISOString().slice(0,10);return String(v)>=asOf&&String(v).slice(0,10)<=end;}
 const other=f.compareColumnId?s.columns.find(x=>x.id===f.compareColumnId):null;if(f.compareColumnId&&!other)return false;return compare(v,f.operator,other?get(s,r,other):f.value);});
 return !tests.length||(match==='any'?tests.some(Boolean):tests.every(Boolean));
}
export function sortRows(s,rows,sorts,get){
 const cmp=(a,b)=>{for(const spec of sorts||[]){const c=s.columns.find(c=>c.id===spec.columnId);if(!c)continue;const av=get(s,a,c),bv=get(s,b,c),ab=av==null||av==='',bb=bv==null||bv==='';if(ab!==bb)return ab?1:-1;const ai=c.options?.indexOf(String(av))??-1,bi=c.options?.indexOf(String(bv))??-1;const n=['select','symbol'].includes(c.type)&&ai>=0&&bi>=0?ai-bi:String(av).localeCompare(String(bv),undefined,{numeric:true});if(n)return n*(spec.direction==='desc'?-1:1);}return 0;};
 // Sort siblings only; preserve the hierarchy instead of detaching children.
 const ids=new Set(rows.map(r=>r.id)),groups=new Map();for(const r of rows){const p=ids.has(r.parentId)?r.parentId:null;if(!groups.has(p))groups.set(p,[]);groups.get(p).push(r);}
 const out=[];function walk(p){for(const r of (groups.get(p)||[]).sort(cmp)){out.push(r);walk(r.id);}}walk(null);return out;
}
export function cellFormat(s,r,c,get){
 const importedIndex=s.importColumnIds?.indexOf(c.id)??-1;
 let result={...(c.format||{}),...(s.importStyles?.[r.importStyleIds?.[importedIndex]]||{}),...(r.format||{}),...(r.cellFormats?.[c.id]||{})};
 // First matching rule wins for each property, matching the ordered rule editor.
 for(const rule of [...(s.formatRules||[])].reverse())if(rule.enabled!==false&&(!rule.targetIds?.length||rule.targetIds.includes(c.id))&&matchesConditions(s,r,rule.conditions,rule.match,get))result={...result,...rule.format};
 return result;
}
export function styleText(f={}){
 const parts=[];if(['Arial','Calibri','Aptos','Verdana','Tahoma','Times New Roman','Helvetica','Courier New','Georgia'].includes(f.fontFamily))parts.push('font-family:'+f.fontFamily);if(['top','center','bottom'].includes(f.verticalAlign))parts.push('vertical-align:'+(f.verticalAlign==='center'?'middle':f.verticalAlign));for(const side of ['left','right','top','bottom']){const border=f.borders?.[side];if(border&&/^[#][0-9a-f]{6}$/i.test(border.color)){const styles={thin:'1px solid',medium:'2px solid',thick:'3px solid',double:'3px double',dashed:'1px dashed',dotted:'1px dotted',hair:'1px dotted',mediumDashed:'2px dashed',dashDot:'1px dashed',mediumDashDot:'2px dashed',dashDotDot:'1px dotted',mediumDashDotDot:'2px dotted',slantDashDot:'1px dashed'};if(styles[border.style])parts.push('border-'+side+':'+styles[border.style]+' '+border.color);}}if(/^#[\da-f]{6}$/i.test(f.fill||''))parts.push(`background-color:${f.fill}`);if(/^#[\da-f]{6}$/i.test(f.color||''))parts.push(`color:${f.color}`);
 if(f.bold)parts.push('font-weight:700');if(f.italic)parts.push('font-style:italic');
 if(f.underline||f.strike)parts.push('text-decoration:'+ [f.underline?'underline':'',f.strike?'line-through':''].filter(Boolean).join(' '));
 if(['left','center','right'].includes(f.align))parts.push(`text-align:${f.align}`);
 if(f.wrap)parts.push('white-space:normal');if(Number.isFinite(Number(f.size))&&Number(f.size)>=6&&Number(f.size)<=72)parts.push(`font-size:${f.size}px`);
 return parts.join(';');
}
export function assertUnlocked(before,after){
 for(const s of before.sheets){const sh=after.sheets.find(x=>x.id===s.id);for(const r of s.rows.filter(r=>r.locked)){const row=sh?.rows.find(x=>x.id===r.id);if(!row)throw Error('Unlock the row before deleting it or its sheet.');
 if(JSON.stringify(r.cells)!==JSON.stringify(row.cells)||JSON.stringify(r.formulaOverrides||{})!==JSON.stringify(row.formulaOverrides||{})||(r.parentId||null)!==(row.parentId||null))throw Error('Unlock the row before editing its cells or hierarchy.');
 for(const c of s.columns){const next=sh.columns.find(x=>x.id===c.id);if(!next||next.type!==c.type||next.formula!==c.formula||JSON.stringify([next.connectionColumnId,next.mirrorColumn,next.mirrorAggregate,next.progressColumnIds])!==JSON.stringify([c.connectionColumnId,c.mirrorColumn,c.mirrorAggregate,c.progressColumnIds]))throw Error('Unlock rows before changing column types, formulas, or deleting columns.');}
 }}
}
export function validateSheetTools(s){
 const ids=new Set(s.columns.map(c=>c.id));
 const conditions=cs=>{if(!Array.isArray(cs)||cs.length>30||cs.some(f=>!f||!ids.has(f.columnId)&&!['$locked','$attachments','$comments'].includes(f.columnId)||!sheetOperators.some(([op])=>op===f.operator)||f.compareColumnId&&!ids.has(f.compareColumnId)))throw Error('Invalid sheet condition');};
 for(const f of s.savedFilters||[]){if(typeof f.id!=='string'||typeof f.name!=='string')throw Error('Invalid saved filter');conditions(f.conditions);}
 for(const f of s.formatRules||[]){conditions(f.conditions);if(!f.format||!Array.isArray(f.targetIds)||f.targetIds.some(id=>!ids.has(id)))throw Error('Invalid formatting rule');}
 for(const f of s.sorts||[])if(!ids.has(f.columnId)||!['asc','desc'].includes(f.direction))throw Error('Invalid sort');
}
