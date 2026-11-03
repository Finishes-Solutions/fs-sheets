import {parseCell,validateCell,isReadOnly} from '../lib/columns.mjs';
export function parseTSV(text){
 const rows=[],row=[];let value='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const ch=text[i];
  if(quoted){if(ch==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=ch;continue;}
  if(ch==='"'&&value===''&&!closed){quoted=true;continue;}
  if(ch==='\t'){row.push(value);value='';closed=false;continue;}
  if(ch==='\r'||ch==='\n'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(value);rows.push(row.splice(0));value='';closed=false;continue;}
  if(closed)throw Error('Invalid quoted clipboard value.');value+=ch;
 }
 if(quoted)throw Error('Unclosed quote in clipboard data.');
 if(value!==''||row.length||!rows.length||closed){row.push(value);rows.push(row);}
 const width=Math.max(...rows.map(r=>r.length));return rows.map(r=>Array.from({length:width},(_,i)=>r[i]??''));
}
export function encodeTSV(matrix){return matrix.map(row=>row.map(v=>{const text=String(v??'');return /[\t\r\n"]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;}).join('\t')).join('\r\n');}
export function pastePlan({matrix,rows,columns,rowIndex,columnIndex}){
 if(rowIndex<0||columnIndex<0)throw Error('Select a destination cell.');
 if(matrix.length>10000||matrix.reduce((n,r)=>n+r.length,0)>100000)throw Error('Paste at most 100,000 cells at once.');
 if(matrix.some(r=>columnIndex+r.length>columns.length))throw Error('Paste extends past the last visible column. Add columns first.');
 return matrix.map((values,i)=>{const row=rows[rowIndex+i];if(row?.locked)throw Error('Paste includes a locked row. Unlock it first.');const cells={};values.forEach((v,j)=>{const c=columns[columnIndex+j];if(isReadOnly(c))throw Error('Paste includes the read-only column '+c.name+'. Choose editable columns.');const parsed=parseCell(c,clipboardValue(c,v));validateCell(c,parsed);cells[c.id]=parsed;});return {id:row?.id,cells};});
}

function clipboardValue(c,value){
 let v=String(value);if(v.startsWith('='))return v;
 if(['number','currency','percent'].includes(c.type)){
  v=v.trim();let negative=false;if(/^\(.*\)$/.test(v)){negative=true;v=v.slice(1,-1);}
  v=v.replace(/^[$£€]\s*/,'');const percent=v.endsWith('%');if(percent)v=v.slice(0,-1);
  if(/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(v))v=v.replaceAll(',','');
  if(percent&&Number.isFinite(Number(v)))v=String(Number(v)/100);if(negative)v='-'+v;
 }
 if(c.type==='date'){const m=v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(m)v=m[3]+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0');}
 return v;
}

// Builds what goes on the system clipboard for a copied range. External apps (Excel, Numbers, Sheets)
// receive computed display values as TSV plus an HTML table; formulas stay internal (`raw`) so that
// pasting inside this app can translate them relative to the destination.
export function clipboardPayload(rows,columns,displayValue,rawValue){
 const values=rows.map(r=>columns.map(c=>String(displayValue(r,c)??'')));
 const raw=rows.map(r=>columns.map(c=>{const v=rawValue(r,c);return typeof v==='string'&&v.startsWith('=')?v:null;}));
 const esc=v=>v.replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])).replace(/\r?\n/g,'<br>');
 const html='<meta charset="utf-8"><table>'+values.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</table>';
 return {text:encodeTSV(values),html,raw,values};
}
// For an internal paste: formulas from the source range, translated; plain values elsewhere.
export function internalPasteMatrix(payload,translate){return payload.values.map((row,i)=>row.map((v,j)=>payload.raw[i][j]!=null?translate(payload.raw[i][j]):v));}
