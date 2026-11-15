import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const roster=read('ufc-36-month-roster-approval.json'),reg=read('ufc-independent-full-career-verification.json'),cache=read('ufcalendar-rich-progress.json'),research=read('ufcalendar-fighter-research.json'),feeder=read('ufc-feeder-bout-evidence.json'),src=read('ufc-unified-wave27-aj-dobson-anton-turkalj-20261115.json');
test('wave27 exactly eight independently pinned Greco UFCStats results match native both corners, dates, winners and measured rounds',()=>{
 assert.equal(roster.approvedFighters.length,783);assert.equal(new Set(roster.approvedFighters).size,783);
 assert.deepEqual(Object.keys(src.fighters).sort(),['aj-dobson','anton-turkalj']);
 let verified=0;for(const[slug,e]of Object.entries(src.fighters)){
  assert.ok(roster.approvedFighters.includes(slug));const p=reg.fighters[slug];assert.equal(p?.sourceCoverageAttested,true);
  assert.equal(p?.scope,'complete_official_ufc_career');assert.equal(p?.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p?.fighterUrl,'https://ufcstats.com/fighter-details/'+e.ufcStatsFighterId);
  assert.equal(p?.officialFighterUrl,e.officialFighterUrl);assert.deepEqual(p.verifiedNumericFighterIds,[e.nativeFighterId]);
  assert.equal(p.officialUfcCareerBoutCount,4);assert.equal(p.bouts.length,4);
  assert.deepEqual(p.bouts,e.bouts.map(({originalOpponentNumericId,pinnedSourceEventTitle,pinnedSourceEventUrl,pinnedSourceEventDate,...rest})=>rest));
  assert.equal(new Set(p.bouts.map(x=>x.nativeBoutId)).size,4);assert.equal(new Set(p.bouts.map(x=>x.fightUrl)).size,4);
  for(const b of e.bouts){const native=cache.bouts[b.nativeBoutId];assert.equal(native?.org,'ufc');assert.equal(native?.status,'completed');
   const own=native.a?.id===e.nativeFighterId?native.a:native.b?.id===e.nativeFighterId?native.b:null;assert.ok(own&&own.slug===slug);
   const opp=own===native.a?native.b:native.a;assert.equal(opp?.name,b.opponent);assert.equal(opp.id,b.originalOpponentNumericId);
   assert.equal(native.result.winnerId===own.id?'win':native.result.winnerId===opp.id?'loss':null,b.result);
   assert.ok(Math.abs(Date.parse(native.eventDate)-Date.parse(b.date))<=86400000);assert.ok(cache.roundDone[b.nativeBoutId]>0);
   assert.ok(b.fightUrl.startsWith('https://ufcstats.com/fight-details/'));assert.ok(b.pinnedSourceEventUrl.startsWith('https://ufcstats.com/event-details/'));assert.equal(b.pinnedSourceEventDate,b.date);
   verified++;
  }
 }
 assert.equal(verified,8);
});
test('wave27 exact saved DWCS original IDs are independently source-excluded, not counted as UFC Octagon wins',()=>{
 for(const[slug,e]of Object.entries(src.fighters)){
  assert.equal(e.sourceVerifiedExcludedFeederBouts.length,1);const f=e.sourceVerifiedExcludedFeederBouts[0];
  assert.ok(research.profiles[slug].recentHistory.some(x=>x.boutId===f.nativeBoutId&&x.date===f.date&&x.result==='win'));
  assert.ok(!reg.fighters[slug].bouts.some(x=>x.nativeBoutId===f.nativeBoutId));
  assert.ok(feeder.bouts.some(x=>x.fighterSlug===slug&&x.boutId===f.nativeBoutId&&x.sourceUrl===f.officialSourceUrl));
 }
 assert.deepEqual(reg.fighters['aj-dobson'].bouts.map(x=>x.result),['loss','loss','win','loss']);
 assert.deepEqual(reg.fighters['anton-turkalj'].bouts.map(x=>x.result),['loss','loss','loss','loss']);
});
