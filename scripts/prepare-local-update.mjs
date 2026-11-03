import {DatabaseSync,backup} from 'node:sqlite';
import {readStored,writeState} from '../lib/store.mjs';
import {cp,mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

export function mergeImportedSheets(state,bundle){
 if(!Array.isArray(state.workspaces)||!Array.isArray(state.sheets))throw Error('The existing database is not a sheets project. Nothing was changed.');
 if(!bundle?.workspace?.id||!Array.isArray(bundle.sheets))throw Error('The update is missing its imported-sheet bundle.');
 const next=structuredClone(state),added=[],kept=[];
 const missing=bundle.sheets.filter(sheet=>{
  const existing=next.sheets.find(s=>s.id===sheet.id||(s.source?.sha256&&s.source.sha256===sheet.source?.sha256)||s.name===sheet.name);
  if(existing){kept.push({name:sheet.name,existingId:existing.id});return false;}return true;
 });
 let workspace=next.workspaces.find(w=>w.id===bundle.workspace.id)||next.workspaces.find(w=>w.name===bundle.workspace.name);
 if(missing.length&&!workspace){workspace=structuredClone(bundle.workspace);next.workspaces.push(workspace);}
 for(const source of missing){const sheet=structuredClone(source);sheet.workspaceId=workspace.id;sheet.folderId=null;next.sheets.push(sheet);added.push(sheet.name);}
 if(next.sheets.length>100)throw Error('The combined project exceeds 100 sheets. Nothing was changed.');
 if(added.length){next.activity||=[];next.activity.push({id:randomUUID(),at:new Date().toISOString(),by:'Local update',message:'Added missing imported sheets: '+added.join(', ')});}
 return {state:next,added,kept,workspaceId:workspace?.id||next.sheets.find(s=>kept.some(k=>k.existingId===s.id))?.workspaceId||next.workspaces[0]?.id};
}

export async function prepareLocalUpdate({sourceApp,releaseApp,targetApp,bundlePath}){
 sourceApp=path.resolve(sourceApp);targetApp=path.resolve(targetApp);releaseApp=path.resolve(releaseApp);
 if(targetApp===sourceApp||targetApp.startsWith(sourceApp+path.sep)||sourceApp.startsWith(targetApp+path.sep)||targetApp===releaseApp)throw Error('Choose a separate destination folder.');
 const originalDB=path.join(sourceApp,'data','fs-sheet.sqlite');await stat(originalDB);
 try{await stat(targetApp);throw Error('Destination already exists. Choose a new folder; no existing files will be replaced.');}catch(e){if(e.code!=='ENOENT')throw e;}
 const bundle=JSON.parse(await readFile(bundlePath,'utf8'));
 await mkdir(path.dirname(targetApp),{recursive:true});
 // The release is a new app folder; never overwrite the user's source checkout.
 await cp(releaseApp,targetApp,{recursive:true,errorOnExist:true,force:false});
 const dbPath=path.join(targetApp,'data','fs-sheet.sqlite');await mkdir(path.dirname(dbPath),{recursive:true});
 try{await stat(dbPath);throw Error('Release unexpectedly contains a database. Original database is untouched.');}catch(e){if(e.code!=='ENOENT')throw e;}
 const source=new DatabaseSync(originalDB,{readOnly:true});
 try{await backup(source,dbPath);}finally{source.close();}
 const db=new DatabaseSync(dbPath);let result;
 try{
  const row=readStored(db);if(!row)throw Error('Existing project state was not found.');
  result=mergeImportedSheets(JSON.parse(row.body),bundle);
  // Keep an independent, exact pre-import snapshot beside the updated copy.
  await mkdir(path.join(targetApp,'backups'),{recursive:true});await backup(db,path.join(targetApp,'backups','before-local-update.sqlite'));
  if(result.added.length){
   const body=JSON.stringify(result.state);if(Buffer.byteLength(body)>64*1024*1024)throw Error('Combined project exceeds the 64 MB limit. Original app is untouched.');
   db.exec('CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL, created_at TEXT NOT NULL)');
   if(!db.prepare('PRAGMA table_info(history)').all().some(c=>c.name==='client_id'))db.exec("ALTER TABLE history ADD COLUMN client_id TEXT NOT NULL DEFAULT ''");
   db.exec('BEGIN IMMEDIATE');
   try{db.prepare('INSERT INTO history (body,created_at,client_id) VALUES (?,?,?)').run(row.body,new Date().toISOString(),'local-update');writeState(db,row.revision+1,result.state);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  }
 }finally{db.close();}
 const summary={version:JSON.parse(await readFile(path.join(targetApp,'package.json'),'utf8')).version,originalApp:sourceApp,updatedApp:targetApp,workspaceId:result.workspaceId,added:result.added,kept:result.kept};
 await writeFile(path.join(targetApp,'local-update.json'),JSON.stringify(summary,null,2));return summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [sourceApp,releaseApp,targetApp,bundlePath]=process.argv.slice(2);if(!sourceApp||!releaseApp||!targetApp||!bundlePath)throw Error('Usage: node prepare-local-update.mjs ORIGINAL_APP RELEASE_APP NEW_APP IMPORT_BUNDLE');const result=await prepareLocalUpdate({sourceApp,releaseApp,targetApp,bundlePath});console.log(JSON.stringify(result,null,2));}
 catch(e){console.error('Update stopped:',e.message);console.error('The original app and its database were not modified.');process.exitCode=1;}
}
