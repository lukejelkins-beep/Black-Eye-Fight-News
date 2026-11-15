import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const registry=read('ufc-independent-full-career-verification.json'),review=read('ufc-unified-wave30-louie-sutherland-source-review-20261115.json'),native=read('ufcalendar-rich-progress.json'),approved=read('ufc-36-month-roster-approval.json');
test('wave30 preserves full original 783-roster, Louie four-bout source and exact paired measured native UFC chronology',()=>{
 assert.equal(approved.approvedFighters.length,783);
 const x=review.fighters['louie-sutherland'],p=registry.fighters['louie-sutherland'];
 assert.ok(approved.approvedFighters.includes('louie-sutherland'));assert.equal(p.sourceCoverageAttested,true);
 assert.equal(p.scope,'complete_official_ufc_career');assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
 assert.equal(p.officialFighterUrl,x.officialFighterUrl);assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+x.ufcStatsFighterId);
 assert.deepEqual(p.verifiedNumericFighterIds,[x.nativeFighterId]);assert.equal(p.bouts.length,4);
 assert.equal(new Set(p.bouts.map(y=>y.nativeBoutId)).size,4);assert.equal(new Set(p.bouts.map(y=>y.fightUrl)).size,4);
 for(const f of x.bouts){const b=native.bouts[f.nativeBoutId];assert.equal(b.org,'ufc');assert.equal(b.status,'completed');assert.equal(b.eventDate,f.date);assert.ok(native.roundDone[f.nativeBoutId]>0);
  const own=b.a?.id===x.nativeFighterId?b.a:b.b?.id===x.nativeFighterId?b.b:null;assert.equal(own.slug,'louie-sutherland');
  const other=own===b.a?b.b:b.a;assert.equal(other.name,f.opponent);assert.equal(other.id,f.originalOpponentNumericId);
  assert.equal(b.result.winnerId===own.id?'win':b.result.winnerId===other.id?'loss':null,f.result);
  assert.ok(p.bouts.some(z=>z.nativeBoutId===f.nativeBoutId&&z.fightUrl===f.fightUrl));
 }
 assert.deepEqual(p.bouts.map(y=>y.result),['loss','loss','win','loss']);
});
test('wave30 two cancelled bookings are excluded and other worker certificates retained',()=>{
 const x=review.fighters['louie-sutherland'];
 assert.deepEqual(x.cancelledNotCompletedBookings.map(y=>y.nativeBoutId),['82602','93014']);
 for(const f of x.cancelledNotCompletedBookings){assert.equal(native.bouts[f.nativeBoutId].status,'cancelled');assert.ok(!registry.fighters['louie-sutherland'].bouts.some(y=>y.nativeBoutId===f.nativeBoutId))}
 assert.ok(registry.fighters['klaudia-sygula'],'Do not replace concurrent Klaudia certificate');
});
