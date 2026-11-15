import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const roster=read('ufc-36-month-roster-approval.json'),reg=read('ufc-independent-full-career-verification.json'),src=read('ufc-unified-wave30-fernie-fernando-ernesta-source-review-20261115.json'),cache=read('ufcalendar-rich-progress.json');
test('wave30 protects 12 source-pinned official UFC bouts with native paired corners, one source duplicate and 100% measured rounds',()=>{
 assert.equal(roster.approvedFighters.length,783);
 assert.deepEqual(Object.keys(src.fighters).sort(),['ernesta-kareckaite','fernando-padilla','fernie-garcia']);
 let count=0;for(const[slug,e]of Object.entries(src.fighters)){
  assert.ok(roster.approvedFighters.includes(slug));const p=reg.fighters[slug];assert.equal(p.sourceCoverageAttested,true);
  assert.equal(p.scope,'complete_official_ufc_career');assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+e.ufcStatsFighterId);assert.equal(p.officialFighterUrl,e.officialFighterUrl);
  assert.deepEqual(p.verifiedNumericFighterIds,[e.nativeFighterId]);assert.equal(p.bouts.length,4);
  assert.equal(new Set(p.bouts.map(x=>x.nativeBoutId)).size,4);
  assert.equal(new Set(p.bouts.map(x=>x.fightUrl)).size,4);
  for(const b of e.bouts){
   const n=cache.bouts[b.nativeBoutId];assert.equal(n?.org,'ufc');assert.equal(n?.status,'completed');
   assert.ok(Math.abs(Date.parse(n.eventDate)-Date.parse(b.date))<=86400000);
   assert.ok(!/contender series|road to ufc/i.test(n.event));
   const own=n.a?.id===e.nativeFighterId?n.a:n.b?.id===e.nativeFighterId?n.b:null;
   assert.equal(own?.slug,slug);const other=own===n.a?n.b:n.a;assert.equal(other?.name,b.opponent);assert.equal(other?.id,b.originalOpponentNumericId);
   const result=n.result?.method==='draw'&&n.result?.winnerId==null?'draw':n.result?.winnerId===own.id?'win':n.result?.winnerId===other.id?'loss':null;
   assert.equal(result,b.result);assert.ok(cache.roundDone[b.nativeBoutId]>0);
   assert.ok(p.bouts.some(row=>row.nativeBoutId===b.nativeBoutId&&row.fightUrl===b.fightUrl&&row.result===b.result));count++;
  }
 }
 assert.equal(count,12);
 assert.equal(src.fighters['fernando-padilla'].bouts.reduce((s,b)=>s+b.sourceDuplicateRowsDeduplicated,0),1);
});
test('wave30 retains true majority draw and independently excluded DWCS feeder without adding extra UFC fights',()=>{
 const p=reg.fighters['ernesta-kareckaite'];
 assert.deepEqual(p.bouts.map(b=>b.result),['loss','win','loss','draw']);
 const d=cache.bouts['93273'];assert.equal(d.result.method,'draw');assert.equal(d.result.winnerId,null);
 const x=src.fighters['ernesta-kareckaite'].sourceVerifiedExcludedFeederBouts;
 assert.equal(x.length,1);assert.equal(x[0].nativeBoutId,'83950');
 assert.match(cache.bouts[x[0].nativeBoutId].event,/contender series/i);
 assert.ok(!p.bouts.some(b=>b.nativeBoutId===x[0].nativeBoutId));
 assert.deepEqual(reg.fighters['fernie-garcia'].bouts.map(b=>b.result),['loss','loss','loss','loss']);
 assert.deepEqual(reg.fighters['fernando-padilla'].bouts.map(b=>b.result),['win','loss','win','loss']);
});
