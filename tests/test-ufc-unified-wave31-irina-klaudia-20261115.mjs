import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const roster=read('ufc-36-month-roster-approval.json'),reg=read('ufc-independent-full-career-verification.json'),cache=read('ufcalendar-rich-progress.json'),src=read('ufc-unified-wave31-irina-alekseeva-klaudia-sygula-source-review-20261115.json');
test('wave31 two complete official careers are independently mapped to eight saved corners and seven distinct native UFC fights',()=>{
 assert.equal(roster.approvedFighters.length,783);assert.deepEqual(Object.keys(src.fighters).sort(),['irina-alekseeva','klaudia-sygula']);
 let total=0;const all=new Set();
 for(const [slug,e]of Object.entries(src.fighters)){
  assert.ok(roster.approvedFighters.includes(slug));const p=reg.fighters[slug];
  assert.equal(p?.sourceCoverageAttested,true);assert.equal(p?.scope,'complete_official_ufc_career');assert.equal(p?.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+e.ufcStatsFighterId);assert.equal(p.officialFighterUrl,e.officialFighterUrl);
  assert.deepEqual(p.verifiedNumericFighterIds,[e.nativeFighterId]);assert.equal(p.bouts.length,4);assert.equal(e.bouts.length,4);
  assert.equal(new Set(e.bouts.map(x=>x.nativeBoutId)).size,4);assert.equal(new Set(e.bouts.map(x=>x.fightUrl)).size,4);
  for(const x of e.bouts){
   const native=cache.bouts[x.nativeBoutId];assert.equal(native?.org,'ufc');assert.equal(native?.status,'completed');assert.equal(native.eventDate,x.date);
   assert.ok(!/contender series|road to ufc/i.test(native.event));assert.ok(cache.roundDone[x.nativeBoutId]>0);
   const own=native.a?.id===e.nativeFighterId?native.a:native.b?.id===e.nativeFighterId?native.b:null;
   assert.equal(own?.slug,slug);const opponent=own===native.a?native.b:native.a;
   assert.equal(opponent.name,x.opponent);assert.equal(opponent.id,x.opponentNativeFighterId);
   assert.equal(native.result.winnerId===own.id?'win':native.result.winnerId===opponent.id?'loss':null,x.result);
   assert.ok(p.bouts.some(y=>y.nativeBoutId===x.nativeBoutId&&y.fightUrl===x.fightUrl&&y.result===x.result));all.add(x.nativeBoutId);total++;
  }
 }
 assert.equal(total,8);assert.equal(all.size,7);
});
test('wave31 shared Alekseeva–Sygula UFC bout has one native ID and exact identical historical source URL, opposite outcomes',()=>{
 const a=reg.fighters['irina-alekseeva'].bouts.find(x=>x.nativeBoutId==='60280');
 const b=reg.fighters['klaudia-sygula'].bouts.find(x=>x.nativeBoutId==='60280');
 assert.ok(a&&b);assert.equal(a.fightUrl,b.fightUrl);assert.equal(a.result,'loss');assert.equal(b.result,'win');
 assert.deepEqual(reg.fighters['irina-alekseeva'].bouts.map(x=>x.result),['win','loss','loss','loss']);
 assert.deepEqual(reg.fighters['klaudia-sygula'].bouts.map(x=>x.result),['loss','win','win','loss']);
});
