// Optimistic, strictly serialized edit queue.
//
// display  = last server-confirmed state + every pending edit, replayed in order.
// Each save is rebuilt from the latest confirmed state at its turn, so server-added metadata,
// activity and automation results are never overwritten by a stale client copy.
// Edits that create ids (new rows, columns) receive the same ids every time they are replayed.
export function createEditQueue({getState,setState,send,clone=structuredClone,newId=()=>crypto.randomUUID(),onChange=()=>{},onConflict=()=>{},onError=()=>{}}){
 let confirmed=null,chain=Promise.resolve(),conflict=null,replay=null;
 const pending=[];
 const id=()=>{if(!replay)return newId();if(replay.i<replay.ids.length)return replay.ids[replay.i++];const v=newId();replay.ids.push(v);replay.i++;return v;};
 const apply=(op,target)=>{replay={ids:op.ids,i:0};try{op.fn(target);}finally{replay=null;}};
 const rebuild=()=>{if(!pending.length){if(confirmed)setState(confirmed);confirmed=null;}else{const view=clone(confirmed);for(const op of pending)try{apply(op,view);}catch{}setState(view);}onChange();};
 const drop=op=>{const i=pending.indexOf(op);if(i>=0)pending.splice(i,1);};
 async function run(op){
  if(conflict){drop(op);rebuild();return false;}
  const next=clone(confirmed);
  try{apply(op,next);}catch(e){drop(op);rebuild();throw e;}
  try{const saved=await send(next,op.label);confirmed=saved;drop(op);rebuild();return true;}
  catch(e){if(e.status===409){conflict=next;onConflict(next,e);}drop(op);rebuild();onError(e);return false;}
 }
 return {
  id,
  get pending(){return pending.length;},
  get conflict(){return conflict;},
  clearConflict(){conflict=null;},
  // Use when the server state changes outside the queue (undo/redo, reload) while edits may be pending.
  replaceConfirmed(next){if(pending.length){confirmed=next;rebuild();}else{setState(next);onChange();}},
  mutate(label,fn){
   if(conflict)return Promise.resolve(false);
   const op={label,fn,ids:[]};
   if(pending.length){
    // The display is already a private copy; apply in place and rebuild only if the edit fails part-way.
    try{apply(op,getState());}catch(e){rebuild();return Promise.reject(e);}
    pending.push(op);onChange();
   }else{
    const preview=clone(getState());
    try{apply(op,preview);}catch(e){return Promise.reject(e);}
    confirmed=getState();pending.push(op);setState(preview);onChange();
   }
   const result=chain.then(()=>run(op));chain=result.catch(()=>false);return result;
  },
  // Runs a server operation (undo/redo) in order after pending saves.
  after(task){const result=chain.then(task);chain=result.catch(()=>false);return result;}
 };
}
