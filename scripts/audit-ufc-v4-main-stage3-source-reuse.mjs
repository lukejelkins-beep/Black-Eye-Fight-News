#!/usr/bin/env node
/** Offline independent Stage3-to-V4 proof revalidation, no provider calls.
 * NEVER grants certification in a catch/error case; records precise blocker.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {certifyAttestedFullCareers} from './certify-ufc-v4-independent-full-careers.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const approval=read('data/ufc-36-month-roster-approval.json');
const research=read('data/ufcalendar-fighter-research.json');
const progress=read('data/ufcalendar-rich-progress.json');
const postfight=read('data/ufc-postfight-metrics.json');
const base=read('data/ufc-independent-full-career-verification.json');
const feeder=read('data/ufc-feeder-bout-evidence.json');
const batch=read('data/ufc-v4-import-stage3-source-proof-candidates-20261114.json');
const cases=[];
for(const [slug,entry] of Object.entries(batch.fighters||{})){
 try{
  const v=certifyAttestedFullCareers(approval,research,progress,postfight,base,{
   ...batch,fighters:{[slug]:entry}
  },feeder);
  if(v.report.certifiedCount!==1||v.report.certifiedFighters[0].slug!==slug)
   throw Error('nonunique certified fighter');
  cases.push({slug,status:'strict_v4_native_and_metrics_pass',
   sourceBouts:entry.bouts.length,verifiedNativeId:v.report.certifiedFighters[0].nativeFighterId,
   result:v.report.certifiedFighters[0],independentlyCertifiedByThisImport:false});
 }catch(err){
  cases.push({slug,status:'strict_v4_reconciliation_blocked',
   sourceBouts:entry.bouts.length,reason:String(err?.message||err),
   independentlyCertifiedByThisImport:false});
 }
}
const output={schema:1,scope:'ufc-v4-main-stage3-to-v4-source-reuse-audit',
 rosterAsOf:approval.rosterAsOf,passed:cases.filter(x=>x.status.endsWith('_pass')).length,
 blocked:cases.filter(x=>x.status.endsWith('_blocked')).length,
 certifiedByThisImport:0,cases,sourceReference:batch.sourceOrigin,
 note:'Strict V4 native-ID, outcome, measured statistics and competition checks on existing main Stage3 official source evidence; only promotes when separately added to V4 live certification batch and full foundation CI passes.'};
const dest=path.join(root,'qa/ufc-v4-import-stage3-source-proof-audit.json');
fs.mkdirSync(path.dirname(dest),{recursive:true});
fs.writeFileSync(dest,JSON.stringify(output,null,2)+'\n');
console.log('BEFN_V4_STAGE3_REUSE '+JSON.stringify({passed:output.passed,blocked:output.blocked,
 cases:cases.map(x=>({slug:x.slug,status:x.status,reason:x.reason,n:x.sourceBouts}))}));
