import PDFDocument from 'pdfkit';
import {fileURLToPath} from 'node:url';
import {runReport,summarize,valueOf,operators,reportColumnLabel,reportDisplay} from './reporting.mjs';

export function validateExport(state,report,options={}){
 if(!report||typeof report.name!=='string'||!report.name.trim()||report.name.length>200)throw Error('Enter a report name (up to 200 characters).');
 if(!Array.isArray(report.sheetIds)||!report.sheetIds.length||report.sheetIds.some(id=>!state.sheets.some(s=>s.id===id)))throw Error('Choose existing report sources.');
 const fields=new Set(['$task','$sheet','$status','$owner','$due','$cost',...state.sheets.filter(s=>report.sheetIds.includes(s.id)).flatMap(s=>s.columns.map(c=>c.name))]);
 if(!Array.isArray(report.columns)||!report.columns.length||report.columns.length>100||report.columns.some(c=>!fields.has(c)))throw Error('Choose up to 100 existing report columns.');
 if(report.filters&&(!Array.isArray(report.filters)||report.filters.length>100||report.filters.some(f=>!fields.has(f.column)||!operators.some(([op])=>op===f.operator))))throw Error('Invalid report conditions.');
 if(options.paper&&!['A4','LETTER'].includes(options.paper)||options.orientation&&!['portrait','landscape'].includes(options.orientation))throw Error('Invalid page layout.');
 if(options.notes&& (typeof options.notes!=='string'||options.notes.length>10000))throw Error('Report notes exceed 10,000 characters.');
 return report;
}

/** A document layout independent of the application screen, with all rows and columns. */
export async function reportPDF(state,report,options={}){
 validateExport(state,report,options);
 const result=runReport(state,report),summaryOptions={statusColumn:report.statusColumn||(report.sheetMappings?'$status':'Status'),dateColumn:report.dateColumn||(report.sheetMappings?'$due':'Due'),metricColumn:report.metricColumn||(report.sheetMappings?'$cost':'Budget')},summary=summarize(result.rows,summaryOptions);
 const doc=new PDFDocument({size:options.paper||'LETTER',layout:options.orientation||'landscape',margin:40,bufferPages:true,autoFirstPage:false,info:{Title:report.name,Author:'sheets',Subject:report.description||'Workspace report',Creator:'sheets report export'}});
 doc.registerFont('Regular',fileURLToPath(new URL('../assets/fonts/DejaVuSans.ttf',import.meta.url)));
 doc.registerFont('Bold',fileURLToPath(new URL('../assets/fonts/DejaVuSans-Bold.ttf',import.meta.url)));
 const chunks=[],done=new Promise((resolve,reject)=>{doc.on('data',b=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 const generated=new Date().toISOString(),left=40,lineHeight=12;let y=0,width=0,bottom=0;
 const short=(s,n=100)=>String(s).length>n?String(s).slice(0,n-1)+'…':String(s);
 function page(){doc.addPage();width=doc.page.width-80;bottom=doc.page.height-52;doc.fillColor('#575757').font('Bold').fontSize(10).text('sheets / REPORT',left,24,{lineBreak:false});doc.fillColor('#6e6e6e').font('Regular').fontSize(8).text(short(report.name,90),left+110,25,{width:width-110,align:'right',lineBreak:false});doc.moveTo(left,43).lineTo(left+width,43).strokeColor('#dfdfdf').stroke();y=58;}
 function lines(text,w,size=9,bold=false){
  doc.font(bold?'Bold':'Regular').fontSize(size);
  const out=[];
  for(const paragraph of String(text??'').replace(/\r/g,'').split('\n')){
   let line='';
   for(const word of paragraph.split(/\s+/)){
    if(!word)continue;
    if(doc.widthOfString((line?line+' ':'')+word)<=w){line+=(line?' ':'')+word;continue;}
    if(line){out.push(line);line='';}
    if(doc.widthOfString(word)<=w){line=word;continue;}
    for(const char of word){if(line&&doc.widthOfString(line+char)>w){out.push(line);line='';}line+=char;}
   }
   out.push(line);
  }
  return out;
 }
 function write(text,{size=9,bold=false,color='#363636',gap=6}={}){
  for(const line of lines(text,width,size,bold)){
   if(y+size+6>bottom)page();
   doc.font(bold?'Bold':'Regular').fontSize(size).fillColor(color).text(line,left,y,{lineBreak:false});y+=size+5;
  }y+=gap;
 }
 page();write(report.name,{size:24,bold:true});
 if(report.description)write(report.description,{size:11,color:'#676767'});
 write('Generated '+generated.replace('T',' ').slice(0,19)+' UTC  •  Workspace revision '+(options.revision??'—'),{size:8});
 const sources=state.sheets.filter(s=>report.sheetIds.includes(s.id));
 write('Sources: '+sources.map(s=>s.name).join(' · '),{size:8});
 write(`${result.rows.length.toLocaleString('en-US')} matching items · ${report.leafOnly?'Parent rows excluded':'All row levels included'} · ${report.sortBy?'Sorted by '+reportColumnLabel(report.sortBy)+' '+(report.sortDirection||'asc'):'Source row order'}`,{size:8});
 if(report.filters?.length)write('Conditions ('+(report.match==='any'?'ANY':'ALL')+'): '+report.filters.map(f=>`${reportColumnLabel(f.column)} ${operators.find(([op])=>op===f.operator)?.[1]||f.operator} ${f.value??''}`).join('; '),{size:8});
 if(options.includeSummary!==false){
  write('REPORT SUMMARY',{bold:true,color:'#575757',gap:8});
  write(`Items: ${summary.total}    Completed: ${summary.complete}    Open: ${summary.open}    Overdue: ${summary.overdue}`,{size:11,bold:true});
  write('Summary uses the report’s mapped status and due-date fields. Unmapped or empty values cannot establish completion or overdue status.',{size:8,color:'#6e6e6e'});
 }
 if(options.notes){write('NOTES',{bold:true,color:'#575757'});write(options.notes);}
 if(options.includeDetails===false){
  write('GROUP SUMMARY',{bold:true,color:'#575757'});
  if(!result.groups.length)write('No matching items.');
  for(const group of result.groups){
   const totals=summarize(group.rows,summaryOptions);
   write(group.name,{size:11,bold:true});
   write(`Items: ${totals.total}    Completed: ${totals.complete}    Open: ${totals.open}    Overdue: ${totals.overdue}`,{size:9,gap:12});
  }
  write('Summary-only export. Detailed rows are omitted by the selected export option.',{size:8,color:'#6e6e6e'});
 }
 const maxCols=(options.orientation||'landscape')==='landscape'?7:5,columns=[...report.columns],bands=[];
 if(options.includeDetails!==false){if(columns.length<=maxCols)bands.push(columns);else for(let i=1;i<columns.length;i+=maxCols-1)bands.push([columns[0],...columns.slice(i,i+maxCols-1)]);}
 if(bands.length>1)write(`Wide report: ${bands.length} column sections. The first selected column and row number repeat in every section.`,{size:8});
 const positions=new Map(result.rows.map((r,i)=>[r,i+1]));
 for(let band=0;band<bands.length;band++){
  if(band)page();
  const cols=bands[band],numberWidth=30,weights=cols.map((c,i)=>i===0?1.7:c==='$sheet'?1.5:1),weight=weights.reduce((a,b)=>a+b,0),widths=[numberWidth,...weights.map(w=>(width-numberWidth)*w/weight)];
  const headers=['#',...cols.map(reportColumnLabel)],headLines=headers.map((c,i)=>lines(c,widths[i]-12,8,true)),headerHeight=Math.max(...headLines.map(a=>a.length))*lineHeight+12;
  function header(group,continued=false){
   if(y+headerHeight+60>bottom)page();
   write(`${bands.length>1?'Section '+(band+1)+'/'+bands.length+' · ':''}${short(group,170)}${continued?' (continued)':''}`,{size:10,bold:true,color:'#575757',gap:4});
   doc.rect(left,y,width,headerHeight).fill('#efefef');let x=left;
   headLines.forEach((ll,i)=>{ll.forEach((line,j)=>doc.font('Bold').fontSize(8).fillColor('#424242').text(line,x+6,y+6+j*lineHeight,{lineBreak:false}));x+=widths[i];});y+=headerHeight;
  }
  if(!result.groups.length)write('No matching items. Adjust the report conditions or sources to include more work.');
  for(const group of result.groups){
   header(group.name);
   for(const entry of group.rows){
    const cells=[String(positions.get(entry)),...cols.map(c=>reportDisplay(valueOf(entry,c)))],wrapped=cells.map((c,i)=>lines(c,widths[i]-12,8.5));
    let remaining=Math.max(...wrapped.map(a=>a.length)),offset=0;
    // Keep normal rows together. Split only cells taller than a complete table page.
    const freshSpace=bottom-58-headerHeight-32;
    if(remaining*lineHeight+12<=freshSpace&&remaining*lineHeight+12>bottom-y){page();header(group.name,true);}
    while(remaining>0){
     let available=Math.floor((bottom-y-12)/lineHeight);
     if(available<1){page();header(group.name,true);available=Math.floor((bottom-y-12)/lineHeight);}
     const count=Math.min(remaining,available),height=count*lineHeight+12;
     if(positions.get(entry)%2===0)doc.rect(left,y,width,height).fill('#f7f7f7');
     let x=left;wrapped.forEach((ll,i)=>{ll.slice(offset,offset+count).forEach((line,j)=>doc.font('Regular').fontSize(8.5).fillColor('#363636').text(line,x+6,y+6+j*lineHeight,{lineBreak:false}));x+=widths[i];});
     y+=height;doc.moveTo(left,y).lineTo(left+width,y).strokeColor('#e6e6e6').lineWidth(.4).stroke();offset+=count;remaining-=count;
    }
   }y+=12;
  }
 }
 const range=doc.bufferedPageRange();
 for(let i=0;i<range.count;i++){doc.switchToPage(i);doc.page.margins.bottom=0;doc.font('Regular').fontSize(8).fillColor('#6e6e6e').text('sheets · '+generated.slice(0,10)+' · '+result.rows.length+' items',left,doc.page.height-30,{lineBreak:false});doc.text(`Page ${i+1} of ${range.count}`,doc.page.width-150,doc.page.height-30,{width:110,align:'right',lineBreak:false});}
 doc.end();return done;
}
