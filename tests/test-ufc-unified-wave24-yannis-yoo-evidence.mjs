import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('data/ufc-36-month-roster-approval.json');
const registry=read('data/ufc-independent-full-career-verification.json');
const native=read('data/ufcalendar-rich-progress.json');
const fixture=read('data/ufc-unified-wave24-yannis-yoo-source-review-20261114.json');
test('wave24 source is explicitly noncertifying, immutable approved roster preserved',()=>{
 assert.equal(roster.status,'approved');
 assert.equal(roster.approvedFighters.length,783);
 assert.equal(new Set(roster.approvedFighters).size,783);
 assert.equal(fixture.nonproduction,true);
 assert.equal(fixture.certificationGranted,false);
 assert.equal(fixture.rosterSize,783);
 assert.deepEqual(Object.keys(fixture.fighters),['john-yannis','joosang-yoo']);
 assert.equal(new Set(Object.keys(registry.fighters)).size,Object.keys(registry.fighters).length);
});
test('two complete official UFC careers: six exact sourced bouts, both original numeric corners, outcomes and measured rounds',()=>{
 let count=0;
 for(const [slug,source] of Object.entries(fixture.fighters)){
  const c=registry.fighters[slug];
  assert.ok(roster.approvedFighters.includes(slug),slug);
  assert.ok(c?.sourceCoverageAttested===true,slug);
  assert.equal(c.scope,'complete_official_ufc_career',slug);
  assert.equal(c.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
  assert.equal(c.sourceSnapshot.sourceCommit,fixture.pinnedSource.sourceCommit,slug);
  assert.equal(c.officialFighterUrl,source.officialFighterUrl,slug);
  assert.equal(c.fighterUrl,source.grecoFighterUrl,slug);
  assert.deepEqual(c.verifiedNumericFighterIds,[source.nativeFighterId],slug);
  assert.equal(c.officialUfcCareerBoutCount,3,slug);
  assert.deepEqual(c.bouts,source.bouts,slug);
  assert.equal(new Set(c.bouts.map(b=>b.nativeBoutId)).size,3,slug);
  assert.equal(new Set(c.bouts.map(b=>b.fightUrl)).size,3,slug);
  for(const b of c.bouts){
   const n=native.bouts[b.nativeBoutId];
   assert.ok(n&&n.org==='ufc'&&n.status==='completed',slug+':'+b.nativeBoutId);
   assert.ok(native.roundDone[b.nativeBoutId],slug+':'+b.nativeBoutId);
   const own=n.a.id===source.nativeFighterId?n.a:n.b.id===source.nativeFighterId?n.b:null;
   const other=n.a.id===source.nativeFighterId?n.b:n.a;
   assert.ok(own&&other,slug+':'+b.nativeBoutId);
   assert.equal(other.name,b.opponent,slug+':'+b.nativeBoutId);
   assert.equal(n.result?.winnerId===own.id?'win':n.result?.winnerId===other.id?'loss':null,b.result,slug+':'+b.nativeBoutId);
   assert.ok(Math.abs(Date.parse(n.eventDate)-Date.parse(b.date))<=86400000,slug+':'+b.nativeBoutId);
   count++;
  }
 }
 assert.equal(count,6);
});
test('official outcomes take precedence over athlete summary Win badge; reciprocal Jamie Siraj is preserved',()=>{
 const john=registry.fighters['john-yannis'];
 assert.deepEqual(john.bouts.map(x=>x.result),['loss','win','loss']);
 const siraj=registry.fighters['jamie-siraj'];
 assert.ok(siraj?.sourceCoverageAttested);
 assert.equal(siraj.bouts.find(b=>b.nativeBoutId==='66100')?.result,'loss');
 assert.equal(siraj.bouts.find(b=>b.nativeBoutId==='66100')?.fightUrl,john.bouts[1].fightUrl);
 const yoo=registry.fighters['joosang-yoo'];
 assert.deepEqual(yoo.bouts.map(x=>x.result),['win','loss','loss']);
 assert.ok(!yoo.bouts.some(b=>b.date==='2027-02-06'));
});
