import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const roster=read('ufc-36-month-roster-approval.json'),reg=read('ufc-independent-full-career-verification.json'),cache=read('ufcalendar-rich-progress.json'),src=read('ufc-unified-wave34-luan-lacerda-mario-pinto-source-review-20261115.json');
test('wave34 nonduplicated four-bout full careers retain exact native IDs, full measured rounds and pinned Greco source results',()=>{
 assert.equal(roster.approvedFighters.length,783);const slugs=Object.keys(src.fighters);assert.ok(slugs.length>=1&&slugs.length<=2);
 assert.ok(slugs.every(x=>['luan-lacerda','mario-pinto'].includes(x)));
 for(const[slug,e]of Object.entries(src.fighters)){
  assert.ok(roster.approvedFighters.includes(slug));const proof=reg.fighters[slug];
  assert.equal(proof.sourceCoverageAttested,true);assert.equal(proof.scope,'complete_official_ufc_career');
  assert.equal(proof.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(proof.fighterUrl,'https://ufcstats.com/fighter-details/'+e.ufcStatsFighterId);
  assert.equal(proof.officialFighterUrl,e.officialFighterUrl);assert.deepEqual(proof.verifiedNumericFighterIds,[e.nativeFighterId]);
  assert.equal(proof.bouts.length,4);assert.equal(new Set(e.bouts.map(b=>b.nativeBoutId)).size,4);
  assert.equal(new Set(e.bouts.map(b=>b.fightUrl)).size,4);
  for(const x of e.bouts){
   const n=cache.bouts[x.nativeBoutId];assert.equal(n?.org,'ufc');assert.equal(n?.status,'completed');assert.equal(n.eventDate,x.date);
   assert.ok(cache.roundDone[x.nativeBoutId]>0);assert.ok(!/contender series|road to ufc/i.test(n.event));
   const own=n.a?.id===e.nativeFighterId?n.a:n.b?.id===e.nativeFighterId?n.b:null;assert.equal(own?.slug,slug);
   const other=own===n.a?n.b:n.a;assert.equal(other?.name,x.opponent);assert.equal(other?.id,x.originalOpponentNumericId);
   assert.equal(n.result.winnerId===own.id?'win':n.result.winnerId===other.id?'loss':null,x.result);
   assert.ok(proof.bouts.some(y=>y.nativeBoutId===x.nativeBoutId&&y.fightUrl===x.fightUrl&&y.result===x.result));
  }
 }
});
test('wave34 independently excludes official DWCS feeder and future announced bout',()=>{
 for(const[slug,e]of Object.entries(src.fighters)){
  const proof=reg.fighters[slug];
  assert.equal(proof.sourceVerifiedExcludedFeederBouts.length,e.sourceVerifiedExcludedFeederBouts.length);
  for(const x of e.sourceVerifiedExcludedFeederBouts){assert.match(cache.bouts[x.nativeBoutId]?.event||'',/contender series/i);
   assert.equal(x.officialSourceUrl,'https://www.ufc.com/news/week-9-results-scorecards-dana-whites-contender-series-season-8');
   assert.ok(!proof.bouts.some(y=>y.nativeBoutId===x.nativeBoutId));}
  for(const id of e.excludedAnnouncedNativeBoutIds){assert.equal(cache.bouts[id]?.status,'announced');assert.ok(!proof.bouts.some(y=>y.nativeBoutId===id));}
 }
});
