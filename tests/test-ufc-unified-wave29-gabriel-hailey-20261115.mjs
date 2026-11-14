import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const registry=read('ufc-independent-full-career-verification.json'),src=read('ufc-unified-wave29-gabriel-santos-hailey-cowan-source-review-20261115.json'),cache=read('ufcalendar-rich-progress.json'),roster=read('ufc-36-month-roster-approval.json');
test('wave29 independently sourced official bouts match 783 cohort, native paired corners, outcomes and measured rounds',()=>{
 assert.equal(roster.approvedFighters.length,783);let checked=0;
 for(const [slug,e]of Object.entries(src.fighters)){
  assert.ok(roster.approvedFighters.includes(slug));const p=registry.fighters[slug];
  assert.equal(p?.sourceCoverageAttested,true);assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+e.ufcStatsFighterId);
  assert.equal(p.officialFighterUrl,e.officialFighterUrl);assert.deepEqual(p.verifiedNumericFighterIds,[e.nativeFighterId]);
  assert.equal(p.bouts.length,e.bouts.length);assert.equal(new Set(p.bouts.map(x=>x.nativeBoutId)).size,e.bouts.length);assert.equal(new Set(p.bouts.map(x=>x.fightUrl)).size,e.bouts.length);
  for(const x of e.bouts){
   const b=cache.bouts[x.nativeBoutId];assert.equal(b?.status,'completed');assert.equal(b?.org,'ufc');assert.equal(b.eventDate,x.date);assert.ok(!/contender series|road to ufc/i.test(b.event));
   const own=b.a?.id===e.nativeFighterId?b.a:b.b?.id===e.nativeFighterId?b.b:null;assert.equal(own?.slug,slug);const other=own===b.a?b.b:b.a;
   assert.equal(other.name,x.opponent);assert.equal(other.id,x.originalOpponentNumericId);assert.equal(b.result.winnerId===own.id?'win':b.result.winnerId===other.id?'loss':null,x.result);
   assert.ok(cache.roundDone[x.nativeBoutId]>0);assert.ok(p.bouts.some(y=>y.nativeBoutId===x.nativeBoutId&&y.fightUrl===x.fightUrl&&y.result===x.result));checked++;
  }
 }
 assert.equal(checked,8);
});
test('wave29 DWCS feeder never becomes an Octagon fight and UFC full career sources preserve outcomes',()=>{
 const h=src.fighters['hailey-cowan'];assert.equal(h.sourceVerifiedExcludedFeederBouts.length,1);
 assert.equal(h.sourceVerifiedExcludedFeederBouts[0].nativeBoutId,'84152');
 assert.match(cache.bouts['84152'].event,/contender series/i);
 assert.ok(!registry.fighters['hailey-cowan'].bouts.some(x=>x.nativeBoutId==='84152'));
 assert.deepEqual(registry.fighters['hailey-cowan'].bouts.map(x=>x.result),['loss','loss','loss','loss']);
 assert.deepEqual(registry.fighters['gabriel-santos'].bouts.map(x=>x.result),['loss','loss','win','win']);
});
