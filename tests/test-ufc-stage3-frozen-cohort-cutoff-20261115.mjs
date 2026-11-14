import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditApprovedStage3,evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
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
const audit=asOf=>auditApprovedStage3(approval,{...census,asOf},cache,research,archive,feeder,finale,legacy,independentlyVerified,inventory);
test('Stage3 preserves strict certified careers across midnight without fabricating an evidence refresh',()=>{
 assert.equal(approval.rosterAsOf,'2026-11-14');assert.equal(approval.approvedFighters.length,783);
 const atApproved=audit('2026-11-14').summary;
 const next=audit('2026-11-15');
 const afterMidnight=next.summary;
 console.log('BEFN_CERT_AUDIT_ROLLOVER_DIAGNOSTIC='+JSON.stringify({atApproved:atApproved.independentlyVerifiedFullCareerTimelines,afterMidnight:afterMidnight.independentlyVerifiedFullCareerTimelines,canonical:Object.keys(independentlyVerified.fighters).length,fighters:next.careerVerificationDecisions.filter(x=>['shannon-ross','sean-sharaf'].includes(x.slug)),otherUncertifiedAmongCanonical:next.careerVerificationDecisions.filter(x=>independentlyVerified.fighters[x.slug]&&!x.independentlyVerifiedFullCareer).map(x=>({slug:x.slug,status:x.status,measured:x.allKnownFightsMeasured,known:x.knownOfficialUfcFightCount})).slice(0,15)}));
 assert.equal(afterMidnight.asOf,'2026-11-15');
 assert.equal(afterMidnight.approvedSnapshotAsOf,'2026-11-14');
 assert.equal(afterMidnight.certificationEvidenceCutoff,'2026-11-14');
 for(const slug of ['saygid-izagakhmaev','shem-rock','shannon-ross','sean-sharaf']){
  const prof=research.profiles[slug],historic=prof.recentHistory.filter(x=>x.promotion==='ufc');
  const entry=independentlyVerified.fighters[slug],date=census.fighters.find(x=>x.slug===slug)?.lastUfcFight;
  const trial=evaluateCareerEvidence(prof,historic,date,approval.rosterAsOf,entry,cache.bouts);
  const all=historic.map(b=>({id:b.boutId,date:b.date,opponent:b.opponent,result:b.result,src:b.source}));
  console.log('BEFN_CERT_DIRECT_EVIDENCE_DIAGNOSTIC='+JSON.stringify({slug,trial,all,proofBouts:entry?.bouts}));
 }
 assert.equal(afterMidnight.independentlyVerifiedFullCareerTimelines,atApproved.independentlyVerifiedFullCareerTimelines);
 const canonical=Object.keys(independentlyVerified.fighters);
 const explicitlyUncertified=next.careerVerificationDecisions.filter(x=>canonical.includes(x.slug)&&!x.independentlyVerifiedFullCareer);
 // A source proof in the register is not itself a Stage3 certificate. Previously
 // flagged provider/native discrepancies must stay blocked until their own gate passes.
 assert.equal(afterMidnight.independentlyVerifiedFullCareerTimelines+explicitlyUncertified.length,canonical.length);
 for(const slug of ['shannon-ross','sean-sharaf']){
  assert.equal(next.careerVerificationDecisions.find(x=>x.slug===slug)?.independentlyVerifiedFullCareer,true);
 }
 assert.equal(afterMidnight.independentlyVerifiedFullCareerTimelines+afterMidnight.approvedCareersWithoutIndependentFullCareerCertification,783);
 assert.ok(Object.values(independentlyVerified.fighters).some(p=>p.verifiedAt==='2026-11-14'),'original completed proof timestamps must not be rewritten');
});
