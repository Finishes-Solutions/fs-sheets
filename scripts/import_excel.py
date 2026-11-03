#!/usr/bin/env python3
"""Convert supplied Smartsheet Excel exports to an additive project bundle.
Requires openpyxl. Never executes workbook text, formulas, macros or links.
Usage: python scripts/import_excel.py exports.zip output-directory
"""
import sys,zipfile,io,json,uuid,datetime,hashlib,collections,os,re,xml.etree.ElementTree as ET
import openpyxl
from openpyxl.styles.colors import COLOR_INDEX
uid=lambda:str(uuid.uuid4())
def value(v):
 if isinstance(v,(datetime.datetime,datetime.date)):return v.isoformat()
 return v if v is not None else ''
def color(c,theme):
 if not c:return None
 if c.type=='rgb':h=c.rgb[-6:]
 elif c.type=='indexed':h=COLOR_INDEX[c.indexed][-6:] if c.indexed<len(COLOR_INDEX) else None
 elif c.type=='theme':h=theme[c.theme] if c.theme<len(theme) else None
 else:return None
 if not h:return None
 t=c.tint
 if t:h=''.join(f'{round(int(h[i:i+2],16)*(1+t) if t<0 else int(h[i:i+2],16)*(1-t)+255*t):02X}' for i in (0,2,4))
 return '#'+h

def run(archive,out):
 os.makedirs(out,exist_ok=True);workspace=uid();bundle={'workspace':{'id':workspace,'name':'Imported Smartsheet exports'},'sheets':[]};report=[]
 raw_input=open(archive,'rb').read()
 if str(archive).lower().endswith('.xlsx'):
  outer=io.BytesIO()
  with zipfile.ZipFile(outer,'w') as wrapper:wrapper.writestr(os.path.basename(archive),raw_input)
  archive=io.BytesIO(outer.getvalue())
 with zipfile.ZipFile(archive) as z:
  if len(z.infolist())>200 or sum(i.file_size for i in z.infolist())>100*1024*1024:raise ValueError('Archive exceeds import limits')
  for name in z.namelist():
   if name.startswith('__MACOSX/') or not name.lower().endswith('.xlsx'):continue
   raw=z.read(name)
   with zipfile.ZipFile(io.BytesIO(raw)) as inner:
    if sum(i.file_size for i in inner.infolist())>100*1024*1024:raise ValueError('Expanded workbook exceeds import limits')
   w=openpyxl.load_workbook(io.BytesIO(raw));s=w.worksheets[0];theme=[]
   if s.max_column>100 or s.max_row>20001:raise ValueError('Workbook exceeds 100 columns or 20,000 data rows')
   if w.loaded_theme:
    root=ET.fromstring(w.loaded_theme);scheme=root.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}clrScheme')
    theme=[list(e)[0].get('lastClr') or list(e)[0].get('val') for e in scheme]
   def style(c):
    f={'bold':bool(c.font.b),'italic':bool(c.font.i),'underline':bool(c.font.u),'strike':bool(c.font.strike),'wrap':bool(c.alignment.wrap_text)}
    if c.fill.patternType=='solid':f['fill']=color(c.fill.fgColor,theme)
    f['color']=color(c.font.color,theme)
    if c.alignment.horizontal in ('left','center','right'):f['align']=c.alignment.horizontal
    if c.font.sz:f['size']=c.font.sz*4/3
    if c.font.name:f['fontFamily']=c.font.name
    if c.alignment.vertical:f['verticalAlign']=c.alignment.vertical
    borders={}
    for side in ['left','right','top','bottom']:
     edge=getattr(c.border,side)
     if edge and edge.style:borders[side]={'style':edge.style,'color':color(edge.color,theme) or '#000000'}
    if borders:f['borders']=borders
    return {k:v for k,v in f.items() if v is not None}
   columns=[];names=set();formulas=[];palette=[];palette_map={}
   for j in range(1,s.max_column+1):
    header=s.cell(1,j);label=str(header.value or f'Column {j}');base=label;i=2
    while label.lower() in names:label=f'{base} ({i})';i+=1
    names.add(label.lower());cells=[s.cell(r,j) for r in range(2,s.max_row+1) if s.cell(r,j).value is not None];vs=[c.value for c in cells]
    typ='text'
    if vs and all(isinstance(v,bool) for v in vs):typ='checkbox'
    elif vs and all(isinstance(v,(int,float)) and not isinstance(v,bool) for v in vs):
     typ='percent' if any('%' in c.number_format for c in cells) else 'currency' if any('$' in c.number_format for c in cells) else 'number'
    elif vs and all(isinstance(v,(datetime.date,datetime.datetime)) and not (isinstance(v,datetime.datetime) and v.time()!=datetime.time()) for v in vs):typ='date'
    dim=s.column_dimensions[header.column_letter]
    columns.append({'id':uid(),'name':label,'type':typ,'options':[],'formula':'','width':max(100,min(500,round((dim.width or 18)*7))),'hidden':bool(dim.hidden),'sourceHeaderFormat':style(header),'sourceHeader':value(header.value)})
   rows=[];stack=[];styled=0
   for i,source_cells in enumerate(s.iter_rows(min_row=2),2):
    cells={};styles=[];indent=max((c.alignment.indent or 0 for c in source_cells if c.value is not None),default=0)
    row={'id':uid(),'parentId':None,'cells':cells,'comments':[],'attachments':[],'sourceRow':i,'sourceHidden':bool(s.row_dimensions[i].hidden),'sourceHeight':s.row_dimensions[i].height}
    if any(c.value is not None for c in source_cells):
     while stack and stack[-1][0]>=indent:stack.pop()
     if stack:row['parentId']=stack[-1][1]
     stack.append((indent,row['id']))
    for j,c in enumerate(source_cells):
     col=columns[j];v=value(c.value)
     if col['type']=='date' and v:v=v[:10]
     if col['type']=='checkbox' and v=='':v=False
     if v!='':cells[col['id']]=v
     if c.data_type=='f':formulas.append({'row':i,'column':j+1,'formula':v})
     f=style(c);k=json.dumps(f,sort_keys=True)
     if k not in palette_map:palette_map[k]=len(palette);palette.append(f)
     styles.append(palette_map[k]);styled+=bool(f)
    row['importStyleIds']=styles;rows.append(row)
   comment_count=0;orphans=[]
   if 'Comments' in w:
    for vals in w['Comments'].values:
     if not any(v is not None for v in vals):continue
     vals=list(vals)+[None]*4;m=re.fullmatch(r'Row (\d+)',str(vals[0]));idx=int(m[1])-1 if m else -1
     comment={'id':uid(),'text':str(vals[1] or ''),'by':str(vals[2] or 'Imported'),'at':str(vals[3] or ''),'sourceDate':str(vals[3] or '')}
     try:comment['at']=datetime.datetime.strptime(str(vals[3]),'%m/%d/%y %I:%M %p').isoformat()
     except ValueError:pass
     if 0<=idx<len(rows):rows[idx]['comments'].append(comment);comment_count+=1
     else:orphans.append([value(v) for v in vals[:4]])
   summary=[{'id':uid(),'name':str(r[0]),'value':value(r[1]) if len(r)>1 else ''} for r in w['Summary'].values if r and r[0]] if 'Summary' in w else []
   sh={'id':uid(),'workspaceId':workspace,'folderId':None,'name':name[:-5],'description':'Imported Excel export; original formulas and automation rules were not included in these files.','columns':columns,'rows':rows,'forms':[],'automations':[],'summaryFields':summary,'importStyles':palette,'importColumnIds':[c['id'] for c in columns],'source':{'file':name,'worksheet':s.title,'sha256':hashlib.sha256(raw).hexdigest(),'formulas':formulas,'unmatchedComments':orphans,'mergedRanges':[str(x) for x in s.merged_cells.ranges]}}
   bundle['sheets'].append(sh);report.append({'file':name,'rows':len(rows),'columns':len(columns),'comments':comment_count,'unmatchedComments':len(orphans),'formulas':len(formulas),'conditionalRules':len(s.conditional_formatting),'stylePalette':len(palette),'hierarchicalRows':sum(bool(r['parentId']) for r in rows)})
 with open(os.path.join(out,'excel-import.json'),'w') as f:json.dump(bundle,f,ensure_ascii=False,separators=(',',':'))
 with open(os.path.join(out,'excel-import-report.json'),'w') as f:json.dump(report,f,indent=2)
 print(json.dumps(report,indent=2))
if __name__=='__main__':run(*sys.argv[1:])
