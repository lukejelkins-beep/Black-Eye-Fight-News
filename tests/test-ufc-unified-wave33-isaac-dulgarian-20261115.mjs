import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const roster=read('ufc-36-month-roster-approval.json'),reg=read('ufc-independent-full-career-verification.json'),cache=read('ufcalendar-rich-progress.json'),src=read('ufc-unified-wave33-isaac-dulgarian-20261115.json');
test('wave33 Isaac Dulgarian complete exact UFC chronology, one native numeric identity, four saved winners and measured rounds',()=>{
 assert.equal(roster.approvedFighters.length,783);assert.ok(roster.approvedFighters.includes('isaac-dulgarian'));
 const e=src.fighters['isaac-dulgarian'],p=reg.fighters['isaac-dulgarian'];assert.equal(p.sourceCoverageAttested,true);
 assert.equal(p.scope,'complete_official_ufc_career');assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
 assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+e.ufcStatsFighterId);
 assert.equal(p.officialFighterUrl,e.officialFighterUrl);assert.deepEqual(p.verifiedNumericFighterIds,[e.nativeFighterId]);
 assert.equal(e.bouts.length,4);assert.equal(p.bouts.length,4);assert.equal(new Set(e.bouts.map(x=>x.nativeBoutId)).size,4);
 assert.equal(new Set(e.bouts.map(x=>x.fightUrl)).size,4);
 for(const x of e.bouts){
  const n=cache.bouts[x.nativeBoutId];assert.equal(n?.status,'completed');assert.equal(n?.org,'ufc');assert.equal(n.eventDate,x.date);
  assert.ok(cache.roundDone[x.nativeBoutId]>0);assert.ok(!/contender series|road to ufc/i.test(n.event));
  const own=n.a?.id===e.nativeFighterId?n.a:n.b?.id===e.nativeFighterId?n.b:null;assert.equal(own?.slug,'isaac-dulgarian');
  const opponent=own===n.a?n.b:n.a;assert.equal(opponent.name,x.opponent);assert.equal(opponent.id,x.originalOpponentNumericId);
  assert.equal(n.result.winnerId===own.id?'win':n.result.winnerId===opponent.id?'loss':null,x.result);
  assert.ok(p.bouts.some(row=>row.nativeBoutId===x.nativeBoutId&&row.fightUrl===x.fightUrl&&row.result===x.result));
 }
 assert.deepEqual(p.bouts.map(x=>x.result),['win','loss','win','loss']);
});
