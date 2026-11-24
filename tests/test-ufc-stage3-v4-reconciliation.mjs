import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileStage3V4} from '../scripts/ufc-reconcile-stage3-v4-certifications.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const approval=read('data/ufc-36-month-roster-approval.json');
const evidence=read('data/ufc-independent-full-career-verification.json');
const manifest=read('data/ufc-stage3-v4-consolidation-manifest-20261114.json');
const extension=read('data/ufc-extension-cohort-approval-20261124.json');
// Register entries of the frozen 783 (the extension cohort's entries are reconciled by their own audit).
const n783=Object.keys(evidence.fighters).filter(s=>approval.approvedFighters.includes(s)).length;
const fakeReport=(certs=[])=>({
 schema:1,scope:'ufc-36-month-stage3-progress',
 summary:{approvedFighters:783,independentlyVerifiedFullCareerTimelines:certs.length},
 careerVerificationDecisions:approval.approvedFighters.map(slug=>({
  slug,independentlyVerifiedFullCareer:certs.includes(slug),
  status:certs.includes(slug)?'independently_verified_full_career':'all_known_fights_complete_historical_unverified',
  knownOfficialUfcFightCount:1,
  allKnownFightsMeasured:true
 }))
});
test('two overlapping proof sources never double-count a fighter as two certificates',()=>{
 const shared=manifest.existingMainOverlapSlugs[0],migrated=manifest.importedV4OnlySlugs[0];
 const r=reconcileStage3V4(approval,fakeReport([shared,migrated]),evidence,manifest,extension);
 assert.equal(r.certified,2);
 assert.equal(r.sourceReconciliation.priorMainShared.stage3Certified,1);
 assert.equal(r.sourceReconciliation.importedV4Only.stage3Certified,1);
 assert.equal(r.proofCoverage.knownUncertifiedFromEvidence,n783-2);
 assert.equal(r.proofCoverage.withoutConsolidatedSourceEvidence,783-n783);
 assert.equal(r.sourceReconciliation.subsequentStage3Evidence.evidenceEntries,
  n783-153);
 assert.equal(r.proofCoverage.total,783);
 assert.equal(r.previousV4IsNotAdded,true);
});
test('refuses incomplete or duplicate audit rows, stale certified totals and missing source proof',()=>{
 const base=fakeReport();
 assert.throws(()=>reconcileStage3V4(approval,{...base,careerVerificationDecisions:base.careerVerificationDecisions.slice(1)},evidence,manifest,extension),/783_audit_missing/);
 const d=base.careerVerificationDecisions.slice();
 d[0]={...d[0],slug:d[1].slug};
 assert.throws(()=>reconcileStage3V4(approval,{...base,careerVerificationDecisions:d},evidence,manifest,extension),/stage3_decision_keys_invalid/);
 assert.throws(()=>reconcileStage3V4(approval,{...base,summary:{...base.summary,independentlyVerifiedFullCareerTimelines:10}},evidence,manifest,extension),/count_disagreement/);
 const fresh={...evidence,fighters:{...evidence.fighters}};
 delete fresh.fighters[manifest.importedV4OnlySlugs[0]];
 assert.throws(()=>reconcileStage3V4(approval,base,fresh,manifest,extension),/source_entry_missing_or_duplicated/);
});

test('extension-cohort register entries are allowed only when tagged and approved',()=>{
 const base=fakeReport([]);
 assert.ok(reconcileStage3V4(approval,base,evidence,manifest,extension));
 assert.throws(()=>reconcileStage3V4(approval,base,evidence,manifest),/canonical_evidence_registry_invalid/,'no extension approval');
 const slug=extension.approvedFighters[0];
 const untagged={...evidence,fighters:{...evidence.fighters,[slug]:{...evidence.fighters[slug],cohort:'other'}}};
 assert.throws(()=>reconcileStage3V4(approval,base,untagged,manifest,extension),/canonical_evidence_registry_invalid/);
 const stranger={...evidence,fighters:{...evidence.fighters,'not-approved':{cohort:extension.cohort}}};
 assert.throws(()=>reconcileStage3V4(approval,base,stranger,manifest,extension),/canonical_evidence_registry_invalid/);
});
