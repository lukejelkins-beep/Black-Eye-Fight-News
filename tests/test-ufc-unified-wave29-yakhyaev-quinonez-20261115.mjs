import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const reg=read('ufc-independent-full-career-verification.json'),src=read('ufc-unified-wave29-yakhyaev-cristian-quinonez-source-review-20261115.json'),cache=read('ufcalendar-rich-progress.json'),roster=read('ufc-36-month-roster-approval.json');
test('wave29 eight complete UFC bouts retain exact Greco source IDs, both native corners, outcomes and measured rounds',()=>{
 assert.equal(roster.approvedFighters.length,783);assert.deepEqual(Object.keys(src.fighters).sort(),['abdul-rakhman-yakhyaev','cristian-quinonez']);
 let count=0;
 for(const[slug,e]of Object.entries(src.fighters)){
  assert.ok(roster.approvedFighters.includes(slug));
  const p=reg.fighters[slug];assert.equal(p.sourceCoverageAttested,true);assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+e.ufcStatsFighterId);
  assert.equal(p.officialFighterUrl,e.officialFighterUrl);assert.deepEqual(p.verifiedNumericFighterIds,[e.nativeFighterId]);
  assert.equal(p.bouts.length,4);assert.equal(new Set(p.bouts.map(x=>x.nativeBoutId)).size,4);assert.equal(new Set(p.bouts.map(x=>x.fightUrl)).size,4);
  for(const x of e.bouts){const n=cache.bouts[x.nativeBoutId];assert.equal(n?.status,'completed');assert.equal(n?.org,'ufc');
   assert.ok(!/contender series|road to ufc/i.test(n.event));assert.ok(Math.abs(Date.parse(n.eventDate)-Date.parse(x.date))<=86400000);
   const own=n.a?.id===e.nativeFighterId?n.a:n.b?.id===e.nativeFighterId?n.b:null;assert.equal(own?.slug,slug);
   const opp=own===n.a?n.b:n.a;assert.equal(opp.name,x.opponent);assert.equal(opp.id,x.originalOpponentNumericId);
   assert.equal(n.result.winnerId===own.id?'win':n.result.winnerId===opp.id?'loss':null,x.result);
   assert.ok(cache.roundDone[x.nativeBoutId]>0);assert.ok(p.bouts.some(b=>b.nativeBoutId===x.nativeBoutId&&b.fightUrl===x.fightUrl&&b.result===x.result));count++;
  }
 }
 assert.equal(count,8);assert.equal(cache.bouts['39034'].eventDate,'2024-02-25');
 assert.equal(reg.fighters['cristian-quinonez'].bouts.find(b=>b.nativeBoutId==='39034').date,'2024-02-24');
});
test('wave29 two independently attested DWCS original native IDs are excluded',()=>{
 for(const[slug,e]of Object.entries(src.fighters)){assert.equal(e.sourceVerifiedExcludedFeederBouts.length,1);
  const f=e.sourceVerifiedExcludedFeederBouts[0];assert.match(cache.bouts[f.nativeBoutId]?.event||'',/contender series/i);
  assert.equal(f.officialSourceUrl,e.officialFighterUrl);assert.ok(!reg.fighters[slug].bouts.some(b=>b.nativeBoutId===f.nativeBoutId));
 }
 assert.deepEqual(reg.fighters['abdul-rakhman-yakhyaev'].bouts.map(b=>b.result),['win','win','win','win']);
 assert.deepEqual(reg.fighters['cristian-quinonez'].bouts.map(b=>b.result),['win','loss','loss','win']);
});
