// Live updates over Server-Sent Events: every saved change is pushed to open browsers as a patch,
// and each browser reports which sheet/row it is looking at (presence). No accounts: people are
// identified by the name they typed, and each browser tab by its client id.
import {diffState} from './state-patch.mjs';

const MAX_PATCH_CHARS=4*1024*1024,PRESENCE_TTL=45_000;
export function createLive({now=()=>Date.now()}={}){
 const clients=new Set(),presence=new Map();
 const write=(res,event,data)=>{try{res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);}catch{clients.delete(res);}};
 const presenceList=()=>{const t=now();for(const [k,v] of presence)if(t-v.at>PRESENCE_TTL)presence.delete(k);return [...presence.entries()].map(([client,v])=>({client,name:v.name,sheetId:v.sheetId,rowId:v.rowId,colId:v.colId,editing:!!v.editing}));};
 const broadcast=(event,data)=>{for(const res of clients)write(res,event,data);};
 const timer=setInterval(()=>{for(const res of clients){try{res.write(': ping\n\n');}catch{clients.delete(res);}}const before=presence.size;const list=presenceList();if(list.length!==before)broadcast('presence',list);},20_000);timer.unref();
 return {
  get size(){return clients.size;},
  connect(req,res,{revision}){
   res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
   res.write('retry: 3000\n\n');clients.add(res);write(res,'hello',{revision,presence:presenceList()});
   req.on('close',()=>clients.delete(res));
  },
  // result: {revision, previous, state}; meta: {actor, client, label}
  changed(result,meta){
   if(!clients.size||!result?.previous)return;
   setImmediate(()=>{let data;try{const patch=diffState(result.previous,result.state);const text=JSON.stringify(patch);data=text.length>MAX_PATCH_CHARS?{revision:result.revision,reload:true}:{revision:result.revision,patch};}catch{data={revision:result.revision,reload:true};}
    broadcast('change',{...data,by:String(meta.actor||'Someone').slice(0,60),client:meta.client||'',label:String(meta.label||'').slice(0,200)});});
  },
  presence(client,info){
   if(!client)return;
   if(!info){presence.delete(client);}else presence.set(client,{name:String(info.name||'Someone').slice(0,60),sheetId:typeof info.sheetId==='string'?info.sheetId:null,rowId:typeof info.rowId==='string'?info.rowId:null,colId:typeof info.colId==='string'?info.colId:null,editing:!!info.editing,at:now()});
   broadcast('presence',presenceList());
  },
  close(){clearInterval(timer);for(const res of clients){try{res.end();}catch{}}clients.clear();}
 };
}
