// Minimal SMTP client (no dependencies): implicit TLS (port 465) or STARTTLS, AUTH PLAIN/LOGIN.
// Configured only through environment variables; credentials are never stored in the workspace.
import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';

export function smtpConfig(env=process.env){
 if(!env.SMTP_HOST)return null;
 const port=Number(env.SMTP_PORT)||587;
 return {host:env.SMTP_HOST,port,secure:env.SMTP_SECURE?env.SMTP_SECURE==='1'||env.SMTP_SECURE==='true':port===465,starttls:env.SMTP_STARTTLS!=='0',user:env.SMTP_USER||'',pass:env.SMTP_PASS||'',from:env.SMTP_FROM||env.SMTP_USER||'sheets@localhost',rejectUnauthorized:env.SMTP_ALLOW_SELF_SIGNED!=='1'};
}

const header=v=>/^[\x20-\x7e]*$/.test(v)?v:'=?UTF-8?B?'+Buffer.from(v).toString('base64')+'?=';
const clean=v=>String(v).replace(/[\r\n]+/g,' ').trim();
export function buildMessage({from,to,subject,text,html,date=new Date(),id=`${Date.now()}.${Math.random().toString(36).slice(2)}@${os.hostname()}`}){
 const boundary='sheets-'+Math.random().toString(36).slice(2);
 const lines=[`From: ${clean(from)}`,`To: ${clean(to)}`,`Subject: ${header(clean(subject))}`,`Date: ${date.toUTCString()}`,`Message-ID: <${id}>`,'MIME-Version: 1.0'];
 const b64=s=>Buffer.from(s).toString('base64').replace(/.{76}/g,'$&\r\n');
 if(html)lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=utf-8','Content-Transfer-Encoding: base64','',b64(text||''),`--${boundary}`,'Content-Type: text/html; charset=utf-8','Content-Transfer-Encoding: base64','',b64(html),`--${boundary}--`);
 else lines.push('Content-Type: text/plain; charset=utf-8','Content-Transfer-Encoding: base64','',b64(text||''));
 return lines.join('\r\n');
}

export async function sendMail(cfg,msg,{timeout=20000}={}){
 if(!cfg)throw Error('Email is not set up (SMTP_HOST is missing).');
 const to=clean(msg.to);if(!/^[^@\s<>]+@[^@\s<>]+$/.test(to))throw Error('Invalid recipient address');
 let sock=cfg.secure?tls.connect({host:cfg.host,port:cfg.port,servername:cfg.host,rejectUnauthorized:cfg.rejectUnauthorized}):net.connect({host:cfg.host,port:cfg.port});
 sock.setTimeout(timeout);
 let buf='',waiter=null;
 const onData=d=>{buf+=d;const m=buf.match(/(?:^|\r\n)(\d{3}) [^\r\n]*\r\n$/);if(m&&waiter){const text=buf;buf='';const w=waiter;waiter=null;w.resolve({code:Number(m[1]),text});}};
 const attach=s=>{s.setEncoding('utf8');s.on('data',onData);s.on('error',e=>{waiter?.reject(e);waiter=null;});s.on('timeout',()=>{waiter?.reject(Error('Email server timed out'));waiter=null;s.destroy();});};
 attach(sock);
 const read=()=>new Promise((resolve,reject)=>{waiter={resolve,reject};onData('');});
 const cmd=async(line,expect)=>{if(line!==null)sock.write(line+'\r\n');const r=await read();if(!expect.includes(r.code))throw Error(`Email server said: ${r.text.trim().split('\r\n').pop()}`);return r;};
 try{
  await cmd(null,[220]);
  let ehlo=await cmd('EHLO '+os.hostname().replace(/[^\w.-]/g,''),[250]);
  if(!cfg.secure&&cfg.starttls&&/STARTTLS/i.test(ehlo.text)){
   await cmd('STARTTLS',[220]);sock.removeListener('data',onData);
   sock=tls.connect({socket:sock,servername:cfg.host,rejectUnauthorized:cfg.rejectUnauthorized});await new Promise((ok,bad)=>{sock.once('secureConnect',ok);sock.once('error',bad);});attach(sock);
   ehlo=await cmd('EHLO '+os.hostname().replace(/[^\w.-]/g,''),[250]);
  }
  if(cfg.user){
   if(/AUTH[^\r\n]*PLAIN/i.test(ehlo.text))await cmd('AUTH PLAIN '+Buffer.from('\0'+cfg.user+'\0'+cfg.pass).toString('base64'),[235]);
   else{await cmd('AUTH LOGIN',[334]);await cmd(Buffer.from(cfg.user).toString('base64'),[334]);await cmd(Buffer.from(cfg.pass).toString('base64'),[235]);}
  }
  const fromAddr=(cfg.from.match(/<([^>]+)>/)||[,cfg.from])[1];
  await cmd(`MAIL FROM:<${fromAddr}>`,[250]);await cmd(`RCPT TO:<${to}>`,[250,251]);await cmd('DATA',[354]);
  const data=buildMessage({...msg,from:cfg.from,to}).replace(/\r\n\./g,'\r\n..');
  await cmd(data+'\r\n.',[250]);
  sock.write('QUIT\r\n');sock.end();
 }catch(e){sock.destroy();throw e;}
}
