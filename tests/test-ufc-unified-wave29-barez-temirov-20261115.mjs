import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const register=read('ufc-independent-full-career-verification.json'),src=read('ufc-unified-wave29-barez-temirov-source-review-20261115.json'),cache=read('ufcalendar-rich-progress.json'),roster=read('ufc-36-month-roster-approval.json');
test('wave29 exactly eight independent official UFC bouts preserve two original native fighter identities, paired winners, source IDs and complete measured rounds',()=>{
 assert.equal(roster.approvedFighters.length,783);assert.deepEqual(Object.keys(src.fighters).sort(),['daniel-barez','ramazan-temirov']);let count=0;
 for(const[slug,e]of Object.entries(src.fighters)){
  assert.ok(roster.approvedFighters.includes(slug));const p=register.fighters[slug];
  assert.equal(p.sourceCoverageAttested,true);assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+e.ufcStatsFighterId);
  assert.equal(p.officialFighterUrl,e.officialFighterUrl);
  assert.deepEqual(p.verifiedNumericFighterIds,[e.nativeFighterId]);assert.equal(p.bouts.length,4);
  assert.equal(new Set(p.bouts.map(x=>x.nativeBoutId)).size,4);assert.equal(new Set(p.bouts.map(x=>x.fightUrl)).size,4);
  for(const b of e.bouts){
   const n=cache.bouts[b.nativeBoutId];assert.equal(n?.org,'ufc');assert.equal(n?.status,'completed');
   assert.equal(n.eventDate,b.date);assert.ok(!/contender series|road to ufc/i.test(n.event));
   const own=n.a?.id===e.nativeFighterId?n.a:n.b?.id===e.nativeFighterId?n.b:null;
   assert.equal(own?.slug,slug);const other=own===n.a?n.b:n.a;
   assert.equal(other?.name,b.opponent);assert.equal(other?.id,b.originalOpponentNumericId);
   assert.equal(n.result.winnerId===own.id?'win':n.result.winnerId===other.id?'loss':null,b.result);
   assert.ok(cache.roundDone[b.nativeBoutId]>0);assert.ok(p.bouts.some(x=>x.nativeBoutId===b.nativeBoutId&&x.fightUrl===b.fightUrl&&x.result===b.result));count++;
  }
 }
 assert.equal(count,8);
});
test('wave29 enforces Daniel Barez DWCS exclusion and corrected loss outcomes, with no extra UFC career entries',()=>{
 const b=src.fighters['daniel-barez'],p=register.fighters['daniel-barez'];
 assert.equal(b.sourceVerifiedExcludedFeederBouts.length,1);const x=b.sourceVerifiedExcludedFeederBouts[0];
 assert.equal(x.nativeBoutId,'84130');assert.match(cache.bouts[x.nativeBoutId].event,/contender series/i);
 assert.equal(x.officialSourceUrl,b.officialFighterUrl);assert.ok(!p.bouts.some(y=>y.nativeBoutId===x.nativeBoutId));
 assert.deepEqual(p.bouts.map(y=>y.result),['loss','win','loss','loss']);
 assert.deepEqual(register.fighters['ramazan-temirov'].bouts.map(y=>y.result),['win','win','win','loss']);
});
