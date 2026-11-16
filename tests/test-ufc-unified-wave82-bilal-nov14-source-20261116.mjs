import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
// Research only; count certificate only after full strict 783-person exact-head CI.
const read=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url),'utf8'));
const proof=read('ufc-independent-full-career-verification.json').fighters['bilal-hasan'];
const profile=read('ufcalendar-fighter-research.json').profiles['bilal-hasan'];
const rich=read('ufcalendar-rich-progress.json');
const approval=read('ufc-36-month-roster-approval.json');
const history=profile.recentHistory.filter(h=>h.promotion==='ufc'&&h.source==='native'&&rich.bouts[h.boutId]?.org==='ufc'&&
 !/contender series|road to ufc/i.test(rich.bouts[h.boutId]?.event||''));
const gate=p=>evaluateCareerEvidence(profile,history,'2026-11-14','2026-11-16',p,rich.bouts,approval.rosterAsOf).independentlyVerified;
test('wave82 frozen 783 and updated Greco snapshot for Bilal full two-bout career',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.ok(approval.approvedFighters.includes('bilal-hasan'));
 assert.deepEqual(proof.verifiedNumericFighterIds,['52597']);
 assert.equal(proof.scope,'complete_official_ufc_career');
 assert.equal(proof.sourceCoverageAttested,true);
 assert.equal(proof.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
 assert.equal(proof.sourceSnapshot.sourceCommit,'96adace863c0a793579cc06d27d468797545607f');
 assert.equal(proof.sourceSnapshot.fightResultsBlobSha,'80258ab3d9f413cad9be13fde64beb66dd0bcfa6');
 assert.equal(proof.sourceSnapshot.eventDetailsBlobSha,'24238cb71d7bec6522a77f285b530274b3c897b9');
 assert.equal(proof.sourceSnapshot.fighterDetailsBlobSha,'7141332f0b319edbc10d006b229050ee947e7336');
});
test('wave82 pinned source/native August win and November UFC 334 loss, no DWCS',()=>{
 assert.equal(history.length,2);
 assert.equal(proof.officialUfcCareerBoutCount,2);
 assert.equal(proof.bouts.length,2);
 assert.deepEqual(proof.bouts.map(x=>x.nativeBoutId).sort(),['83729','93106']);
 assert.equal(new Set(proof.bouts.map(x=>x.fightUrl)).size,2);
 assert.deepEqual(proof.bouts.map(x=>x.result).sort(),['loss','win']);
 assert.equal(proof.sourceCoverage.excludedFeederNativeFights.length,1);
 assert.equal(proof.sourceCoverage.excludedFeederNativeFights[0].nativeBoutId,'83743');
 assert.ok(!proof.bouts.some(x=>x.nativeBoutId==='83743'));
 const newer=proof.bouts.find(x=>x.nativeBoutId==='93106');
 assert.equal(newer.fightUrl,'https://ufcstats.com/fight-details/fdefe4d1a8ef2997');
 assert.equal(newer.pinnedSourceEventDate,'2026-11-14');
 assert.equal(newer.independentEventUrl,'https://ufcstats.com/event-details/402ea3b5ee233852');
 for(const row of proof.bouts){
  assert.match(row.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
  const b=rich.bouts[row.nativeBoutId];
  assert.equal(b?.org,'ufc');
  assert.ok(b.a?.id&&b.b?.id);
  assert.ok([b.a.id,b.b.id].includes('52597'));
  assert.ok([b.a.id,b.b.id].includes(row.originalOpponentNumericId));
  assert.ok(Number(rich.roundDone[row.nativeBoutId])>0);
  assert.equal(history.filter(x=>x.boutId===row.nativeBoutId&&x.result===row.result).length,1);
 }
 assert.equal(gate(proof),true);
});
test('wave82 omitted, duplicate, inverted and invented source identity all fail closed',()=>{
 assert.equal(gate(proof),true);
 const miss=structuredClone(proof);miss.bouts.pop();assert.equal(gate(miss),false);
 const dup=structuredClone(proof);dup.bouts[1].nativeBoutId=dup.bouts[0].nativeBoutId;assert.equal(gate(dup),false);
 const flip=structuredClone(proof);flip.bouts[1].result='win';assert.equal(gate(flip),false);
 const fake=structuredClone(proof);fake.verifiedNumericFighterIds=['999999'];assert.equal(gate(fake),false);
});
