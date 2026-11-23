import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const fixture=read('ufc-independent-wave-20261115-bryczek-despaigne-elder-source.json'),registry=read('ufc-independent-full-career-verification.json'),native=read('ufcalendar-rich-progress.json'),research=read('ufcalendar-fighter-research.json'),roster=read('ufc-36-month-roster-approval.json');
test('three complete official UFC careers have exhaustive pinned source, reciprocal numeric native corners, results and measured rounds',()=>{
 assert.equal(roster.approvedFighters.length,783);assert.equal(new Set(roster.approvedFighters).size,783);
 assert.equal(fixture.certificationGranted,false);assert.deepEqual(Object.keys(fixture.fighters).sort(),['evan-elder','robelis-despaigne','robert-bryczek']);
 let count=0;
 for(const[slug,e]of Object.entries(fixture.fighters)){
  assert.ok(roster.approvedFighters.includes(slug));const r=registry.fighters[slug];assert.equal(r.sourceCoverageAttested,true);assert.equal(r.scope,'complete_official_ufc_career');assert.equal(r.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(r.fighterUrl,'https://ufcstats.com/fighter-details/'+e.ufcStatsFighterId);assert.equal(r.officialFighterUrl,e.officialFighterUrl);
  assert.deepEqual(r.verifiedNumericFighterIds,[e.nativeFighterId]);assert.equal(r.bouts.length,e.officialUfcCareerBoutCount+(slug==='evan-elder'?1:0));
  assert.equal(new Set(e.bouts.map(x=>x.nativeBoutId)).size,e.officialUfcCareerBoutCount);
  assert.equal(new Set(e.bouts.map(x=>x.fightUrl)).size,e.officialUfcCareerBoutCount);
  for(const x of e.bouts){
   const b=native.bouts[x.nativeBoutId];assert.equal(b?.status,'completed');assert.equal(b?.org,'ufc');assert.doesNotMatch(b.event,/contender series|road to ufc|exhibition/i);
   assert.ok(Math.abs(Date.parse(b.eventDate)-Date.parse(x.date))<=86400000);const own=b.a?.id===e.nativeFighterId?b.a:b.b?.id===e.nativeFighterId?b.b:null;assert.equal(own?.slug,slug);
   const opponent=own===b.a?b.b:b.a;assert.equal(opponent?.name,x.opponent);assert.equal(opponent?.id,x.originalOpponentNumericId);
   assert.equal(b.result.winnerId===own.id?'win':b.result.winnerId===opponent.id?'loss':null,x.result);assert.ok(native.roundDone[x.nativeBoutId]>0);
   assert.ok(research.profiles[slug]?.recentHistory.some(h=>h.boutId===x.nativeBoutId&&h.result===x.result));
   assert.ok(r.bouts.some(q=>q.nativeBoutId===x.nativeBoutId&&q.fightUrl===x.fightUrl&&q.result===x.result));
   assert.match(x.pinnedSourceEventUrl,/^https:\/\/ufcstats\.com\/event-details\/[a-f0-9]{16}$/);
   count++;
  }
 }
 assert.equal(count,13);
});
test('all 13 official Octagon contests preserve original results without feeder, future-fight or duplicate certification',()=>{
 assert.deepEqual(registry.fighters['robert-bryczek'].bouts.map(b=>b.result),['loss','win','loss','loss']);
 assert.deepEqual(registry.fighters['robelis-despaigne'].bouts.map(b=>b.result),['win','loss','loss','win']);
 assert.deepEqual(registry.fighters['evan-elder'].bouts.slice(0,5).map(b=>b.result),['loss','loss','win','win','win']);
 assert.equal(registry.fighters['evan-elder'].bouts[5].nativeBoutId,'93621');
 assert.equal(registry.fighters['evan-elder'].bouts[5].fightUrl,'https://ufcstats.com/fight-details/aad8a97d1a0852a0');
 assert.equal(registry.fighters['evan-elder'].bouts[5].result,'win');
 for(const e of Object.values(fixture.fighters))assert.equal(e.sourceVerifiedExcludedFeederBouts.length,0);
});
