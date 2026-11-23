import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const src=read('ufc-unified-wave29-yousri-nyamjargal-source-review-20261115.json'),reg=read('ufc-independent-full-career-verification.json'),cache=read('ufcalendar-rich-progress.json'),research=read('ufcalendar-fighter-research.json'),feeder=read('ufc-feeder-bout-evidence.json'),roster=read('ufc-36-month-roster-approval.json');
test('wave29: five exact independently sourced official UFC bouts preserve original corners, results and measured rounds',()=>{
 assert.equal(roster.approvedFighters.length,783);assert.equal(new Set(roster.approvedFighters).size,783);
 assert.deepEqual(Object.keys(src.fighters).sort(),['nyamjargal-tumendemberel','yousri-belgaroui']);assert.equal(src.certificationGranted,false);
 let count=0;for(const[slug,e]of Object.entries(src.fighters)){
  assert.ok(roster.approvedFighters.includes(slug));const r=reg.fighters[slug];
  assert.equal(r.sourceCoverageAttested,true);assert.equal(r.scope,'complete_official_ufc_career');assert.equal(r.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(r.fighterUrl,'https://ufcstats.com/fighter-details/'+e.ufcStatsFighterId);assert.equal(r.officialFighterUrl,e.officialFighterUrl);
  assert.deepEqual(r.verifiedNumericFighterIds,[e.nativeFighterId]);assert.equal(r.bouts.length,e.officialUfcCareerBoutCount+(slug==='yousri-belgaroui'?1:0));
  assert.equal(new Set(e.bouts.map(x=>x.nativeBoutId)).size,e.bouts.length);assert.equal(new Set(e.bouts.map(x=>x.fightUrl)).size,e.bouts.length);
  for(const x of e.bouts){const n=cache.bouts[x.nativeBoutId];assert.equal(n?.status,'completed');assert.equal(n?.org,'ufc');
   assert.doesNotMatch(n.event,/contender series|road to ufc/i);assert.ok(Math.abs(Date.parse(n.eventDate)-Date.parse(x.date))<=86400000);
   const own=n.a?.id===e.nativeFighterId?n.a:n.b?.id===e.nativeFighterId?n.b:null;assert.equal(own?.slug,slug);
   const opp=own===n.a?n.b:n.a;assert.equal(opp?.name,x.opponent);assert.equal(opp?.id,x.originalOpponentNumericId);
   assert.equal(n.result.winnerId===own.id?'win':n.result.winnerId===opp.id?'loss':null,x.result);
   assert.ok(cache.roundDone[x.nativeBoutId]>0);assert.ok(research.profiles[slug].recentHistory.some(h=>h.boutId===x.nativeBoutId&&h.result===x.result));
   assert.ok(r.bouts.some(b=>b.nativeBoutId===x.nativeBoutId&&b.fightUrl===x.fightUrl&&b.result===x.result));count++;
  }
 }
 assert.equal(count,5);
});
test('wave29: three attested feeder bouts and cancelled/announced fights are not official UFC certificates',()=>{
 let count=0;for(const[slug,e]of Object.entries(src.fighters)){for(const f of e.sourceVerifiedExcludedFeederBouts){
  assert.match(cache.bouts[f.nativeBoutId]?.event||'',/contender series|road to ufc/i);
  if(/contender series/i.test(f.event))assert.ok(feeder.bouts.some(b=>b.fighterSlug===slug&&b.boutId===f.nativeBoutId&&b.sourceUrl===e.officialFighterUrl));
  else assert.match(f.event,/road to ufc/i); // RTU proof stays in source review, not the DWCS-only exclusion register.
  assert.ok(!reg.fighters[slug].bouts.some(b=>b.nativeBoutId===f.nativeBoutId));count++;
 }}
 assert.equal(count,3);
 assert.deepEqual(reg.fighters['yousri-belgaroui'].bouts.slice(0,3).map(x=>x.result),['win','win','win']);
 assert.equal(reg.fighters['yousri-belgaroui'].bouts[3].nativeBoutId,'93104');
 assert.equal(reg.fighters['yousri-belgaroui'].bouts[3].result,'loss');
 assert.equal(reg.fighters['yousri-belgaroui'].bouts[3].fightUrl,'https://ufcstats.com/fight-details/b8e1d974531a3d86');
 assert.deepEqual(reg.fighters['nyamjargal-tumendemberel'].bouts.map(x=>x.result),['loss','win']);
 assert.ok(!reg.fighters['yousri-belgaroui'].bouts.some(x=>x.nativeBoutId==='83217'));
 assert.ok(reg.fighters['yousri-belgaroui'].bouts.some(x=>x.nativeBoutId==='93104'));
});
