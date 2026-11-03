// Starts Sheets for the office network: asks for (or reads) an access code, then runs the server on
// all network interfaces. Usage: npm run office   (or SHEETS_ACCESS_CODE=... npm run office)
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let code=process.env.SHEETS_ACCESS_CODE||'';
if(!code){const rl=createInterface({input:process.stdin,output:process.stdout});code=(await rl.question('Choose an access code for other computers (6+ characters): ')).trim();rl.close();}
const child=spawn(process.execPath,[path.join(root,'server.mjs')],{stdio:'inherit',env:{...process.env,SHEETS_HOST:process.env.SHEETS_HOST||'0.0.0.0',SHEETS_ACCESS_CODE:code}});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>child.kill(sig));
child.on('exit',c=>process.exit(c??0));
