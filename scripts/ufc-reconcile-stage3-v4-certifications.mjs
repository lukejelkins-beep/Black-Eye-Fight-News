#!/usr/bin/env node
/** Offline, read-only comparison of frozen V4-proof migration against Stage3 strict gate.
 * No certification is granted by this script. Stage3 per-fighter decisions remain authoritative.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const invariant=(test,message)=>{if(!test)throw Error('BEFN_UNIFIED_CERTIFICATION_RECONCILIATION_BLOCKED: '+message);};

export function reconcileStage3V4(approval,stage3,evidence,manifest){
 invariant(approval?.status==='approved'&&Array.isArray(approval.approvedFighters)&&
  approval.approvedFighters.length===783&&new Set(approval.approvedFighters).size===783,
  'immutable_783_roster_missing');
 const approved=new Set(approval.approvedFighters);
 const rows=stage3?.careerVerificationDecisions;
 invariant(stage3?.schema===1&&stage3?.scope==='ufc-36-month-stage3-progress'&&
  stage3?.summary?.approvedFighters===783&&Array.isArray(rows)&&rows.length===783,
  'completed_stage3_783_audit_missing');
 const bySlug=new Map(rows.map(x=>[x.slug,x]));
 invariant(bySlug.size===783&&[...bySlug.keys()].every(slug=>approved.has(slug)),
  'stage3_decision_keys_invalid');
 invariant(evidence?.schema===1&&evidence?.scope==='ufc-independent-full-career-verification'&&
  evidence.rosterAsOf===approval.rosterAsOf&&
  Object.keys(evidence.fighters||{}).every(slug=>approved.has(slug)),
  'canonical_evidence_registry_invalid');
 invariant(manifest?.scope==='ufc-stage3-v4-evidence-consolidation'&&
  manifest.rosterAsOf===approval.rosterAsOf,'migration_manifest_missing');
 const original=Object.keys(manifest.originalMainFighterFingerprintsFnv32||{});
 const imported=manifest.importedV4OnlySlugs||[];
 const overlap=manifest.existingMainOverlapSlugs||[];
 const originalOnly=manifest.existingMainOnlySlugs||[];
 invariant(original.length===66&&imported.length===87&&overlap.length===60&&originalOnly.length===6,
  'original_source_overlap_checkpoint_mismatch');
 const originalSet=new Set(original),importSet=new Set(imported);
 invariant(importSet.size===87&&originalSet.size===66&&
  [...importSet].every(slug=>!originalSet.has(slug))&&
  [...originalSet,...importSet].every(slug=>Boolean(evidence.fighters[slug])),
  'source_entry_missing_or_duplicated');
 const group=(slugs)=>{
   const certified=[],blocked=[];
   for(const slug of slugs){
    const d=bySlug.get(slug);
    if(d.independentlyVerifiedFullCareer===true)certified.push(slug);
    else blocked.push({slug,status:d.status,
      knownOfficialUfcFightCount:d.knownOfficialUfcFightCount??null,
      allKnownFightsMeasured:d.allKnownFightsMeasured??null,
      providerHistoryDiscrepancy:d.providerHistoryDiscrepancy??null,
      reason:'source_proof_did_not_pass_strict_stage3_gate'});
   }
   return {evidenceEntries:slugs.length,stage3Certified:certified.length,
     stage3Blocked:blocked.length,certified,blocked};
 };
 const groups={
  priorMainShared:group(overlap),
  priorMainOnly:group(originalOnly),
  importedV4Only:group(imported)
 };
 const allCertified=rows.filter(x=>x.independentlyVerifiedFullCareer===true).length;
 invariant(allCertified===stage3.summary.independentlyVerifiedFullCareerTimelines,
   'audited_certified_count_disagreement');
 const sourceGroupCertified=groups.priorMainShared.stage3Certified+
  groups.priorMainOnly.stage3Certified+groups.importedV4Only.stage3Certified;
 const unionSize=originalSet.size+importSet.size;
 invariant(unionSize===153&&
   sourceGroupCertified===allCertified,
   'unaccounted_certification_outside_reconciled_source_records');
 const triage={
  certified:allCertified,
  knownUncertifiedFromEvidence:153-allCertified,
  withoutConsolidatedSourceEvidence:783-153,
  total:783
 };
 invariant(triage.certified+triage.knownUncertifiedFromEvidence+
  triage.withoutConsolidatedSourceEvidence===783,'queue_not_conserved');
 return {
  schema:1,scope:'ufc-stage3-v4-strict-certification-reconciliation',
  rosterAsOf:approval.rosterAsOf,
  source:'latest_completed_strict_stage3_audit',
  certified:allCertified,
  unverified:783-allCertified,
  previousV4CertifiedOnSeparateSnapshot:manifest.priorV4StrictPass.certifiedOnThenCurrentV4,
  previousV4IsNotAdded:true,
  totalEvidenceEntries:Object.keys(evidence.fighters).length,
  sourceReconciliation:groups,
  proofCoverage:triage,
  note:'V4 previously certified records are not automatically main Stage3 certificates. Review per-fighter blocked records, preserve all source references and explicit gate failures. This never changes live or cached data.'
 };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=reconcileStage3V4(
  read('data/ufc-36-month-roster-approval.json'),
  read('qa/ufc-36-month-stage3-progress.json'),
  read('data/ufc-independent-full-career-verification.json'),
  read('data/ufc-stage3-v4-consolidation-manifest-20261114.json'));
 const qa=path.join(root,'qa');fs.mkdirSync(qa,{recursive:true});
 fs.writeFileSync(path.join(qa,'ufc-stage3-v4-reconciliation.json'),JSON.stringify(result,null,2)+'\n');
 console.log('BEFN_STAGE3_V4_RECONCILIATION='+JSON.stringify({
  certified:result.certified,
  remaining:result.unverified,
  previouslyV4Certified:result.previousV4CertifiedOnSeparateSnapshot,
  shared:result.sourceReconciliation.priorMainShared,
  mainOnly:result.sourceReconciliation.priorMainOnly,
  imported:result.sourceReconciliation.importedV4Only,
  proofCoverage:result.proofCoverage
 }));
}
