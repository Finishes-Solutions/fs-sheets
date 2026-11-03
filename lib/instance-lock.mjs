// One server per database. The database can live in a synced folder (Dropbox) shared by several
// computers; two servers writing the same SQLite file through a sync service can create conflicted
// copies or lose work. A small lock file next to the database names the computer that is running,
// refreshed by a heartbeat. Another computer refuses to start while that heartbeat is fresh.
import {readFileSync,writeFileSync,unlinkSync,renameSync} from 'node:fs';
import os from 'node:os';

export const HEARTBEAT_MS=30_000,STALE_MS=120_000;

export function readLock(file){try{return JSON.parse(readFileSync(file,'utf8'));}catch{return null;}}
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
const ago=ms=>ms<90_000?Math.round(ms/1000)+' seconds':Math.round(ms/60_000)+' minutes';

// Returns a reason string when another live server holds the lock, otherwise null.
export function lockConflict(lock,{host=os.hostname(),pid=process.pid,now=Date.now()}={}){
 if(!lock||typeof lock!=='object')return null;
 const age=now-Date.parse(lock.heartbeatAt||lock.startedAt||0);
 if(lock.host!==host){if(Number.isFinite(age)&&age<STALE_MS)return `Sheets is already running on “${lock.host}” (last check-in ${ago(Math.max(0,age))} ago). Stop it there (Ctrl+C), wait for Dropbox to sync, then start it here.`;return null;}
 if(lock.pid!==pid&&alive(lock.pid))return `Sheets is already running on this computer (process ${lock.pid}). Open http://localhost:${lock.port||4317} or stop that copy first.`;
 return null;
}

export function acquireLock(file,{port,force=false,host=os.hostname(),log=console}={}){
 const existing=readLock(file),conflict=lockConflict(existing,{host});
 if(conflict&&!force){const e=Error(conflict);e.code='SHEETS_LOCKED';throw e;}
 if(conflict&&force)log.warn?.('Starting anyway (SHEETS_FORCE_START): '+conflict);
 const mine={host,pid:process.pid,port,startedAt:new Date().toISOString(),heartbeatAt:new Date().toISOString()};
 const write=()=>{const tmp=file+'.'+process.pid+'.tmp';writeFileSync(tmp,JSON.stringify(mine));renameSync(tmp,file);};
 write();
 let lost=null;
 const timer=setInterval(()=>{
  const now=readLock(file);
  if(now&&(now.host!==mine.host||now.pid!==mine.pid)){lost=`Another computer (“${now.host}”) started Sheets on this database.`;log.error?.(lost+' This server stopped saving to protect your data.');clearInterval(timer);return;}
  mine.heartbeatAt=new Date().toISOString();try{write();}catch(e){log.error?.('Could not refresh the lock file: '+e.message);}
 },HEARTBEAT_MS);timer.unref();
 return {
  get lost(){return lost;},
  release(){clearInterval(timer);const now=readLock(file);if(now&&now.host===mine.host&&now.pid===mine.pid){try{unlinkSync(file);}catch{}}}
 };
}
