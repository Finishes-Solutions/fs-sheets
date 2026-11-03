// Office-network access. By default the server only listens on this computer (127.0.0.1).
// SHEETS_HOST=0.0.0.0 shares it on the local network; that requires SHEETS_ACCESS_CODE, which
// people on other computers enter once (stored as an HttpOnly cookie). This computer never needs it.
import {createHmac,timingSafeEqual} from 'node:crypto';

export const COOKIE='sheets_access';
export const isLoopback=addr=>addr==='127.0.0.1'||addr==='::1'||addr==='::ffff:127.0.0.1';
export const isLoopbackHost=h=>!h||h==='127.0.0.1'||h==='localhost'||h==='::1';
export const accessToken=code=>createHmac('sha256',String(code)).update('sheets-access-v1').digest('base64url');

export function startupProblem(host,code){
 if(isLoopbackHost(host))return null;
 if(!code||String(code).length<6)return 'Sharing on the office network (SHEETS_HOST='+host+') needs an access code of at least 6 characters: set SHEETS_ACCESS_CODE.';
 return null;
}
const cookies=header=>Object.fromEntries(String(header||'').split(/;\s*/).filter(Boolean).map(p=>{const i=p.indexOf('=');return [p.slice(0,i),decodeURIComponent(p.slice(i+1))];}));
export function hasAccess(req,code){
 if(isLoopback(req.socket.remoteAddress))return true;
 if(!code)return false;
 const got=Buffer.from(cookies(req.headers.cookie)[COOKIE]||''),want=Buffer.from(accessToken(code));
 return got.length===want.length&&timingSafeEqual(got,want);
}
export function codeMatches(input,code){const a=Buffer.from(accessToken(input||'')),b=Buffer.from(accessToken(code));return a.length===b.length&&timingSafeEqual(a,b);}
export const accessCookie=code=>`${COOKIE}=${encodeURIComponent(accessToken(code))}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${60*60*24*30}`;

export function accessPage(error=''){
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sheets · Access</title>
<style>:root{color-scheme:light}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f5f6;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif;color:#1d1d1f}
form{background:#fff;border:1px solid #e2e2e5;border-radius:12px;padding:28px;width:min(360px,calc(100vw - 32px));box-sizing:border-box;box-shadow:0 8px 28px #0000000f}
h1{font-size:19px;margin:0 0 4px}p{margin:0 0 18px;color:#6b6b70;font-size:13px}label{display:block;font-size:12px;font-weight:600;margin-bottom:6px}
input{width:100%;box-sizing:border-box;height:40px;border:1px solid #d6d6da;border-radius:8px;padding:0 12px;font:inherit}input:focus{outline:2px solid #2b2b2e;outline-offset:1px}
button{margin-top:14px;width:100%;height:40px;border:0;border-radius:8px;background:#1d1d1f;color:#fff;font:600 14px inherit;cursor:pointer}.err{color:#b42318;font-size:13px;margin:10px 0 0}</style></head>
<body><form method="post" action="/access"><h1>Sheets</h1><p>This workspace is shared on the office network. Enter the access code to continue.</p>
<label for="code">Access code</label><input id="code" name="code" type="password" autocomplete="current-password" autofocus required>
${error?`<p class="err" role="alert">${error}</p>`:''}<button type="submit">Continue</button></form></body></html>`;
}
