import {DatabaseSync,backup} from 'node:sqlite';
import {cp,mkdir,readFile,writeFile,stat,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';import {randomUUID} from 'node:crypto';
import {mergeImportedSheets} from './prepare-local-update.mjs';
const exists=async file=>{try{await stat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
export async function updateExistingRepo({repo,releaseApp,bundlePath}){
 repo=await realpath(repo);releaseApp=await realpath(releaseApp);
 if(repo===releaseApp||repo.startsWith(releaseApp+path.sep)||releaseApp.startsWith(repo+path.sep))throw Error('The release and repository must be separate folders.');
 for(const name of ['package.json','server.mjs','data/fs-sheet.sqlite'])await stat(path.join(repo,name));
 const bundle=JSON.parse(await readFile(bundlePath,'utf8')),dbPath=path.join(repo,'data','fs-sheet.sqlite'),reader=new DatabaseSync(dbPath,{readOnly:true});
 let snapshot,result,backupDir;
 try{
  snapshot=reader.prepare('SELECT revision,body FROM state WHERE id=1').get();if(!snapshot)throw Error('Existing project was not found.');
  result=mergeImportedSheets(JSON.parse(snapshot.body),bundle);
  if(Buffer.byteLength(JSON.stringify(result.state))>64*1024*1024)throw Error('Combined project exceeds 64 MB.');
  const roots=['public','lib','assets','scripts','docs','test','node_modules','data/python','server.mjs','package.json','package-lock.json','README.md','AGENTS.md','requirements-excel.txt','Launch Sheets.command'];
  const managed=[];
  for(const name of roots)if(await exists(path.join(releaseApp,name))){const target=path.join(repo,name);if(await exists(target)&& (await lstat(target)).isSymbolicLink())throw Error('Refusing to replace a symbolic link: '+target);managed.push(name);}
  backupDir=path.join(repo,'backups','before-update-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,6));
  await mkdir(backupDir,{recursive:true});await backup(reader,path.join(backupDir,'fs-sheet.sqlite'));
  for(const name of [...managed,'local-update.json'])if(await exists(path.join(repo,name)))await cp(path.join(repo,name),path.join(backupDir,'files',name),{recursive:true});
  await writeFile(path.join(backupDir,'RESTORE.txt'),'Original SQLite snapshot: fs-sheet.sqlite\nOriginal replaced files: files/\nStop the app before restoring. The .git directory and unrelated files were not changed.\n');
  // Overlay only release-managed paths; never delete unrelated local files or touch .git.
  for(const name of managed)await cp(path.join(releaseApp,name),path.join(repo,name),{recursive:true});
 }catch(e){if(backupDir)e.message+=' Backup: '+backupDir;throw e;}finally{reader.close();}
 const version=JSON.parse(await readFile(path.join(repo,'package.json'),'utf8')).version;
 await writeFile(path.join(repo,'local-update.json'),JSON.stringify({version,originalApp:repo,updatedApp:repo,workspaceId:result.workspaceId,backupDir,added:result.added,kept:result.kept},null,2));
 const db=new DatabaseSync(dbPath);
 try{
  db.exec('BEGIN IMMEDIATE');
  const latest=db.prepare('SELECT revision,body FROM state WHERE id=1').get();
  if(latest.revision!==snapshot.revision||latest.body!==snapshot.body)throw Error('Project changed during the update. Code is updated, but imported sheets were not added; stop other servers before retrying.');
  if(result.added.length){
   db.exec('CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT,body TEXT NOT NULL,created_at TEXT NOT NULL)');
   if(!db.prepare('PRAGMA table_info(history)').all().some(c=>c.name==='client_id'))db.exec("ALTER TABLE history ADD COLUMN client_id TEXT NOT NULL DEFAULT ''");
   db.prepare('INSERT INTO history (body,created_at,client_id) VALUES (?,?,?)').run(snapshot.body,new Date().toISOString(),'local-update');
   db.prepare('UPDATE state SET revision=?,body=? WHERE id=1').run(snapshot.revision+1,JSON.stringify(result.state));
  }
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');e.message+=' Backup: '+backupDir;throw e;}finally{db.close();}
 return {repo,version,backupDir,added:result.added,kept:result.kept};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [repo,releaseApp,bundlePath]=process.argv.slice(2);if(!repo||!releaseApp||!bundlePath)throw Error('Usage: node update-existing-repo.mjs REPO RELEASE_APP IMPORT_BUNDLE');console.log(JSON.stringify(await updateExistingRepo({repo,releaseApp,bundlePath}),null,2));}
 catch(e){console.error('Update stopped:',e.message);process.exitCode=1;}
}
