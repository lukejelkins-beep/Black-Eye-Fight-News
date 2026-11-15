import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';

const read=path=>JSON.parse(readFileSync(new URL('../data/'+path,import.meta.url),'utf8'));
const registry=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const rich=read('ufcalendar-rich-progress.json');
const approval=read('ufc-36-month-roster-approval.json');
const cohort=new Set(approval.approvedFighters);
const cases={
 'rongzhu': {n:7,own:'280',stats:'a13d755965a4ec9f',latest:'2026-09-12',w:4,l:3,roadToUfcExcluded:true},
 'ian-machado-garry': {n:12,own:'387',stats:'442c9011034ae1fd',latest:'2026-08-15',w:10,l:2},
 'joel-alvarez': {n:12,stats:'58bbef3770bb2dfc',latest:'2026-08-15',w:8,l:4},
 'anthony-hernandez': {n:13,stats:'093e1f5bb73850be',latest:'2026-08-22',w:9,l:4},
 'arman-tsarukyan': {n:13,stats:'eae48ff31db420c2',latest:'2026-09-19',w:11,l:2},
 'bryce-mitchell': {n:13,stats:'d9c6f19f958643e9',latest:'2026-06-06',w:10,l:3}
};

for(const [slug,expect] of Object.entries(cases)){
 test('source-attested complete UFC career with original paired numeric native identities: '+slug,()=>{
  assert.equal(cohort.has(slug),true,'must preserve approved 783-person roster');
  assert.equal(cohort.size,783);
  const source=registry[slug],profile=profiles[slug],history=profile.recentHistory.filter(h=>h.promotion==='ufc');
  assert.ok(source&&profile);
  assert.equal(source.scope,'complete_official_ufc_career');
  assert.equal(source.sourceCoverageAttested,true);
  assert.equal(source.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.match(source.fighterUrl,new RegExp('/'+expect.stats+'$'));
  assert.match(source.officialFighterUrl,/^https:\/\/www\.ufc\.com\/athlete\//);
  assert.equal(source.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(source.sourceSnapshot.fighterDetailsBlobSha,'7141332f0b319edbc10d006b229050ee947e7336');
  assert.equal(source.sourceSnapshot.eventDetailsBlobSha,'00cee85291a014d1d65e3f638129bac0a6d50f61');
  assert.equal(source.bouts.length,expect.n);
  assert.equal(history.length,expect.n,'unattested native UFC histories cannot be dropped');
  assert.equal(source.officialUfcCareerBoutCount,expect.n);
  assert.equal(source.bouts.filter(x=>x.result==='win').length,expect.w);
  assert.equal(source.bouts.filter(x=>x.result==='loss').length,expect.l);
  assert.equal(source.bouts[0].date,expect.latest);
  assert.equal(new Set(source.bouts.map(x=>x.nativeBoutId)).size,expect.n);
  assert.equal(new Set(source.bouts.map(x=>x.fightUrl)).size,expect.n);
  assert.equal(new Set(source.bouts.map(x=>x.nativeFighterId)).size,1);
  if(expect.own)assert.deepEqual(source.verifiedNumericFighterIds,[expect.own]);
  for(const row of source.bouts){
   const native=rich.bouts[row.nativeBoutId];
   assert.equal(native?.org,'ufc');
   assert.ok(native?.a?.id&&native?.b?.id,'native fighters must have both numeric corner IDs');
   assert.ok(Number(rich.roundDone[row.nativeBoutId])>0,'no missing or invented round samples');
   assert.ok(history.some(h=>h.boutId===row.nativeBoutId&&h.source==='native'&&h.result===row.result));
  }
  if(expect.roadToUfcExcluded){
   assert.ok(source.sourceScopeVerified.includes('Road to UFC'));
   assert.ok(source.bouts.every(x=>!String(rich.bouts[x.nativeBoutId].event).toLowerCase().includes('road to ufc')));
  }
  const latest=history.map(x=>x.date).sort().at(-1);
  const decision=evaluateCareerEvidence(profile,history,latest,'2026-11-15',source,rich.bouts,approval.rosterAsOf);
  assert.equal(decision.independentlyVerified,true,'new evidence must pass strict source-native pre-gate before full-cohort CI');
 });
}

test('wave70 fail-closed source identity regressions',()=>{
 const slug='ian-machado-garry',source=registry[slug],profile=profiles[slug];
 const history=profile.recentHistory.filter(h=>h.promotion==='ufc');
 const check=proof=>evaluateCareerEvidence(profile,history,
  history.map(x=>x.date).sort().at(-1),'2026-11-15',proof,rich.bouts,approval.rosterAsOf).independentlyVerified;
 assert.equal(check(source),true);
 const missing=structuredClone(source);missing.bouts.pop();assert.equal(check(missing),false);
 const duplicated=structuredClone(source);duplicated.bouts[1].nativeBoutId=duplicated.bouts[0].nativeBoutId;assert.equal(check(duplicated),false);
 const wrongOutcome=structuredClone(source);wrongOutcome.bouts[0].result=wrongOutcome.bouts[0].result==='win'?'loss':'win';assert.equal(check(wrongOutcome),false);
 const wrongCorner=structuredClone(source);wrongCorner.verifiedNumericFighterIds=['999999'];assert.equal(check(wrongCorner),false);
});
