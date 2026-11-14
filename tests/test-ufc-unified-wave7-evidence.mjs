import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const get=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const source=get('data/ufc-unified-wave7-official-source-review-20261114.json');
const registry=get('data/ufc-independent-full-career-verification.json');
const roster=get('data/ufc-36-month-roster-approval.json');
const feeder=get('data/ufc-feeder-bout-evidence.json');

test('wave7 keeps eight exhaustive UFC histories with 24 original native bout IDs and immutable roster',()=>{
 assert.equal(roster.status,'approved');
 assert.equal(roster.approvedFighters.length,783);
 assert.equal(new Set(roster.approvedFighters).size,783);
 assert.equal(source.nonproduction,true);
 assert.equal(source.certificationGranted,false);
 assert.equal(Object.keys(source.fighters).length,8);
 let count=0;
 for(const [slug,entry] of Object.entries(source.fighters)){
  assert.ok(roster.approvedFighters.includes(slug),slug);
  const proof=registry.fighters[slug];
  assert.ok(proof?.sourceCoverageAttested,slug);
  assert.equal(proof.scope,'complete_official_ufc_career',slug);
  assert.equal(proof.officialUfcCareerBoutCount,entry.bouts.length,slug);
  assert.equal(proof.bouts.length,entry.bouts.length,slug);
  assert.equal(proof.officialFighterUrl,entry.officialFighterUrl,slug);
  assert.equal(proof.fighterUrl,entry.pinnedGrecoFighterUrl,slug);
  assert.equal(new Set(proof.bouts.map(b=>b.nativeBoutId)).size,proof.bouts.length,slug);
  assert.equal(new Set(proof.bouts.map(b=>b.fightUrl)).size,proof.bouts.length,slug);
  assert.equal(new Set(proof.bouts.map(b=>b.nativeFighterId)).size,1,slug);
  for(const fight of entry.bouts){
   const matching=proof.bouts.filter(b=>b.date===fight.date&&b.opponent===fight.opponent&&b.result===fight.result);
   assert.equal(matching.length,1,slug+':'+fight.date);
   assert.equal(new URL(matching[0].fightUrl).hostname,'ufcstats.com',slug);
   assert.match(matching[0].fightUrl, /\/fight-details\/[a-f0-9]{16}$/i);
   assert.match(String(matching[0].nativeBoutId),/^[1-9][0-9]*$/);
  }
  count+=proof.bouts.length;
 }
 assert.equal(count,24);
});
test('authoritative official outcomes override misleading summary badges',()=>{
 const expected=[
  ['eric-mcconico','2026-08-15','loss'],
  ['felipe-franco','2026-10-10','loss'],
  ['farman-hasanov','2026-10-31','loss'],
  ['guilherme-pat','2026-08-08','loss'],
  ['eric-nolan','2026-10-03','win']
 ];
 for(const [slug,date,result] of expected){
  assert.equal(registry.fighters[slug].bouts.find(b=>b.date===date)?.result,result,slug);
 }
});
test('Felipe Franco DWCS bout remains precisely excluded without deleting provenance',()=>{
 const matches=feeder.bouts.filter(b=>b.fighterSlug==='felipe-franco'&&b.boutId==='83911');
 assert.equal(matches.length,1);
 assert.equal(matches[0].opponent,'Freddy Vidal');
 assert.equal(matches[0].date,'2025-09-09');
 assert.equal(matches[0].sourceUrl,'https://www.ufc.com/athlete/felipe-franco');
 assert.ok(!registry.fighters['felipe-franco'].bouts.some(b=>b.nativeBoutId==='83911'));
});
