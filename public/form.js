// Standalone form page (served at /f/<id>): conditional questions, files, submission.
(()=>{
 const cfg=JSON.parse(document.getElementById('form-config').textContent),form=document.getElementById('public-form'),err=document.getElementById('form-error');
 let files=[];
 const read=id=>{const box=form.querySelector(`[data-q="${CSS.escape(id)}"]`);if(!box)return '';const multi=box.querySelector('[data-multi]');if(multi)return [...multi.querySelectorAll('input:checked')].map(i=>i.value);const el=box.querySelector('input,select,textarea');if(!el)return '';return el.type==='checkbox'?el.checked:el.value.trim();};
 const answers=()=>Object.fromEntries(cfg.fields.map(f=>[f.id,read(f.id)]));
 const met=(c,a)=>{if(!c?.columnId)return true;const v=a[c.columnId],t=(Array.isArray(v)?v.join(', '):String(v??'')).trim().toLowerCase(),want=String(c.value??'').trim().toLowerCase();if(c.op==='filled')return t!==''&&t!=='false';if(c.op==='empty')return t===''||t==='false';const hit=Array.isArray(v)?v.map(x=>String(x).toLowerCase()).includes(want):t===want;return c.op==='not'?!hit:hit;};
 const refresh=()=>{const a=answers(),shown=new Set();for(const f of cfg.fields){const c=f.condition;const ok=(!c?.columnId||!cfg.fields.some(x=>x.id===c.columnId)||shown.has(c.columnId))&&met(c,a);const box=form.querySelector(`[data-q="${CSS.escape(f.id)}"]`);if(box){box.hidden=!ok;box.querySelectorAll('input,select,textarea').forEach(el=>{if(f.required&&el.type!=='checkbox'&&!box.querySelector('[data-multi]'))el.required=ok;});}if(ok)shown.add(f.id);}};
 form.addEventListener('input',refresh);form.addEventListener('change',refresh);refresh();
 const list=document.getElementById('file-list'),picker=document.getElementById('q-__files');
 const paint=()=>{if(!list)return;list.innerHTML='';files.forEach((f,i)=>{const li=document.createElement('li');li.textContent=f.name+' · '+Math.max(1,Math.round(f.size/1024))+' KB ';const b=document.createElement('button');b.type='button';b.textContent='Remove';b.onclick=()=>{files.splice(i,1);paint();};li.append(b);list.append(li);});};
 const shrink=f=>new Promise((ok,bad)=>{const reader=new FileReader();reader.onerror=()=>bad(Error('Could not read '+f.name));reader.onload=()=>{const url=reader.result,img=new Image();img.onload=()=>{let w=img.naturalWidth,h=img.naturalHeight;const k=Math.min(1,2000/Math.max(w,h));w=Math.round(w*k);h=Math.round(h*k);const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);c.toBlob(b=>b&&b.size<=2*1024*1024?ok(new File([b],f.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'})):bad(Error(f.name+' is too large.')),'image/jpeg',0.8);};img.onerror=()=>bad(Error('Could not read '+f.name));img.src=url;};reader.readAsDataURL(f);});
 picker?.addEventListener('change',async()=>{for(let f of picker.files){if(files.length>=5){show('Attach up to 5 files.');break;}if(f.size>1.8*1024*1024&&/^image\//.test(f.type)){try{f=await shrink(f);}catch(e){show(e.message);continue;}}if(f.size>2*1024*1024){show(f.name+' is larger than 2 MB.');continue;}files.push(f);}picker.value='';paint();});
 const show=m=>{err.textContent=m;err.hidden=!m;if(m)err.scrollIntoView({block:'center',behavior:'smooth'});};
 const dataUrl=f=>new Promise((ok,bad)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>bad(Error('Could not read '+f.name));r.readAsDataURL(f);});
 form.addEventListener('submit',async e=>{e.preventDefault();show('');
  const missing=[...form.querySelectorAll('.q:not([hidden])')].filter(box=>{const id=box.dataset.q,f=cfg.fields.find(x=>x.id===id);if(!f?.required)return false;const v=read(id);return v===''||v===false||(Array.isArray(v)&&!v.length);});
  if(missing.length){show('Please answer: '+missing.map(b=>b.querySelector('label').textContent.replace('*','').trim()).join(', '));missing[0].querySelector('input,select,textarea')?.focus();return;}
  if(cfg.requireFiles&&!files.length){show('Attach at least one file.');return;}
  const btn=form.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Sending…';
  try{const payload={answers:answers(),submitter:read('__name'),files:await Promise.all(files.map(async f=>({name:f.name,data:await dataUrl(f)})))};
   const r=await fetch(`/api/forms/${encodeURIComponent(cfg.id)}/submit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const x=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(x.error||'Could not send the form ('+r.status+').');
   form.hidden=true;document.getElementById('form-done').hidden=false;window.scrollTo(0,0);
  }catch(e2){show(e2.message);}finally{btn.disabled=false;btn.textContent='Submit';}});
 document.getElementById('again')?.addEventListener('click',()=>{form.reset();files=[];paint();refresh();form.hidden=false;document.getElementById('form-done').hidden=true;});
})();
