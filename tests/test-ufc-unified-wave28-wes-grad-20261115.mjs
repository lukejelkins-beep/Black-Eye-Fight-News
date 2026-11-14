import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const registry=read('ufc-independent-full-career-verification.json'),src=read('ufc-unified-wave28-wes-schultz-bogdan-grad-source-review-20261115.json'),cache=read('ufcalendar-rich-progress.json'),roster=read('ufc-36-month-roster-approval.json');
test('wave28 seven independently sourced official fights preserve native paired corners and completed measured rounds',()=>{
 assert.equal(roster.approvedFighters.length,783);assert.deepEqual(Object.keys(src.fighters).sort(),['bogdan-grad','wes-schultz']);
 let verified=0;for(const[slug,e]of Object.entries(src.fighters)){
  assert.ok(roster.approvedFighters.includes(slug));const p=registry.fighters[slug];
  assert.equal(p.sourceCoverageAttested,true);assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+e.ufcStatsFighterId);
  assert.equal(p.officialFighterUrl,e.officialFighterUrl);assert.deepEqual(p.verifiedNumericFighterIds,[e.nativeFighterId]);
  assert.equal(p.bouts.length,e.bouts.length);assert.equal(new Set(p.bouts.map(x=>x.nativeBoutId)).size,e.bouts.length);
  assert.equal(new Set(p.bouts.map(x=>x.fightUrl)).size,e.bouts.length);
  for(const x of e.bouts){const n=cache.bouts[x.nativeBoutId];assert.equal(n?.status,'completed');assert.equal(n?.org,'ufc');assert.equal(n.eventDate,x.date);
   assert.ok(!/contender series|road to ufc/i.test(n.event));const own=n.a?.id===e.nativeFighterId?n.a:n.b?.id===e.nativeFighterId?n.b:null;assert.equal(own?.slug,slug);
   const opp=own===n.a?n.b:n.a;assert.equal(opp?.name,x.opponent);assert.equal(opp.id,x.originalOpponentNumericId);
   assert.equal(n.result.winnerId===own.id?'win':n.result.winnerId===opp.id?'loss':null,x.result);
   assert.ok(cache.roundDone[x.nativeBoutId]>0);assert.ok(p.bouts.some(b=>b.nativeBoutId===x.nativeBoutId&&b.fightUrl===x.fightUrl&&b.result===x.result));verified++;
  }
 }
 assert.equal(verified,7);
});
test('wave28 four DWCS feeder results and cancelled Wes bout cannot become official UFC certificates',()=>{
 for(const[slug,e]of Object.entries(src.fighters)){assert.equal(e.sourceVerifiedExcludedFeederBouts.length,2);
  for(const x of e.sourceVerifiedExcludedFeederBouts){assert.match(cache.bouts[x.nativeBoutId]?.event||'',/contender series/i);
   assert.equal(x.officialSourceUrl,e.officialFighterUrl);
   assert.ok(!registry.fighters[slug].bouts.some(y=>y.nativeBoutId===x.nativeBoutId));
  }
 }
 assert.deepEqual(registry.fighters['wes-schultz'].bouts.map(x=>x.result),['loss','win','loss']);
 assert.deepEqual(registry.fighters['bogdan-grad'].bouts.map(x=>x.result),['win','loss','loss','win']);
 assert.ok(!registry.fighters['wes-schultz'].bouts.some(x=>x.nativeBoutId==='93275'));
});
