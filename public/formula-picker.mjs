// Grid reference picking while a formula is being edited (inline cell editor or the formula drawer).
// Produces Smartsheet-style references understood by lib/formulas.mjs:
//   [Col]@row  same row       [Col]12  absolute row       [Col]3:[Col]9  range       [Col]:[Col]  whole column

export const columnRef=name=>'['+String(name)+']';

export function cellReference({column,rowNumber,sameRow}){return columnRef(column)+(sameRow?'@row':String(rowNumber));}

export function rangeReference(a,b){
 // a/b: {column, rowNumber}; normalized so the range reads top-left to bottom-right by row.
 const [first,last]=a.rowNumber<=b.rowNumber?[a,b]:[b,a];
 return columnRef(first.column)+first.rowNumber+':'+columnRef(last.column)+last.rowNumber;
}

export function columnReference(column){return columnRef(column)+':'+columnRef(column);}

// Inserts `ref` into `text`, replacing the selection. When `previous` describes the span of the
// reference inserted by the last pick (and the caret is still at its end), that span is replaced instead,
// so shift-click can grow a single reference into a range.
export function insertReference(text,selStart,selEnd,ref,previous=null){
 let start=selStart,end=selEnd;
 if(previous&&selStart===selEnd&&selStart===previous.end&&text.slice(previous.start,previous.end)===previous.text){start=previous.start;end=previous.end;}
 else if(start===end&&start>0&&/[\]\w@)]/.test(text[start-1])){
  // Directly after another operand: separate with a comma inside functions, otherwise a plus sign.
  const open=(text.slice(0,start).match(/\(/g)||[]).length,close=(text.slice(0,start).match(/\)/g)||[]).length;
  ref=(open>close?',':'+')+ref;
 }
 const value=text.slice(0,start)+ref+text.slice(end);
 const refStart=start+(ref.startsWith(',')||ref.startsWith('+')?1:0);
 return {value,caret:start+ref.length,span:{start:refStart,end:start+ref.length,text:value.slice(refStart,start+ref.length)}};
}

export const isFormulaText=v=>typeof v==='string'&&v.trimStart().startsWith('=');

// Display-only rendering of imported stable references: CELLREF("@row","<columnId>") → [Column]@row and
// CELLREF("<rowId>","<columnId>") → [Column]N. The stored formula is never rewritten by this function.
export function readableFormula(formula,sheet){
 if(typeof formula!=='string'||!formula.includes('CELLREF'))return formula;
 const cols=new Map(sheet.columns.map(c=>[c.id,c.name])),rows=new Map(sheet.rows.map((r,i)=>[r.id,i+1]));
 return formula.replace(/CELLREF\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g,(m,row,col)=>{const name=cols.get(col);if(!name)return m;if(row==='@row')return '['+name+']@row';const n=rows.get(row);return n?'['+name+']'+n:m;});
}
