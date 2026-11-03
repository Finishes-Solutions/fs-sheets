// Per-row cell history. Stored on the row (capped) so it travels in row-level patches and
// undo history, instead of growing a workspace-wide log. The server owns it: whatever a
// client sends for `cellHistory` is replaced by the previous saved value plus new entries.

export const HISTORY_LIMIT=30;
const MAX_TEXT=300;
const J=v=>JSON.stringify(v===undefined?'':v);
const clip=v=>typeof v==='string'&&v.length>MAX_TEXT?v.slice(0,MAX_TEXT)+'…':v;

export function recordRowHistory(prev,row,actor,now,limit=HISTORY_LIMIT){
 const history=Array.isArray(prev?.cellHistory)?prev.cellHistory.slice():[];
 if(prev){
  const keys=new Set([...Object.keys(prev.cells||{}),...Object.keys(row.cells||{})]);
  for(const col of keys){const a=prev.cells?.[col],b=row.cells?.[col];if(J(a)===J(b))continue;if((a===undefined||a==='')&&(b===undefined||b===''))continue;history.push({at:now,by:actor,col,from:clip(a??''),to:clip(b??'')});}
 }
 if(history.length)row.cellHistory=history.slice(-limit);else delete row.cellHistory;
 return row;
}

// Newest first; optionally for one column. Column names resolve at read time, so renames show current names.
export function historyEntries(row,columns,columnId=null){
 const names=new Map(columns.map(c=>[c.id,c.name]));
 return (row?.cellHistory||[]).filter(e=>!columnId||e.col===columnId).slice().reverse().map(e=>({...e,column:names.get(e.col)||'Deleted column'}));
}
