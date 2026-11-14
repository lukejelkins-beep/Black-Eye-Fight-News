#!/usr/bin/env node
/**
 * Read-only BEFN UFC V4 R1 branch boundary check.
 * Does not independently certify fighters and does not authorize publication.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
export const releaseOnePaths=new Set([
 '.github/workflows/verify-ufc-v4-r1.yml',
 'docs/ufc-v4-staged-release-control.md',
 'scripts/verify-ufc-v4-r1-boundary.mjs',
 'tests/test-ufc-v4-r1-boundary.mjs'
]);

export function auditR1Boundary({changedFiles=[],approval,registry,permitted=releaseOnePaths}){
 const errors=[];
 if(!Array.isArray(changedFiles)||changedFiles.some(x=>typeof x!=='string'))
   errors.push('Changed-file manifest is invalid');
 const changed=Array.isArray(changedFiles)?changedFiles:[];
 for(const f of changed)if(typeof f==='string'&&!permitted.has(f))
   errors.push('R1 changes disallowed path: '+f);
 const approved=approval?.approvedFighters;
 if(approval?.status!=='approved'||approval?.rosterAsOf!=='2026-11-14'||
    !Array.isArray(approved)||approved.length!==783||
    new Set(approved).size!==783||
    approved.some(x=>typeof x!=='string'||!x))
   errors.push('Approved immutable 783-fighter roster mismatch or duplicates');
 const allow=new Set(Array.isArray(approved)?approved:[]);
 const fighters=registry?.fighters;
 if(registry?.scope!=='ufc-independent-full-career-verification'||
    registry?.rosterAsOf!=='2026-11-14'||!fighters||
    Array.isArray(fighters)||typeof fighters!=='object')
   errors.push('Missing or invalid canonical independent certification registry');
 const sourceEntries=fighters&&typeof fighters==='object'&&!Array.isArray(fighters)?
   Object.entries(fighters):[];
 const offRoster=sourceEntries.map(([slug])=>slug).filter(slug=>!allow.has(slug));
 if(offRoster.length)errors.push('Source registry contains off-cohort fighters: '+offRoster.join(', '));
 const attested=sourceEntries.filter(([,v])=>v?.sourceCoverageAttested===true).length;
 const pending=sourceEntries.filter(([,v])=>
   String(v?.certificationStatus||'').includes('pending_offline_ci')).length;
 const marked=sourceEntries.filter(([,v])=>
   v?.certificationStatus==='independently_verified_full_career').length;
 return {ok:errors.length===0,errors,approvedCount:allow.size,
  sourceRegistryEntries:sourceEntries.length,sourceAttestedEntries:attested,
  statusMarkedVerified:marked,pendingIndependentCi:pending,
  note:'Registry status/attestation counts are NOT authoritative certificates; use latest COMPLETED strict Stage 3 audit for certified and queue totals.'};
}

export function changedAgainstMergeBase(base,head){
 if(!/^[0-9a-f]{40}$/.test(base)||!/^[0-9a-f]{40}$/.test(head))
   throw Error('Release audit requires exact base and head commit SHAs');
 const git=(args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:20000}).trim();
 const ancestor=git(['merge-base',base,head]);
 const diff=git(['diff','--name-only','--diff-filter=ACMR',ancestor,head]);
 return diff?diff.split(String.fromCharCode(10)).map(s=>s.trim()).filter(Boolean):[];
}

export function main(base,head){
 if(!base||!head)throw Error('Expected GitHub PR base SHA and head SHA');
 const changedFiles=changedAgainstMergeBase(base,head);
 const report=auditR1Boundary({changedFiles,
  approval:read('data/ufc-36-month-roster-approval.json'),
  registry:read('data/ufc-independent-full-career-verification.json')});
 console.log('BEFN_UFC_V4_R1_RELEASE_BOUNDARY '+JSON.stringify({changedFiles,...report}));
 if(!report.ok)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main(process.argv[2],process.argv[3]);}catch(error){
  console.error('BEFN_UFC_V4_R1_RELEASE_BOUNDARY_ERROR: '+error.message);
  process.exitCode=1;
 }
}
