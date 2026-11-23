import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';

const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const source=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const rich=read('ufcalendar-rich-progress.json');
const approved=read('ufc-36-month-roster-approval.json');
const cohort=new Set(approved.approvedFighters);
const expected={
 'jamey-lyn-horth':[7,'312','2026-04-18',4,3],
 'lukasz-brzeski':[7,'2771','2025-07-19',1,6],
 'ketlen-souza':[8,'93','2026-10-10',4,4],
 'tresean-gore':[8,'584','2026-08-15',4,4],
 'abus-magomedov':[9,'200','2026-10-24',6,3],
 'junior-tafa':[9,'322','2026-06-06',3,6],
 'erin-blanchfield':[10,'394','2026-10-17',8,2],
 'manon-fiorot':[10,'153','2026-09-12',8,2],
 'ramiz-brahimaj':[10,'192','2026-08-15',5,5],
 'aiemann-zahabi':[11,'104','2026-06-14',8,3]
};
for(const [slug,[n,numeric,date,wins,losses]] of Object.entries(expected)){
 test('wave71 independently linked native UFC career: '+slug,()=>{
  assert.equal(approved.status,'approved');
  assert.equal(cohort.size,783);assert.equal(cohort.has(slug),true);
  const proof=source[slug],profile=profiles[slug],history=profile?.recentHistory?.filter(x=>x.promotion==='ufc')||[];
  assert.ok(proof&&profile,'missing independent proof or profile');
  assert.equal(proof.sourceCoverageAttested,true);
  assert.equal(proof.scope,'complete_official_ufc_career');
  assert.equal(proof.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(proof.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(proof.sourceSnapshot.fighterDetailsBlobSha,'7141332f0b319edbc10d006b229050ee947e7336');
  assert.equal(proof.sourceSnapshot.eventDetailsBlobSha,'00cee85291a014d1d65e3f638129bac0a6d50f61');
  assert.match(proof.officialFighterUrl,/^https:\/\/www\.ufc\.com\/athlete\//);
  assert.equal(proof.bouts.length,n);
  assert.equal(history.length,n,'no original native UFC fight may be silently discarded');
  assert.equal(proof.officialUfcCareerBoutCount,n);
  assert.deepEqual(proof.verifiedNumericFighterIds,[numeric]);
  assert.equal(proof.bouts[0].date,date);
  assert.equal(proof.bouts.filter(x=>x.result==='win').length,wins);
  assert.equal(proof.bouts.filter(x=>x.result==='loss').length,losses);
  assert.equal(new Set(proof.bouts.map(x=>x.fightUrl)).size,n);
  assert.equal(new Set(proof.bouts.map(x=>x.nativeBoutId)).size,n);
  for(const bout of proof.bouts){
   assert.match(bout.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   const native=rich.bouts[bout.nativeBoutId];
   assert.equal(native?.org,'ufc');
   assert.ok(native?.a?.id&&native?.b?.id,'both native fighter corners required');
   assert.ok(Number(rich.roundDone[bout.nativeBoutId])>0,'existing positive rounds required, no fabricated zeros');
   assert.equal(bout.nativeFighterId,numeric);
   assert.ok(history.some(h=>h.boutId===bout.nativeBoutId&&h.result===bout.result&&h.source==='native'));
  }
  const latest=history.map(x=>x.date).sort().at(-1);
  const gate=evaluateCareerEvidence(profile,history,latest,'2026-11-15',proof,rich.bouts,approved.rosterAsOf);
  assert.equal(gate.independentlyVerified,true,'cannot be counted without the original strict source-native pre-gate');
 });
}
test('wave71 missing, double-counted, and reversed source outcomes cannot be certified',()=>{
 const slug='aiemann-zahabi',profile=profiles[slug],history=profile.recentHistory.filter(x=>x.promotion==='ufc'),proof=source[slug];
 const check=p=>evaluateCareerEvidence(profile,history,history.map(x=>x.date).sort().at(-1),
  '2026-11-15',p,rich.bouts,approved.rosterAsOf).independentlyVerified;
 assert.equal(check(proof),true);
 const missing=structuredClone(proof);missing.bouts.splice(2,1);assert.equal(check(missing),false);
 const repeated=structuredClone(proof);repeated.bouts[0].nativeBoutId=repeated.bouts[1].nativeBoutId;assert.equal(check(repeated),false);
 const wrongResult=structuredClone(proof);wrongResult.bouts[0].result=wrongResult.bouts[0].result==='win'?'loss':'win';assert.equal(check(wrongResult),false);
 const unverifiedId=structuredClone(proof);unverifiedId.verifiedNumericFighterIds=['999999'];assert.equal(check(unverifiedId),false);
});
