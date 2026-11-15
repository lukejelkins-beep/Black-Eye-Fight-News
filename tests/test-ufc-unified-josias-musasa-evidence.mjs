import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('data/ufc-36-month-roster-approval.json');
const registry=read('data/ufc-independent-full-career-verification.json');
const native=read('data/ufcalendar-rich-progress.json');
const feeder=read('data/ufc-feeder-bout-evidence.json');
const review=read('data/ufc-unified-josias-musasa-official-source-review-20261114.json');
test('Josias Musasa complete two UFC losses backed by independent pinned source IDs and measured paired native corners',()=>{
 assert.ok(roster.approvedFighters.includes('josias-musasa'));
 assert.equal(roster.approvedFighters.length,783);
 assert.equal(review.certificationGranted,false);
 const p=registry.fighters['josias-musasa'];
 assert.equal(p.sourceCoverageAttested,true);
 assert.equal(p.scope,'complete_official_ufc_career');
 assert.equal(p.officialUfcCareerBoutCount,2);
 assert.equal(p.sourceSnapshot.sourceCommit,review.grecoCommit);
 assert.deepEqual(p.verifiedNumericFighterIds,['209']);
 assert.equal(p.fighterUrl,review.pinnedGrecoUfcStatsFighterUrl);
 assert.equal(p.officialFighterUrl,review.officialAthleteUrl);
 assert.deepEqual(p.bouts.map(x=>[x.nativeBoutId,x.nativeFighterId,x.result]),[['60363','209','loss'],['38217','209','loss']]);
 for(const b of review.completedUfcBouts){
  const matched=p.bouts.find(x=>x.nativeBoutId===b.nativeBoutId);
  assert.ok(matched);assert.equal(matched.fightUrl,b.ufcStatsFightUrl);
  assert.equal(matched.opponent,b.opponent);
  assert.equal(matched.result,b.result);
  assert.ok(Math.abs(Date.parse(matched.date)-Date.parse(b.date))<=86400000);
  const old=native.bouts[b.nativeBoutId];
  assert.equal(old?.org,'ufc');assert.equal(old?.status,'completed');
  const own=[old.a,old.b].find(x=>x?.id==='209');const other=[old.a,old.b].find(x=>x?.id!=='209');
  assert.ok(own&&other);assert.equal(other.name,b.opponent);
  assert.notEqual(String(old.result.winnerId),'209');
 }
});
test('DWCS winner claim and cancelled future bout must never become completed UFC career fights',()=>{
 const p=registry.fighters['josias-musasa'];
 assert.deepEqual(p.sourceVerifiedExcludedFeederBouts.map(x=>x.nativeBoutId),['88275']);
 const f=feeder.bouts.filter(x=>x.fighterSlug==='josias-musasa'&&x.boutId==='88275');
 assert.equal(f.length,1);assert.equal(f[0].result,'win');
 assert.equal(native.bouts['88275'].status,'completed');
 assert.equal(native.bouts['82715'].status,'cancelled');
 assert.ok(p.bouts.every(x=>x.nativeBoutId!=='88275'&&x.nativeBoutId!=='82715'));
});
