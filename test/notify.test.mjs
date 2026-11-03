import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {once} from 'node:events';
import os from 'node:os';import path from 'node:path';
import {collectWatchers,emailsForItems,digestFor,newInboxItems} from '../lib/notify.mjs';
import {sendMail,smtpConfig} from '../lib/mailer.mjs';
import {fakeSmtp} from './helpers/fake-smtp.mjs';

const ws=()=>({people:[{id:'p1',name:'Pat',email:'pat@example.com'},{id:'p2',name:'Lee',email:'lee@example.com',notify:{watch:false,digest:false}},{id:'p3',name:'Sam'}],inbox:[],workspaces:[{id:'w'}],
  sheets:[{id:'s',name:'Budget',workspaceId:'w',columns:[{id:'a',name:'Item'},{id:'b',name:'Cost'}],rows:[{id:'r',cells:{a:'Slab',b:100},comments:[],attachments:[],watchers:['Pat','Lee','Sam']}]}]});

test('watchers are told about other people\'s changes, never their own', () => {
  const before=ws(),after=ws();after.sheets[0].rows[0].cells.b=150;
  assert.equal(collectWatchers(before,after,'Pat','2026-11-03T10:00:00Z'),2);
  assert.deepEqual(after.inbox.map(i=>i.to),['Lee','Sam']);
  assert.match(after.inbox[0].text,/Pat changed “Slab” in Budget: Cost: 100 → 150/);
  const same=ws();assert.equal(collectWatchers(ws(),same,'Pat'),0,'no change, no notice');
});

test('emails respect each person\'s address and preferences; digest groups unread items', () => {
  const st=ws();const items=[{id:'1',to:'Pat',kind:'watch',text:'x',sheetId:'s',at:'2026-11-03T10:00:00Z'},{id:'2',to:'Lee',kind:'watch',text:'y',sheetId:'s'},{id:'3',to:'Sam',kind:'mention',text:'z',sheetId:'s'},{id:'4',to:'Lee',kind:'mention',text:'Lee was mentioned',sheetId:'s'}];
  const mails=emailsForItems(items,st,{appUrl:'http://office:4317'});
  assert.deepEqual(mails.map(m=>m.to+':'+m.kind),['pat@example.com:watch','lee@example.com:mention'],'Lee turned off watch emails; Sam has no address');
  assert.match(mails[0].text,/http:\/\/office:4317\/#\/sheet\?workspace=w&sheet=s/);
  st.inbox=items.map(i=>({...i,at:'2026-11-03T10:00:00Z',read:false}));
  const d=digestFor(st.people[0],st,{since:'2026-11-02T10:00:00Z'});assert.match(d.subject,/1 unread/);
  assert.equal(digestFor(st.people[1],st,{}),null,'digest off');
  assert.deepEqual(newInboxItems({inbox:[{id:'1'}]},{inbox:[{id:'1'},{id:'2'}]}).map(i=>i.id),['2']);
});

test('SMTP client sends through a server with AUTH LOGIN', async () => {
  const smtp=await fakeSmtp();
  try{
    const cfg=smtpConfig({SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtp.port),SMTP_USER:'bot',SMTP_PASS:'secret',SMTP_FROM:'Sheets <sheets@example.com>',SMTP_SECURE:'0'});
    await sendMail(cfg,{to:'pat@example.com',subject:'Hello — résumé',text:'Line one\n.\nend',html:'<p>x</p>'});
    assert.equal(smtp.messages.length,1);assert.equal(smtp.messages[0].to,'pat@example.com');
    assert.equal(smtp.text(smtp.messages[0]),'Line one\n.\nend');
    await assert.rejects(sendMail({...cfg,pass:'wrong'},{to:'pat@example.com',subject:'x',text:'y'}),/535/);
    await assert.rejects(sendMail(cfg,{to:'not an address',subject:'x',text:'y'}),/Invalid recipient/);
  }finally{await smtp.close();}
});

test('server: a mention emails the person; watching a row emails on changes', async () => {
  const smtp=await fakeSmtp(),dir=await mkdtemp(path.join(os.tmpdir(),'notify-')),port=String(45000+Math.floor(Math.random()*900));
  const p=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:port,DB_PATH:path.join(dir,'x.sqlite'),SHEETS_AUTO_BACKUP:'0',SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtp.port),SMTP_USER:'bot',SMTP_PASS:'secret',SMTP_FROM:'sheets@example.com',SMTP_SECURE:'0',SHEETS_DIGEST_HOUR:'99'},stdio:['ignore','pipe','pipe']});
  try{
    await new Promise((ok,bad)=>{p.stdout.on('data',b=>{if(String(b).includes('ready'))ok();});p.on('exit',c=>bad(Error('exit '+c)));});
    const api=async(route,body,who='Lee')=>{const r=await fetch(`http://127.0.0.1:${port}/api/${route}`,body?{method:'POST',headers:{'Content-Type':'application/json','X-Sheets-Tester':who},body:JSON.stringify(body)}:{});return {status:r.status,...await r.json()};};
    let st=await api('state');const next=structuredClone(st.state);
    next.people=[{id:'p1',name:'Pat',email:'pat@example.com'}];const row=next.sheets[0].rows[0];row.watchers=['Pat'];
    st=await api('state',{state:next,revision:st.revision,label:'setup'});assert.equal(st.status,200);
    const n2=structuredClone(st.state);n2.sheets[0].rows[0].comments.push({id:'c1',text:'@[Pat] please check',by:'Lee',at:new Date().toISOString()});
    st=await api('state',{state:n2,revision:st.revision,label:'comment'});assert.equal(st.status,200);
    for(let i=0;i<50&&smtp.messages.length<2;i++)await new Promise(r=>setTimeout(r,100));
    const subjects=smtp.messages.map(m=>smtp.subject(m)).sort();
    assert.deepEqual(subjects,['Lee mentioned you','Row changed in '+st.state.sheets[0].name].sort());
    const status=await api('notifications');assert.equal(status.configured,true);assert.equal(status.sent24h,2);
    assert.equal((await api('notifications/test',{to:'pat@example.com'})).status,200);
  }finally{p.kill('SIGTERM');await once(p,'exit').catch(()=>{});await smtp.close();await rm(dir,{recursive:true,force:true});}
});
