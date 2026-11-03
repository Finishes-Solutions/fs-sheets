// Shareable forms: a standalone page at /f/<form id> that anyone with the link can fill in (on this
// computer, or on the office network when the form allows it), with conditional questions and file
// uploads. Submissions are validated on the server against the sheet's column types and add a row.
import {parseCell,validateCell,isReadOnly} from './columns.mjs';
import {randomUUID} from 'node:crypto';

export const MAX_FILES=5,MAX_FILE_BYTES=2*1024*1024;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function findForm(state,formId){for(const sheet of state.sheets)for(const form of sheet.forms||[])if(form.id===formId)return {sheet,form};return null;}
export function formFields(sheet,form){
 return form.columnIds.map(id=>sheet.columns.find(c=>c.id===id)).filter(c=>c&&!isReadOnly(c)).map(c=>({id:c.id,name:c.name,type:c.type,options:c.options||[],required:(form.requiredIds||[]).includes(c.id),help:form.help?.[c.id]||'',condition:form.conditions?.[c.id]||null}));
}
const asText=v=>Array.isArray(v)?v.join(', '):v===true?'true':v===false?'false':String(v??'');
// condition: {columnId, op:'equals'|'not'|'filled'|'empty', value}
export function conditionMet(cond,answers){
 if(!cond?.columnId)return true;const v=answers[cond.columnId],t=asText(v).trim().toLowerCase(),want=String(cond.value??'').trim().toLowerCase();
 if(cond.op==='filled')return t!==''&&t!=='false';if(cond.op==='empty')return t===''||t==='false';
 // Checkbox answers are true/false; the builder's value can be written as Yes/No, checked, 1/0…
 const truthy=/^(yes|y|true|checked|on|1|x)$/,falsy=/^(no|n|false|unchecked|off|0|)$/;
 const hit=typeof v==='boolean'||(v==null&&(truthy.test(want)||falsy.test(want))&&want!=='')?(truthy.test(want)?v===true:falsy.test(want)?v!==true:t===want):Array.isArray(v)?v.map(x=>String(x).toLowerCase()).includes(want):t===want;
 return cond.op==='not'?!hit:hit;
}
// Order matters: a question can depend on an earlier one that is itself hidden.
export function visibleFields(fields,answers){const shown=new Set(),out=[];for(const f of fields){const c=f.condition;if(c?.columnId&&!shown.has(c.columnId)&&fields.some(x=>x.id===c.columnId))continue;if(conditionMet(c,answers)){shown.add(f.id);out.push(f);}}return out;}

export function buildSubmission(state,formId,input,{now=new Date().toISOString(),makeId=randomUUID}={}){
 const found=findForm(state,formId);if(!found)throw Object.assign(Error('This form no longer exists.'),{status:404});
 const {sheet,form}=found,fields=formFields(sheet,form),answers=input&&typeof input.answers==='object'&&input.answers?input.answers:{};
 const visible=visibleFields(fields,answers),cells={},problems=[];
 for(const f of visible){const c=sheet.columns.find(x=>x.id===f.id);let v=answers[f.id];
  if(v===undefined||v===null||v===''||(Array.isArray(v)&&!v.length)||(c.type==='checkbox'&&v===false)){if(f.required)problems.push(`${f.name} is required.`);continue;}
  try{if(typeof v==='string')v=v.slice(0,5000);const parsed=c.type==='multiselect'?(Array.isArray(v)?v.map(String):String(v).split(/\s*,\s*/).filter(Boolean)):parseCell(c,typeof v==='boolean'?v:String(v));validateCell(c,parsed);if(['select','symbol','multiselect'].includes(c.type)&&c.options?.length){const opts=new Set(c.options.map(String));for(const x of [parsed].flat())if(x!==''&&!opts.has(String(x)))throw Error('choose one of the listed options');}cells[c.id]=parsed;}catch(e){problems.push(`${f.name}: ${e.message}`);}}
 const files=Array.isArray(input?.files)?input.files:[];
 if(files.length&&!form.allowFiles)problems.push('This form does not accept files.');
 if(files.length>MAX_FILES)problems.push(`Attach up to ${MAX_FILES} files.`);
 const attachments=[];
 for(const file of files.slice(0,MAX_FILES)){const name=String(file?.name||'file').replace(/[\\/\r\n]/g,'-').slice(0,200),data=String(file?.data||''),m=data.match(/^data:([\w.+\/-]{1,100});base64,([A-Za-z0-9+/=]+)$/);
  if(!m){problems.push(`${name}: could not read the file.`);continue;}
  if(Math.floor(m[2].length*3/4)>MAX_FILE_BYTES){problems.push(`${name} is larger than 2 MB.`);continue;}
  attachments.push({id:makeId(),name,type:m[1],data,source:{form:form.id}});}
 if(form.requireFiles&&form.allowFiles&&!attachments.length)problems.push('Attach at least one file.');
 if(problems.length)throw Object.assign(Error(problems.join(' ')),{status:400,problems});
 const submitter=String(input?.submitter||'').trim().slice(0,60);
 const row={id:makeId(),parentId:null,cells:Object.fromEntries(sheet.columns.map(c=>[c.id,cells[c.id]??(c.type==='checkbox'?false:'')])),comments:submitter?[{id:makeId(),text:`Submitted by ${submitter} through “${form.name}”.`,by:'Form',at:now}]:[],attachments,createdAt:now,updatedAt:now,source:{form:form.id,submittedAt:now}};
 const next=structuredClone(state),target=next.sheets.find(s=>s.id===sheet.id);
 if(form.addToTop)target.rows.unshift(row);else target.rows.push(row);
 return {state:next,rowId:row.id,sheetName:sheet.name,formName:form.name,actor:submitter?`${submitter} (form)`:`Form: ${form.name}`};
}

const input=f=>{const id=`q-${f.id}`,req=f.required?' required':'',name=`name="${esc(f.id)}"`;
 switch(f.type){
  case 'longText':return `<textarea id="${id}" ${name} rows="4"${req}></textarea>`;
  case 'number':case 'currency':case 'percent':return `<input id="${id}" ${name} type="text" inputmode="decimal"${req}>`;
  case 'date':return `<input id="${id}" ${name} type="date"${req}>`;
  case 'datetime':return `<input id="${id}" ${name} type="datetime-local"${req}>`;
  case 'checkbox':return `<label class="check"><input id="${id}" ${name} type="checkbox"> Yes</label>`;
  case 'select':case 'symbol':return `<select id="${id}" ${name}${req}><option value="">Choose…</option>${f.options.map(o=>`<option>${esc(o)}</option>`).join('')}</select>`;
  case 'multiselect':return `<div class="multi" id="${id}" data-multi="${esc(f.id)}">${f.options.map(o=>`<label class="check"><input type="checkbox" value="${esc(o)}"> ${esc(o)}</label>`).join('')}</div>`;
  case 'contact':return `<input id="${id}" ${name} type="email" autocomplete="email"${req}>`;
  default:return `<input id="${id}" ${name} type="text"${req}>`;}};

export function renderFormPage(sheet,form){
 const fields=formFields(sheet,form);
 const config={id:form.id,fields:fields.map(f=>({id:f.id,type:f.type,required:f.required,condition:f.condition})),allowFiles:!!form.allowFiles,requireFiles:!!form.requireFiles,askName:form.askName!==false,success:form.successMessage||'Thanks — your response was recorded.'};
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(form.name)}</title><link rel="stylesheet" href="/form.css"></head><body>
<main class="form-shell"><form id="public-form" novalidate><header><p class="eyebrow">${esc(sheet.name)}</p><h1>${esc(form.name)}</h1>${form.description?`<p class="desc">${esc(form.description)}</p>`:''}</header>
${config.askName?'<div class="q" data-q="__name"><label for="q-__name">Your name</label><input id="q-__name" name="__name" type="text" autocomplete="name" maxlength="60"></div>':''}
${fields.map(f=>`<div class="q" data-q="${esc(f.id)}"${f.condition?' hidden':''}><label for="q-${esc(f.id)}">${esc(f.name)}${f.required?' <span class="req" aria-label="required">*</span>':''}</label>${f.help?`<p class="help">${esc(f.help)}</p>`:''}${input(f)}</div>`).join('')}
${form.allowFiles?`<div class="q" data-q="__files"><label for="q-__files">${esc(form.filesLabel||'Attach files')}${form.requireFiles?' <span class="req">*</span>':''}</label><p class="help">Up to ${MAX_FILES} files, 2 MB each. Photos from a phone camera work.</p><input id="q-__files" type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"><ul id="file-list" class="files"></ul></div>`:''}
<p id="form-error" class="error" role="alert" hidden></p><button type="submit">Submit</button></form>
<section id="form-done" class="done" hidden><h1>${esc(form.name)}</h1><p>${esc(config.success)}</p><button type="button" id="again">Submit another response</button></section></main>
<script type="application/json" id="form-config">${JSON.stringify(config).replace(/</g,'\\u003c')}</script><script src="/form.js"></script></body></html>`;
}
