// Serializes and uploads full-workspace saves off the UI thread. The request is identical to the
// main-thread path (same URL, headers and JSON body); the server still validates every save.
self.onmessage=async e=>{const {id,url,body,headers}=e.data;
 try{const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(body)});self.postMessage({id,ok:r.ok,status:r.status,text:await r.text()});}
 catch(err){self.postMessage({id,ok:false,status:0,text:JSON.stringify({error:'Could not reach the local server. Your change was not saved. ('+err.message+')'})});}
};
