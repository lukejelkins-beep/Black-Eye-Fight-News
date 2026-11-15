import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const src=read('ufc-unified-wave30-five-four-bout-careers-20261115.json'),reg=read('ufc-independent-full-career-verification.json'),cache=read('ufcalendar-rich-progress.json'),research=read('ufcalendar-fighter-research.json'),feeder=read('ufc-feeder-bout-evidence.json'),roster=read('ufc-36-month-roster-approval.json');
test('wave30 twenty exact UFC results retain five distinct complete careers, native paired corners and measured rounds',()=>{
 assert.equal(roster.approvedFighters.length,783);assert.equal(new Set(roster.approvedFighters).size,783);
 assert.deepEqual(Object.keys(src.fighters).sort(),['danny-barlow','david-martinez','diyar-nurgozhay','djorden-santos','elijah-smith']);
 assert.equal(src.certificationGranted,false);let count=0;
 for(const[slug,e]of Object.entries(src.fighters)){
  assert.ok(roster.approvedFighters.includes(slug));const r=reg.fighters[slug];assert.equal(r.sourceCoverageAttested,true);
  assert.equal(r.scope,'complete_official_ufc_career');assert.equal(r.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(r.fighterUrl,'https://ufcstats.com/fighter-details/'+e.ufcStatsFighterId);assert.equal(r.officialFighterUrl,e.officialFighterUrl);
  assert.deepEqual(r.verifiedNumericFighterIds,[e.nativeFighterId]);assert.equal(r.bouts.length,4);
  assert.equal(new Set(e.bouts.map(x=>x.nativeBoutId)).size,4);assert.equal(new Set(e.bouts.map(x=>x.fightUrl)).size,4);
  for(const x of e.bouts){const n=cache.bouts[x.nativeBoutId];assert.equal(n?.status,'completed');assert.equal(n?.org,'ufc');
   assert.doesNotMatch(n.event,/contender series|road to ufc/i);assert.ok(Math.abs(Date.parse(n.eventDate)-Date.parse(x.date))<=86400000);
   const own=n.a?.id===e.nativeFighterId?n.a:n.b?.id===e.nativeFighterId?n.b:null;assert.equal(own?.slug,slug);
   const opp=own===n.a?n.b:n.a;assert.equal(opp?.name,x.opponent);assert.equal(opp?.id,x.originalOpponentNumericId);
   assert.equal(n.result.winnerId===own.id?'win':n.result.winnerId===opp.id?'loss':null,x.result);
   assert.ok(cache.roundDone[x.nativeBoutId]>0);assert.ok(research.profiles[slug].recentHistory.some(h=>h.boutId===x.nativeBoutId&&h.result===x.result));
   assert.ok(r.bouts.some(b=>b.nativeBoutId===x.nativeBoutId&&b.fightUrl===x.fightUrl&&b.result===x.result));
   assert.match(x.pinnedSourceEventUrl,/^https:\/\/ufcstats\.com\/event-details\/[a-f0-9]{16}$/);count++;
  }
 }
 assert.equal(count,20);
});
test('wave30 all five separately attested DWCS feeder native fights stay excluded and source-pinned',()=>{
 let excluded=0;for(const[slug,e]of Object.entries(src.fighters)){
  assert.equal(e.sourceVerifiedExcludedFeederBouts.length,1);
  for(const f of e.sourceVerifiedExcludedFeederBouts){assert.match(cache.bouts[f.nativeBoutId]?.event||'',/contender series/i);
   assert.equal(feeder.bouts.filter(b=>b.fighterSlug===slug&&b.boutId===f.nativeBoutId&&b.sourceUrl===e.officialFighterUrl).length,1);
   assert.ok(!reg.fighters[slug].bouts.some(b=>b.nativeBoutId===f.nativeBoutId));excluded++;
  }
 }
 assert.equal(excluded,5);
 assert.deepEqual(reg.fighters['danny-barlow'].bouts.map(x=>x.result),['win','win','loss','loss']);
 assert.deepEqual(reg.fighters['david-martinez'].bouts.map(x=>x.result),['win','win','win','win']);
 assert.deepEqual(reg.fighters['diyar-nurgozhay'].bouts.map(x=>x.result),['loss','loss','win','win']);
 assert.deepEqual(reg.fighters['djorden-santos'].bouts.map(x=>x.result),['loss','win','loss','loss']);
 assert.deepEqual(reg.fighters['elijah-smith'].bouts.map(x=>x.result),['win','win','win','win']);
});
