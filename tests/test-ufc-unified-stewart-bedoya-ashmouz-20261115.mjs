import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('data/ufc-36-month-roster-approval.json');
const reg=read('data/ufc-independent-full-career-verification.json');
const cache=read('data/ufcalendar-rich-progress.json');
const src=read('data/ufc-unified-stewart-bedoya-ashmouz-source-review-20261115.json');
test('three independent complete UFC career proofs preserve 12 source fight IDs and all original native corners',()=>{
 assert.equal(roster.approvedFighters.length,783);
 assert.deepEqual(Object.keys(src.fighters).sort(),['rolando-bedoya','stewart-nicoll','yanal-ashmouz']);
 let total=0;const ids=[];
 for(const [slug,c] of Object.entries(src.fighters)){
  assert.ok(roster.approvedFighters.includes(slug));const p=reg.fighters[slug];
  assert.equal(p?.sourceCoverageAttested,true);assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.fighterName,c.name);assert.equal(p.officialFighterUrl,c.officialFighterUrl);
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+c.ufcStatsFighterId);
  assert.deepEqual(p.verifiedNumericFighterIds,[c.nativeFighterId]);
  assert.equal(p.officialUfcCareerBoutCount,4);
  assert.deepEqual(p.bouts,c.bouts.map(({originalOpponentNumericId,...core})=>core));
  assert.equal(new Set(p.bouts.map(b=>b.fightUrl)).size,4);
  assert.equal(new Set(p.bouts.map(b=>b.nativeBoutId)).size,4);
  for(const b of c.bouts){
   const n=cache.bouts[b.nativeBoutId];assert.equal(n?.org,'ufc');assert.equal(n?.status,'completed');
   const own=n.a?.id===c.nativeFighterId?n.a:n.b?.id===c.nativeFighterId?n.b:null;
   assert.ok(own&&own.slug===slug);const other=own===n.a?n.b:n.a;
   assert.equal(other.id,b.originalOpponentNumericId);assert.equal(other.name,b.opponent);
   assert.equal(n.result.winnerId===own.id?'win':n.result.winnerId===other.id?'loss':null,b.result);
   assert.ok(Math.abs(Date.parse(n.eventDate)-Date.parse(b.date))<=86400000);
   assert.ok(cache.roundDone[b.nativeBoutId]>0);
   assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[0-9a-f]{16}$/);
   ids.push(b.nativeBoutId);total++;
  }
 }
 assert.equal(total,12);assert.equal(new Set(ids).size,12);
});
test('preserve four official fights apiece, exact historical results and UTC day shifts',()=>{
 const r=reg.fighters['rolando-bedoya'],s=reg.fighters['stewart-nicoll'],y=reg.fighters['yanal-ashmouz'];
 assert.deepEqual(r.bouts.map(x=>x.result),['loss','loss','loss','loss']);
 assert.deepEqual(s.bouts.map(x=>x.result),['loss','loss','loss','loss']);
 assert.deepEqual(y.bouts.map(x=>x.result),['win','loss','win','loss']);
 assert.equal(r.bouts.at(-1).date,'2025-09-27');assert.equal(cache.bouts['38216'].eventDate,'2025-09-28');
 assert.equal(y.bouts.at(-1).date,'2025-06-07');assert.equal(cache.bouts['60872'].eventDate,'2025-06-08');
 assert.ok(!s.bouts.some(x=>x.opponent==='Vinicius Salvador'));
});
