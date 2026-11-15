import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from 'node:fs';
const rd=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const src=rd('ufc-independent-wave-20261115-lima-camilo-bolanos-source.json'),reg=rd('ufc-independent-full-career-verification.json'),cache=rd('ufcalendar-rich-progress.json'),research=rd('ufcalendar-fighter-research.json'),roster=rd('ufc-36-month-roster-approval.json');
test('source-attested Lima, Camilo and Bolanos full UFC fight lists preserve all 13 original native bout IDs, both corners, winners and measured rounds',()=>{
 assert.equal(roster.approvedFighters.length,783);assert.equal(new Set(roster.approvedFighters).size,783);
 assert.deepEqual(Object.keys(src.fighters).sort(),['felipe-lima','gaston-bolanos','matheus-camilo']);assert.equal(src.certificationGranted,false);let count=0;
 for(const[slug,e]of Object.entries(src.fighters)){
  assert.ok(roster.approvedFighters.includes(slug));const proof=reg.fighters[slug];assert.equal(proof.sourceCoverageAttested,true);assert.equal(proof.scope,'complete_official_ufc_career');
  assert.equal(proof.fighterUrl,'https://ufcstats.com/fighter-details/'+e.ufcStatsFighterId);assert.equal(proof.officialFighterUrl,e.officialFighterUrl);
  assert.equal(proof.bouts.length,e.officialUfcCareerBoutCount);assert.deepEqual(proof.verifiedNumericFighterIds,[e.nativeFighterId]);
  assert.equal(new Set(e.bouts.map(b=>b.nativeBoutId)).size,e.officialUfcCareerBoutCount);assert.equal(new Set(e.bouts.map(b=>b.fightUrl)).size,e.officialUfcCareerBoutCount);
  for(const x of e.bouts){const b=cache.bouts[x.nativeBoutId];assert.equal(b?.status,'completed');assert.equal(b?.org,'ufc');
   assert.doesNotMatch(b.event,/contender series|road to ufc|exhibition/i);assert.ok(Math.abs(Date.parse(b.eventDate)-Date.parse(x.date))<=86400000);
   const own=b.a?.id===e.nativeFighterId?b.a:b.b?.id===e.nativeFighterId?b.b:null;assert.equal(own?.slug,slug);
   const opp=own===b.a?b.b:b.a;assert.equal(opp?.name,x.opponent);assert.equal(opp?.id,x.originalOpponentNumericId);
   assert.equal(b.result.winnerId===own.id?'win':b.result.winnerId===opp.id?'loss':null,x.result);assert.ok(cache.roundDone[x.nativeBoutId]>0);
   assert.ok(research.profiles[slug]?.recentHistory.some(h=>h.boutId===x.nativeBoutId&&h.result===x.result));
   assert.ok(proof.bouts.some(y=>y.nativeBoutId===x.nativeBoutId&&y.fightUrl===x.fightUrl&&y.result===x.result));
   assert.match(x.pinnedSourceEventUrl,/^https:\/\/ufcstats\.com\/event-details\/[a-f0-9]{16}$/);count++;
  }
 }assert.equal(count,13);
});
test('complete career result chronologies and source scopes preserve the official UFC only filter',()=>{
 assert.deepEqual(reg.fighters['felipe-lima'].bouts.map(x=>x.result),['win','win','loss','win']);
 assert.deepEqual(reg.fighters['matheus-camilo'].bouts.map(x=>x.result),['loss','win','win','loss']);
 assert.deepEqual(reg.fighters['gaston-bolanos'].bouts.map(x=>x.result),['win','loss','win','loss','win']);
 for(const e of Object.values(src.fighters))assert.equal(e.sourceVerifiedExcludedFeederBouts.length,0);
});
