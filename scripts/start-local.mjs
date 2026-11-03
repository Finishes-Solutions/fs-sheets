import {spawn} from 'node:child_process';import {readFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import net from 'node:net';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),port=4317;
const releaseVersion=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
const probe=net.createServer();
try{await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(port,'127.0.0.1',resolve);});await new Promise(resolve=>probe.close(resolve));}
catch(e){console.error('Port 4317 is still in use. Stop the OLD app with Ctrl+C in its terminal, then run Launch Sheets.command again.');process.exit(1);}
const child=spawn(process.execPath,['server.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,PORT:String(port),DB_PATH:path.join(root,'data','fs-sheet.sqlite')}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill('SIGTERM'));
child.on('exit',code=>process.exit(code||0));
let ready=false;
for(let i=0;i<50;i++){
 try{const response=await fetch('http://127.0.0.1:'+port+'/api/build');if(response.ok){const build=await response.json();if(build.version===releaseVersion){ready=true;break;}}}catch{}
 await new Promise(resolve=>setTimeout(resolve,200));
}
if(!ready){console.error('The updated server did not become ready. See the error above.');child.kill('SIGTERM');process.exitCode=1;}
else{
 let workspace='';try{workspace=JSON.parse(await readFile(path.join(root,'local-update.json'),'utf8')).workspaceId||'';}catch{}
 const url='http://localhost:'+port+'/#/portfolios'+(workspace?'?workspace='+encodeURIComponent(workspace):'');
 console.log('\nUPDATED APP READY: '+url+'\nLook for v'+releaseVersion+' beside sheets. Keep this terminal open.\n');
 if(process.platform==='darwin'){const opener=spawn('open',[url],{stdio:'ignore'});opener.on('error',()=>console.log('Open the address above in your browser.'));}
}
