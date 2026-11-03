// Pure helpers for spreadsheet-style editing: selection statistics, fill handle series,
// row moves and find & replace. No DOM access, so node:test covers them directly.

// ---- Selection statistics (footer: Sum · Average · Count) ----
export function selectionStats(values){
 let sum=0,count=0,cells=0,min=Infinity,max=-Infinity;
 for(const v of values){cells++;const n=typeof v==='number'?v:typeof v==='string'&&v.trim()!==''&&!v.startsWith('#')&&Number.isFinite(Number(v))?Number(v):null;if(n===null)continue;sum+=n;count++;if(n<min)min=n;if(n>max)max=n;}
 return {cells,count,sum:count?Number(sum.toPrecision(15)):0,average:count?Number((sum/count).toPrecision(15)):0,min:count?min:null,max:count?max:null};
}

// ---- Fill handle ----
const isDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
const addDays=(iso,n)=>{const d=new Date(iso+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const dayDiff=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/864e5);
// Values to place in `count` new cells continuing one source line (a column for vertical fills).
// `translate(formula, targetIndex, sourceIndex)` shifts relative references from source cell `sourceIndex`
// to output position `targetIndex` (callers map both to real sheet positions).
export function fillSeries(source,count,translate=f=>f){
 const out=[];if(!source.length||count<=0)return out;
 const nums=source.every(v=>typeof v==='number'),dates=source.every(isDate);
 if(nums&&source.length>=2){const step=source[1]-source[0];if(source.every((v,i)=>i===0||Number((v-source[i-1]).toPrecision(12))===Number(step.toPrecision(12)))){for(let i=1;i<=count;i++)out.push(Number((source.at(-1)+step*i).toPrecision(15)));return out;}}
 if(dates){const step=source.length>=2?dayDiff(source[0],source[1]):1;if(source.every((v,i)=>i===0||dayDiff(source[i-1],v)===step)){for(let i=1;i<=count;i++)out.push(addDays(source.at(-1),step*i));return out;}}
 if(source.length===1&&typeof source[0]==='string'&&!source[0].startsWith('=')){const m=source[0].match(/^(.*?)(\d+)$/);if(m){const width=m[2].length,start=Number(m[2]);for(let i=1;i<=count;i++)out.push(m[1]+String(start+i).padStart(width,'0'));return out;}}
 for(let i=0;i<count;i++){const k=i%source.length,v=source[k];out.push(typeof v==='string'&&v.startsWith('=')?translate(v,i,k):v);}
 return out;
}

// ---- Row moves (drag and drop) ----
// Moves rows `ids` (with all their descendants) to just before `beforeId`, as siblings of that row.
// Returns a new rows array. Throws if the target is inside the moved block.
export function moveRows(rows,ids,beforeId){
 const byId=new Map(rows.map(r=>[r.id,r])),moving=new Set();
 const inBlock=r=>{let p=r;while(p){if(ids.includes(p.id))return true;p=byId.get(p.parentId);}return false;};
 for(const r of rows)if(inBlock(r))moving.add(r.id);
 if(beforeId!==null&&moving.has(beforeId))throw Error('Drop the rows outside the rows being moved.');
 const target=beforeId===null?null:byId.get(beforeId);if(beforeId!==null&&!target)throw Error('Target row not found.');
 const roots=new Set(ids.filter(id=>!ids.includes(byId.get(id)?.parentId)));
 const block=rows.filter(r=>moving.has(r.id)).map(r=>roots.has(r.id)?{...r,parentId:target?target.parentId??null:null}:r);
 const rest=rows.filter(r=>!moving.has(r.id)),at=target?rest.findIndex(r=>r.id===beforeId):rest.length;
 return [...rest.slice(0,at),...block,...rest.slice(at)];
}

// ---- Hierarchy (indent / outdent) ----
// Rows are a flat list in display order; parentId builds the tree. Only the topmost selected rows
// move (their children come along). Edits rows in place; returns how many rows changed and why
// the rest could not.
const topSelected=(rows,ids)=>{const set=new Set(ids),byId=new Map(rows.map(r=>[r.id,r]));const covered=r=>{let p=byId.get(r.parentId);while(p){if(set.has(p.id))return true;p=byId.get(p.parentId);}return false;};return rows.filter(r=>set.has(r.id)&&!covered(r));};
// Indent: each row becomes the last child of the row above it at the same level (its previous sibling).
export function indentRows(rows,ids){
 const tops=topSelected(rows,ids),moved=new Map(),original=new Map(rows.map(r=>[r.id,r.parentId??null]));let changed=0,blocked=0;
 for(const r of tops){
  const i=rows.indexOf(r);let prev=null;
  for(let j=i-1;j>=0;j--){if((original.get(rows[j].id))===(original.get(r.id))){prev=rows[j];break;}if(rows[j].id===original.get(r.id))break;}
  if(!prev){blocked++;continue;}
  const parent=tops.includes(prev)?moved.get(prev.id):prev.id;
  if(parent===undefined){blocked++;continue;}
  r.parentId=parent;moved.set(r.id,parent);changed++;
 }
 return {changed,blocked};
}
// Outdent: the row moves up one level. Rows below it that shared its old parent become its children,
// so the order on screen never changes (same as Smartsheet).
export function outdentRows(rows,ids){
 const tops=topSelected(rows,ids),byId=new Map(rows.map(r=>[r.id,r]));let changed=0,blocked=0,adopted=0;
 for(const r of [...tops].reverse()){
  const old=r.parentId??null;if(old===null){blocked++;continue;}
  const i=rows.indexOf(r);
  for(let j=i+1;j<rows.length;j++){const x=rows[j];if((x.parentId??null)===old){x.parentId=r.id;adopted++;}else{let p=byId.get(x.parentId),inside=false;while(p){if(p.id===old){inside=true;break;}p=byId.get(p.parentId);}if(!inside)break;}}
  r.parentId=byId.get(old)?.parentId??null;changed++;
 }
 return {changed,blocked,adopted};
}

// ---- Find & replace ----
const escapeRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function matcher({find,matchCase=false,wholeCell=false}){
 if(!find)return null;
 const re=new RegExp(wholeCell?'^'+escapeRe(find)+'$':escapeRe(find),matchCase?'g':'gi');
 return {test:text=>{re.lastIndex=0;return re.test(String(text??''));},replace:(text,rep)=>String(text??'').replace(re,()=>rep)};
}
// cells: [{row, column, raw, shown, editable}] → matches and the replacement plan.
export function findReplacePlan(cells,opts){
 const m=matcher(opts);if(!m)return {matches:[],changes:[],skipped:0};
 const matches=[],changes=[];let skipped=0;
 for(const c of cells){const text=c.raw!==null&&typeof c.raw==='object'?c.shown:c.raw;if(!m.test(text)&&!m.test(c.shown))continue;matches.push(c);
  if(opts.replace===undefined)continue;
  if(!c.editable||(typeof c.raw==='string'&&c.raw.startsWith('='))||(c.raw!==null&&typeof c.raw==='object')){skipped++;continue;}
  if(!m.test(text)){skipped++;continue;}
  changes.push({row:c.row,column:c.column,value:m.replace(text,opts.replace)});}
 return {matches,changes,skipped};
}
