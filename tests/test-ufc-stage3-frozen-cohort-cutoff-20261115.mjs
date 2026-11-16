import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditApprovedStage3} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p, import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json');
const census=read('ufc-36-month-candidates.json');
const cache=read('ufcalendar-rich-progress.json');
const research=read('ufcalendar-fighter-research.json');
const archive=read('ufc-research-archive.json');
const feeder=read('ufc-feeder-bout-evidence.json');
const finale=read('ufc-official-finale-recovery.json');
const legacy=read('ufc-official-legacy-evidence.json');
const independentlyVerified=read('ufc-independent-full-career-verification.json');
const inventory=read('ufc-official-career-bout-inventory.json');
const frozen=read('ufc-approved-cohort-frozen-census-20261114.json');
const audit=asOf=>auditApprovedStage3(approval,{...census,asOf},cache,research,archive,feeder,finale,legacy,independentlyVerified,inventory,frozen);
test('Stage3 preserves strict certified careers across midnight without fabricating an evidence refresh',()=>{
 assert.equal(approval.rosterAsOf,'2026-11-14');assert.equal(approval.approvedFighters.length,783);
 const atApproved=audit('2026-11-14').summary;
 const next=audit('2026-11-15');
 const afterMidnight=next.summary;
 assert.equal(afterMidnight.asOf,'2026-11-15');
 assert.equal(afterMidnight.approvedSnapshotAsOf,'2026-11-14');
 assert.equal(afterMidnight.certificationEvidenceCutoff,'2026-11-14');
 assert.equal(afterMidnight.independentlyVerifiedFullCareerTimelines,atApproved.independentlyVerifiedFullCareerTimelines);
 assert.equal(afterMidnight.liveCensusFighterRows,census.fighters.length);
 const liveSlugs=new Set(census.fighters.map(f=>f.slug));
 assert.equal(afterMidnight.frozenApprovedCohortAnchorFallbacks,
  approval.approvedFighters.filter(slug=>!liveSlugs.has(slug)).length);
 const evidenceEntries=Object.keys(independentlyVerified.fighters).length;
 const pending=next.careerVerificationDecisions.filter(d=>
  independentlyVerified.fighters[d.slug]&&!d.independentlyVerifiedFullCareer);
 assert.equal(afterMidnight.independentlyVerifiedFullCareerTimelines+pending.length,evidenceEntries);
 for(const decision of pending){
  const proof=independentlyVerified.fighters[decision.slug];
  const latestProvenBout=proof.bouts.map(b=>b.date).sort().at(-1);
  assert.ok(decision.newestSavedUfcFight>latestProvenBout,
   `${decision.slug} must remain uncertified when a newer saved UFC bout lacks independent proof`);
 }
 for(const slug of ['shannon-ross','sean-sharaf']){
  assert.equal(next.careerVerificationDecisions.find(x=>x.slug===slug)?.independentlyVerifiedFullCareer,true);
 }
 assert.equal(afterMidnight.independentlyVerifiedFullCareerTimelines+afterMidnight.approvedCareersWithoutIndependentFullCareerCertification,783);
 assert.ok(Object.values(independentlyVerified.fighters).some(p=>p.verifiedAt==='2026-11-14'),'original completed proof timestamps must not be rewritten');
});

test('fresh independent UFC 334 evidence restores seven careers while Heili remains held',()=>{
 const decisions=new Map(audit(census.asOf).careerVerificationDecisions.map(d=>[d.slug,d]));
 const refreshed=['bia-mesquita','cesar-almeida','chris-duncan','donte-johnson',
  'evan-elder','juan-diaz','melquizael-costa'];
 for(const slug of refreshed){
  const proof=independentlyVerified.fighters[slug];
  const decision=decisions.get(slug);
  assert.equal(proof.sourceSnapshot.sourceCommit,'96adace863c0a793579cc06d27d468797545607f',slug);
  assert.equal(proof.bouts.filter(b=>b.date==='2026-11-14').length,1,slug);
  assert.equal(decision.newestSavedUfcFight,'2026-11-14',slug);
  assert.equal(decision.independentlyVerifiedFullCareer,true,slug);
 }
 const still=independentlyVerified.fighters['heili-alateng'];
 const latest=still.bouts.map(b=>b.date).sort().at(-1);
 assert.ok(decisions.get('heili-alateng').newestSavedUfcFight>latest);
 assert.equal(decisions.get('heili-alateng').independentlyVerifiedFullCareer,false);
});
