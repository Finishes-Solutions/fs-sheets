import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {mergeImportedSheets,prepareLocalUpdate} from '../scripts/prepare-local-update.mjs';
const original={workspaces:[{id:'local',name:'Local work'}],sheets:[{id:'local-sheet',workspaceId:'local',name:'My edits',rows:[{cells:{title:'Keep this'}}]}],activity:[]};
const bundle={workspace:{id:'imports',name:'Imported Smartsheet exports'},sheets:[{id:'incoming',name:'Imported schedule',workspaceId:'imports',source:{sha256:'123'},columns:[{id:'c',formula:'=1+2'}],rows:[{id:'r',cells:{c:3},importStyleIds:[1],comments:[{text:'Keep comment'}]}]}]};
test('additive transfer preserves local edits, formulas and styles and is idempotent',()=>{const result=mergeImportedSheets(original,bundle);assert.deepEqual(result.state.sheets[0],original.sheets[0]);assert.deepEqual(result.state.sheets[1],{...bundle.sheets[0],folderId:null});assert.equal(result.added.length,1);assert.equal(original.sheets.length,1);assert.equal(mergeImportedSheets(result.state,bundle).added.length,0);});
test('existing names and source hashes are preserved instead of overwritten',()=>{const local=structuredClone(original);local.sheets[0].name='Imported schedule';const sameName=mergeImportedSheets(local,bundle);assert.equal(sameName.added.length,0);assert.equal(sameName.kept.length,1);local.sheets[0].name='Renamed';local.sheets[0].source={sha256:'123'};assert.equal(mergeImportedSheets(local,bundle).added.length,0);});
test('installer copies SQLite WAL data, keeps the original untouched, and saves a pre-import backup',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'sheets-local-update-'));let source;
 try{
  const sourceApp=path.join(dir,'Existing app with spaces'),releaseApp=path.join(dir,'Release'),targetApp=path.join(dir,'Updated app'),bundlePath=path.join(dir,'bundle.json');
  await mkdir(path.join(sourceApp,'data'),{recursive:true});await mkdir(releaseApp);await writeFile(path.join(sourceApp,'user-file.txt'),'Do not overwrite');await writeFile(path.join(releaseApp,'package.json'),JSON.stringify({version:'0.6.0'}));await writeFile(bundlePath,JSON.stringify(bundle));
  source=new DatabaseSync(path.join(sourceApp,'data','fs-sheet.sqlite'));source.exec('PRAGMA journal_mode=WAL; CREATE TABLE state (id INTEGER PRIMARY KEY,revision INTEGER,body TEXT)');source.prepare('INSERT INTO state VALUES (1,7,?)').run(JSON.stringify(original));
  const result=await prepareLocalUpdate({sourceApp,releaseApp,targetApp,bundlePath});assert.equal(result.added.length,1);assert.deepEqual(JSON.parse(source.prepare('SELECT body FROM state').get().body),original);assert.equal(await readFile(path.join(sourceApp,'user-file.txt'),'utf8'),'Do not overwrite');
  const updated=new DatabaseSync(path.join(targetApp,'data','fs-sheet.sqlite'));assert.equal(updated.prepare('SELECT revision FROM state').get().revision,8);assert.equal(JSON.parse(updated.prepare('SELECT body FROM state').get().body).sheets.length,2);assert.equal(updated.prepare('SELECT client_id FROM history').get().client_id,'local-update');updated.close();
  const backup=new DatabaseSync(path.join(targetApp,'backups','before-local-update.sqlite'));assert.deepEqual(JSON.parse(backup.prepare('SELECT body FROM state').get().body),original);backup.close();
  await assert.rejects(prepareLocalUpdate({sourceApp,releaseApp,targetApp,bundlePath}),/already exists/);
  await assert.rejects(prepareLocalUpdate({sourceApp,releaseApp,targetApp:sourceApp,bundlePath}),/separate/);
 }finally{source?.close();await rm(dir,{recursive:true,force:true});}
});

test('in-place update backs up replaced code and SQLite, preserves Git and unrelated files, and retains existing rows',async()=>{
 const {updateExistingRepo}=await import('../scripts/update-existing-repo.mjs');const dir=await mkdtemp(path.join(os.tmpdir(),'sheets-in-place-'));
 try{
  const repo=path.join(dir,'Mac repo with spaces'),releaseApp=path.join(dir,'Release'),bundlePath=path.join(dir,'bundle.json');
  for(const name of ['data','lib','.git'])await mkdir(path.join(repo,name),{recursive:true});await mkdir(path.join(releaseApp,'lib'),{recursive:true});
  await writeFile(path.join(repo,'package.json'),'{"version":"old"}');await writeFile(path.join(repo,'server.mjs'),'old server');await writeFile(path.join(repo,'lib/updated.mjs'),'local code changes');await writeFile(path.join(repo,'lib/keep.txt'),'unrelated');await writeFile(path.join(repo,'.git/HEAD'),'ref: refs/heads/main');
  await writeFile(path.join(releaseApp,'package.json'),'{"version":"0.6.1"}');await writeFile(path.join(releaseApp,'server.mjs'),'new server');await writeFile(path.join(releaseApp,'lib/updated.mjs'),'new code');await writeFile(bundlePath,JSON.stringify(bundle));
  const db=new DatabaseSync(path.join(repo,'data/fs-sheet.sqlite'));db.exec('CREATE TABLE state (id INTEGER PRIMARY KEY,revision INTEGER,body TEXT)');db.prepare('INSERT INTO state VALUES (1,3,?)').run(JSON.stringify(original));db.close();
  const result=await updateExistingRepo({repo,releaseApp,bundlePath});assert.equal(await readFile(path.join(repo,'server.mjs'),'utf8'),'new server');assert.equal(await readFile(path.join(result.backupDir,'files/server.mjs'),'utf8'),'old server');assert.equal(await readFile(path.join(result.backupDir,'files/lib/updated.mjs'),'utf8'),'local code changes');assert.equal(await readFile(path.join(repo,'lib/keep.txt'),'utf8'),'unrelated');assert.equal(await readFile(path.join(repo,'.git/HEAD'),'utf8'),'ref: refs/heads/main');
  const current=new DatabaseSync(path.join(repo,'data/fs-sheet.sqlite'));let state=JSON.parse(current.prepare('SELECT body FROM state').get().body);assert.deepEqual(state.sheets[0],original.sheets[0]);assert.equal(state.sheets.length,2);current.close();
  const backup=new DatabaseSync(path.join(result.backupDir,'fs-sheet.sqlite'));assert.deepEqual(JSON.parse(backup.prepare('SELECT body FROM state').get().body),original);backup.close();
  const rerun=await updateExistingRepo({repo,releaseApp,bundlePath});assert.equal(rerun.added.length,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
