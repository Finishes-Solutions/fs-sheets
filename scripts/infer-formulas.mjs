// Analyze local imported data, retain an audit, and apply high-agreement candidates.
// Usage: node scripts/infer-formulas.mjs [--apply] [--as-of=YYYY-MM-DD]
import {mkdir,writeFile} from 'node:fs/promises';
import {inferFormulas,applyInferredFormulas} from '../lib/formula-inference.mjs';
const args=process.argv.slice(2),asOf=args.find(a=>a.startsWith('--as-of='))?.slice(8)||'2026-11-02',base='http://127.0.0.1:4317';
const response=await fetch(base+'/api/state');if(!response.ok)throw Error('Cannot read local project');const current=await response.json(),report=inferFormulas(current.state,{asOf});
await mkdir('data/imports',{recursive:true});await writeFile('data/imports/formula-inference-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report.map(({sheetName,target,eligible,matched,canApply,overrideRowIds})=>({sheetName,target,eligible,matched,canApply,preservedRows:overrideRowIds.length})),null,2));
if(args.includes('--apply')){
 await mkdir('backups',{recursive:true});await writeFile('backups/before-inferred-formulas-'+Date.now()+'.json',JSON.stringify(current));
 const state=applyInferredFormulas(current.state,report),body=JSON.stringify({state,revision:current.revision,label:'Applied evidence-backed inferred formulas; exported exceptions retained'});
 if(Buffer.byteLength(body)>64*1024*1024)throw Error('Project exceeds save limit; no change applied');
 const saved=await fetch(base+'/api/state',{method:'POST',headers:{'Content-Type':'application/json','X-Sheets-Client':'formula-migration','X-Sheets-Tester':'Formula inference'},body});if(!saved.ok)throw Error(await saved.text());await saved.json();console.log('Applied',report.filter(x=>x.canApply).length,'inferred column formulas. Original values remain in cells for restoration.');
}
