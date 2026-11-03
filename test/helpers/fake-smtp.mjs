// A tiny SMTP server for tests: records each message (envelope + decoded data).
import net from 'node:net';
export async function fakeSmtp({user='bot',pass='secret'}={}){
 const messages=[];
 const server=net.createServer(sock=>{sock.setEncoding('utf8');let mode='cmd',data='',auth=null,msg={};sock.write('220 fake ESMTP\r\n');let buf='';
  sock.on('data',chunk=>{buf+=chunk;let i;while((i=buf.indexOf('\r\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+2);
   if(mode==='data'){if(line==='.'){mode='cmd';msg.data=data;messages.push(msg);msg={};data='';sock.write('250 queued\r\n');}else data+=line.replace(/^\.\./,'.')+'\r\n';continue;}
   if(auth==='user'){auth=Buffer.from(line,'base64').toString()===user?'pass':'bad';sock.write('334 UGFzc3dvcmQ6\r\n');continue;}
   if(auth==='pass'){const ok=Buffer.from(line,'base64').toString()===pass;auth=null;sock.write(ok?'235 ok\r\n':'535 bad\r\n');continue;}
   const cmd=line.slice(0,4).toUpperCase();
   if(cmd==='EHLO')sock.write('250-fake\r\n250 AUTH LOGIN\r\n');
   else if(line.toUpperCase()==='AUTH LOGIN'){auth='user';sock.write('334 VXNlcm5hbWU6\r\n');}
   else if(cmd==='MAIL'){msg.from=line;sock.write('250 ok\r\n');}
   else if(cmd==='RCPT'){msg.to=line.match(/<([^>]+)>/)[1];sock.write('250 ok\r\n');}
   else if(cmd==='DATA'){mode='data';sock.write('354 go\r\n');}
   else if(cmd==='QUIT'){sock.end('221 bye\r\n');}
   else sock.write('250 ok\r\n');}});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const decode=m=>{const parts=[...m.data.matchAll(/Content-Type: text\/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)(?:\r\n--|\r\n$)/g)];return parts.length?Buffer.from(parts[0][1].replace(/\s/g,''),'base64').toString():'';};
 return {port:server.address().port,messages,text:m=>decode(m),subject:m=>(m.data.match(/^Subject: (.*)$/m)||[])[1],close:()=>new Promise(r=>server.close(r))};
}
