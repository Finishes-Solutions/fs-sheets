// Field-level workspace patches, shared by the server and the browser.
//
// A patch records `b` (before) and `a` (after) for every changed field: top-level collections,
// sheet properties, individual cells and row fields, plus added/removed rows and sheets and
// order changes. Applying a patch checks each field: if it already equals `a` it is skipped,
// if it equals `b` it is replaced, otherwise the patch conflicts (HTTP 409). This makes saves
// small, lets edits from different tabs merge when they touch different cells, and makes
// undo history cheap (the reverse patch is just another patch).

const J=v=>v===undefined?undefined:JSON.stringify(v);
const has=(o,k)=>o!=null&&Object.hasOwn(o,k)&&o[k]!==undefined;
const copy=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const rowCache=new WeakMap();
// Row JSON is cached per row object. Applying patches replaces changed rows with new objects,
// so a cached string can never describe a row that was later modified through applyPatch.
export function rowJSON(r){let s=rowCache.get(r);if(s===undefined){s=JSON.stringify(r);rowCache.set(r,s);}return s;}

export function conflictError(what){const e=Error('Someone else changed '+what+' at the same time. Reload to see the latest version, then reapply your change.');e.status=409;e.conflict=true;return e;}

function fieldDiff(a,b,skip){const out={};let n=0;
 for(const k of new Set([...Object.keys(a||{}),...Object.keys(b||{})])){if(skip?.has(k))continue;
  const ja=has(a,k)?J(a[k]):undefined,jb=has(b,k)?J(b[k]):undefined;if(ja===jb)continue;
  const e={};if(ja!==undefined)e.b=a[k];if(jb!==undefined)e.a=b[k];out[k]=e;n++;}
 return n?out:null;}

const SKIP_SHEETS=new Set(['sheets']),SKIP_ROWS=new Set(['rows']),SKIP_CELLS=new Set(['cells']);

function sheetDiff(o,s){
 const out={};const props=fieldDiff(o,s,SKIP_ROWS);if(props)out.props=props;
 const oRows=new Map(o.rows.map(r=>[r.id,r])),sRows=new Map(s.rows.map(r=>[r.id,r])),rows=[];
 for(const r of o.rows)if(!sRows.has(r.id))rows.push({id:r.id,remove:r});
 let prev=null;
 s.rows.forEach((r,i)=>{const old=oRows.get(r.id);
  if(!old)rows.push({id:r.id,add:r,after:prev,before:s.rows[i+1]?.id??null});
  else if(rowJSON(old)!==rowJSON(r)){const e={id:r.id};const cells=fieldDiff(old.cells,r.cells);const fields=fieldDiff(old,r,SKIP_CELLS);if(cells)e.cells=cells;if(fields)e.fields=fields;if(cells||fields)rows.push(e);}
  prev=r.id;});
 if(rows.length)out.rows=rows;
 const common=o.rows.filter(r=>sRows.has(r.id)).map(r=>r.id),commonNext=s.rows.filter(r=>oRows.has(r.id)).map(r=>r.id);
 if(J(common)!==J(commonNext))out.order={b:o.rows.map(r=>r.id),a:s.rows.map(r=>r.id)};
 return Object.keys(out).length?out:null;
}

export function diffState(base,next){
 const patch={};const top=fieldDiff(base,next,SKIP_SHEETS);if(top)patch.top=top;
 const bIds=base.sheets.map(s=>s.id),nIds=next.sheets.map(s=>s.id);
 if(J(bIds)!==J(nIds))patch.sheetOrder={b:bIds,a:nIds};
 const bMap=new Map(base.sheets.map(s=>[s.id,s])),nMap=new Map(next.sheets.map(s=>[s.id,s])),sheets=[];
 for(const s of base.sheets)if(!nMap.has(s.id))sheets.push({id:s.id,remove:s});
 for(const s of next.sheets){const o=bMap.get(s.id);if(!o)sheets.push({id:s.id,add:s});else{const d=sheetDiff(o,s);if(d)sheets.push({id:s.id,...d});}}
 if(sheets.length)patch.sheets=sheets;
 return patch;
}
export const isEmptyPatch=p=>!p||(!p.top&&!p.sheetOrder&&!p.sheets);

function applyFields(target,diff,what,force){
 for(const [k,e] of Object.entries(diff||{})){
  const cur=has(target,k)?J(target[k]):undefined,want=has(e,'a')?J(e.a):undefined,was=has(e,'b')?J(e.b):undefined;
  if(cur===want)continue;if(cur!==was&&!force)throw conflictError(what(k));
  if(want===undefined)delete target[k];else target[k]=copy(e.a);
 }
}

// Applies `patch` to `state` in place (rows are replaced copy-on-write). Throws a 409 error on conflict;
// callers must apply to a disposable copy so a conflict leaves the original untouched.
// `force` (undo/redo only) restores the recorded values even if a field drifted, instead of refusing.
export function applyPatch(state,patch,{force=false}={}){
 assertPatchShape(patch);
 const check=(ok,what)=>{if(!ok&&!force)throw conflictError(what);return ok;};
 if(patch.sheetOrder){const cur=J(state.sheets.map(s=>s.id));check(cur===J(patch.sheetOrder.b)||cur===J(patch.sheetOrder.a),'the sheet list');}
 for(const sp of patch.sheets||[]){
  const i=state.sheets.findIndex(s=>s.id===sp.id);
  if(sp.add){if(i>=0){if(J(state.sheets[i])===J(sp.add)||!check(false,'a new sheet'))continue;}state.sheets.push(copy(sp.add));continue;}
  if(sp.remove){if(i<0)continue;check(J(state.sheets[i])===J(sp.remove),'a deleted sheet');state.sheets.splice(i,1);continue;}
  if(!check(i>=0,'a sheet that was deleted'))continue;
  const s=state.sheets[i],name=s.name;
  if(sp.order){const cur=J(s.rows.map(r=>r.id));check(cur===J(sp.order.b)||cur===J(sp.order.a),'row order in '+name);}
  applyFields(s,sp.props,k=>(k==='columns'?'the columns':k)+' in '+name,force);
  if(sp.rows){
   const index=new Map(s.rows.map((r,j)=>[r.id,j]));let rows=s.rows,dirty=false;
   const rowNo=id=>{const j=index.get(id);return j===undefined?'a row':'row '+(j+1);};
   for(const rp of sp.rows){
    if(rp.remove){const j=rows.findIndex(r=>r.id===rp.id);if(j<0)continue;check(rowJSON(rows[j])===J(rp.remove),rowNo(rp.id)+' in '+name);if(!dirty){rows=rows.slice();dirty=true;}rows.splice(j,1);continue;}
    if(rp.add){const j=rows.findIndex(r=>r.id===rp.id);if(j>=0){if(rowJSON(rows[j])!==J(rp.add)&&check(false,'a new row in '+name)){}if(!dirty){rows=rows.slice();dirty=true;}rows[j]=copy(rp.add);continue;}if(!dirty){rows=rows.slice();dirty=true;}// Insert before the next neighbour when it exists (so concurrent appends keep save order), else after the previous one, else at the end.
    const nextAt=rp.before==null?-1:rows.findIndex(r=>r.id===rp.before),prevAt=rp.after==null?-1:rows.findIndex(r=>r.id===rp.after);
    const at=rp.before==null&&rp.after!=null?rows.length:nextAt>=0?nextAt:prevAt>=0?prevAt+1:rp.after==null&&rp.before!=null?0:rows.length;rows.splice(at,0,copy(rp.add));continue;}
    const j=rows.findIndex(r=>r.id===rp.id);if(!check(j>=0,'a row that was deleted in '+name))continue;
    const old=rows[j],row={...old,cells:{...old.cells}};
    applyFields(row.cells,rp.cells,()=>rowNo(rp.id)+' in '+name,force);
    applyFields(row,rp.fields,()=>rowNo(rp.id)+' in '+name,force);
    if(!dirty){rows=rows.slice();dirty=true;}rows[j]=row;
   }
   if(dirty)s.rows=rows;
  }
  if(sp.order){const m=new Map(s.rows.map(r=>[r.id,r]));if(check(m.size===sp.order.a.length&&sp.order.a.every(id=>m.has(id)),'rows in '+name))s.rows=sp.order.a.map(id=>m.get(id));}
 }
 if(patch.sheetOrder){const m=new Map(state.sheets.map(s=>[s.id,s]));if(check(m.size===patch.sheetOrder.a.length&&patch.sheetOrder.a.every(id=>m.has(id)),'the sheet list'))state.sheets=patch.sheetOrder.a.map(id=>m.get(id));}
 applyFields(state,patch.top,k=>k,force);
 return state;
}

export function assertPatchShape(p){
 const bad=()=>{const e=Error('Invalid change patch');e.status=400;return e;};
 const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const fields=d=>{if(d===undefined)return;if(!obj(d))throw bad();for(const e of Object.values(d))if(!obj(e))throw bad();};
 const order=o=>{if(o===undefined)return;if(!obj(o)||!Array.isArray(o.a)||!Array.isArray(o.b)||![...o.a,...o.b].every(x=>typeof x==='string'))throw bad();};
 if(!obj(p))throw bad();fields(p.top);order(p.sheetOrder);
 if(p.sheets!==undefined){if(!Array.isArray(p.sheets))throw bad();for(const sp of p.sheets){if(!obj(sp)||typeof sp.id!=='string')throw bad();if(sp.add!==undefined&&!obj(sp.add))throw bad();if(sp.remove!==undefined&&!obj(sp.remove))throw bad();fields(sp.props);order(sp.order);
  if(sp.rows!==undefined){if(!Array.isArray(sp.rows))throw bad();for(const rp of sp.rows){if(!obj(rp)||typeof rp.id!=='string')throw bad();if(rp.add!==undefined&&!obj(rp.add))throw bad();if([rp.after,rp.before].some(x=>x!==undefined&&x!==null&&typeof x!=='string'))throw bad();fields(rp.cells);fields(rp.fields);}}}}
}

// Reverse patch for undo history. `activity` is append-only and rewritten by undo/redo, so it is excluded.
export function historyPatch(after,before){const p=diffState(after,before);if(p.top){delete p.top.activity;if(!Object.keys(p.top).length)delete p.top;}return p;}
