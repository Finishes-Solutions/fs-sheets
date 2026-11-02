// Local proof records keep every version and review; identities are tester labels.
export function proofStatus(proof,version=proof.versions.at(-1)) {
 if(!version)return 'Draft';
 const latest=new Map(version.decisions.map(d=>[d.by.trim().toLowerCase(),d.decision]));
 const reviewers=proof.reviewers.length?proof.reviewers.map(n=>n.toLowerCase()):[...latest.keys()];
 if(reviewers.some(n=>latest.get(n)==='Changes requested'))return 'Changes requested';
 if(reviewers.length&&reviewers.every(n=>latest.get(n)==='Approved'))return 'Approved';
 return 'In review';
}
export function validateProofs(proofs=[]) {
 if(!Array.isArray(proofs)||proofs.length>100)throw Error('Invalid row proofs');
 const ids=new Set();const id=value=>{if(typeof value!=='string'||!value||ids.has(value))throw Error('Invalid proof identity');ids.add(value);};
 const stamp=o=>{id(o.id);if(typeof o.by!=='string'||!o.by.trim()||typeof o.at!=='string'||!Number.isFinite(Date.parse(o.at)))throw Error('Invalid review author or date');};
 for(const p of proofs){
  id(p.id);if(typeof p.name!=='string'||!p.name.trim()||!Array.isArray(p.reviewers)||p.reviewers.some(n=>typeof n!=='string'||!n.trim())||new Set(p.reviewers.map(n=>n.toLowerCase())).size!==p.reviewers.length||!Array.isArray(p.versions)||!p.versions.length)throw Error('Invalid proof');
  for(const v of p.versions){stamp(v);if(!v.file||typeof v.file.name!=='string'||!v.file.name||typeof v.file.type!=='string'||typeof v.file.data!=='string'||!/^data:[^,]*;base64,/.test(v.file.data)||v.file.data.length>2900000||!Array.isArray(v.comments)||!Array.isArray(v.decisions))throw Error('Invalid proof version');
   for(const c of v.comments){stamp(c);if(typeof c.text!=='string'||!c.text.trim())throw Error('Invalid proof comment');}
   for(const d of v.decisions){stamp(d);if(!['Approved','Changes requested'].includes(d.decision)||typeof d.text!=='string'||(d.decision==='Changes requested'&&!d.text.trim())||(p.reviewers.length&&!p.reviewers.some(n=>n.toLowerCase()===d.by.trim().toLowerCase())))throw Error('Invalid review decision');}
  }
 }
}
