import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('data/ufc-36-month-roster-approval.json');
const reg=read('data/ufc-independent-full-career-verification.json');
const feed=read('data/ufc-feeder-bout-evidence.json');
test('one unchanged approved 783-fighter cohort and two new independent full career source attestations',()=>{
 assert.equal(roster.status,'approved');assert.equal(roster.approvedFighters.length,783);
 assert.equal(new Set(roster.approvedFighters).size,783);
 for(const slug of ['pedro-falcao','rodrigo-sezinando']){
  assert.ok(roster.approvedFighters.includes(slug));
  const f=reg.fighters[slug];
  assert.equal(f.sourceCoverageAttested,true,slug);assert.equal(f.scope,'complete_official_ufc_career',slug);
  assert.equal(f.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
  assert.equal(f.officialUfcCareerBoutCount,2,slug);assert.equal(f.bouts.length,2,slug);
  assert.equal(f.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da',slug);
  assert.match(f.officialFighterUrl,/^https:\/\/www\.ufc\.com\/athlete\//);
  assert.ok(f.bouts.every(b=>/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/.test(b.fightUrl)),slug);
 }
});
test('Pedro source proves two UFC losses and preserves 2021 DWCS non-UFC fight ID 83903',()=>{
 const p=reg.fighters['pedro-falcao'];
 assert.deepEqual(p.verifiedNumericFighterIds,['2846']);
 assert.deepEqual(p.bouts.map(b=>[b.nativeBoutId,b.result,b.opponent]),[
  ['61257','loss','Victor Hugo'],['60305','loss','Victor Henry']]);
 assert.ok(!p.bouts.some(b=>b.nativeBoutId==='83903'));
 const x=feed.bouts.filter(f=>f.fighterSlug==='pedro-falcao'&&f.boutId==='83903');
 assert.equal(x.length,1);assert.equal(x[0].result,'win');assert.equal(x[0].date,'2021-10-19');assert.equal(x[0].opponent,'James Barnes');
 assert.equal(x[0].sourceUrl,'https://www.ufc.com/athlete/pedro-falcao');
 assert.deepEqual(p.sourceVerifiedExcludedFeederBouts.map(x=>x.nativeBoutId),['83903']);
});
test('Rodrigo full UFC career pins TUF 33 live final once, no TUF house qualifiers or event-name double counts',()=>{
 const r=reg.fighters['rodrigo-sezinando'];
 assert.deepEqual(r.verifiedNumericFighterIds,['142']);
 assert.deepEqual(r.bouts.map(b=>[b.nativeBoutId,b.date,b.opponent,b.result]),[
  ['38234','2025-09-13','Daniil Donchenko','loss'],
  ['93263','2026-10-31','Theodor Berggren','win']]);
 assert.equal(new Set(r.bouts.map(b=>b.fightUrl)).size,2);
 assert.equal(r.bouts[0].fightUrl,'https://ufcstats.com/fight-details/3dd2fde7bff79c51');
 assert.equal(r.disambiguation.source2025FinalNativeBoutId,'38234');
 assert.equal(r.disambiguation.originalNativeOpponentId,'132');
 assert.equal(r.disambiguation.originalNativeWinnerId,'132');
 assert.match(r.disambiguation.sourceEventAliasPolicy,/ONE physical officially completed/);
 const mirrored=reg.fighters['theodor-berggren']?.bouts?.find(b=>b.nativeBoutId==='93263');
 assert.ok(mirrored);assert.equal(mirrored.nativeFighterId,'12302');assert.equal(mirrored.result,'loss');
 assert.equal(mirrored.opponent,'Rodrigo Sezinando');assert.equal(mirrored.fightUrl,r.bouts[1].fightUrl);
});
