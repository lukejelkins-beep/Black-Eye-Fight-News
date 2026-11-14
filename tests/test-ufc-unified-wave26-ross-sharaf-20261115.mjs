import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p, import.meta.url),'utf8'));
const roster=read('data/ufc-36-month-roster-approval.json'),reg=read('data/ufc-independent-full-career-verification.json'),cache=read('data/ufcalendar-rich-progress.json'),src=read('data/ufc-unified-wave26-ross-sharaf-source-review-20261115.json');
test('wave26: Ross and Sharaf source-complete 3-bout UFC careers match independent pinned identities, outcomes and all native corners',()=>{
 assert.equal(roster.approvedFighters.length,783);
 assert.deepEqual(Object.keys(src.fighters).sort(),['sean-sharaf','shannon-ross']);
 let matched=0;for(const [slug,expected] of Object.entries(src.fighters)){
  assert.ok(roster.approvedFighters.includes(slug)); const p=reg.fighters[slug];
  assert.equal(p?.sourceCoverageAttested,true);assert.equal(p?.scope,'complete_official_ufc_career');
  assert.equal(p?.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.officialFighterUrl,expected.officialFighterUrl);
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+expected.ufcStatsFighterId);
  assert.deepEqual(p.verifiedNumericFighterIds,[expected.nativeFighterId]);
  assert.equal(p.officialUfcCareerBoutCount,3);
  assert.deepEqual(p.bouts,expected.bouts.map(({originalOpponentNumericId,pinnedSourceEvent,pinnedSourceEventUrl,...core})=>core));
  assert.equal(new Set(p.bouts.map(b=>b.fightUrl)).size,3);
  assert.equal(new Set(p.bouts.map(b=>b.nativeBoutId)).size,3);
  for(const b of expected.bouts){const n=cache.bouts[b.nativeBoutId];assert.equal(n?.org,'ufc');assert.equal(n?.status,'completed');
   const own=n.a?.id===expected.nativeFighterId?n.a:n.b?.id===expected.nativeFighterId?n.b:null;
   assert.ok(own&&own.slug===slug);const other=own===n.a?n.b:n.a;
   assert.equal(other.id,b.originalOpponentNumericId);assert.equal(other.name,b.opponent);
   assert.equal(n.result.winnerId===own.id?'win':n.result.winnerId===other.id?'loss':null,b.result);
   assert.ok(Math.abs(Date.parse(n.eventDate)-Date.parse(b.date))<=86400000);
   assert.ok(cache.roundDone[b.nativeBoutId]>0);assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[0-9a-f]+$/);
   assert.match(b.pinnedSourceEventUrl,/^https:\/\/ufcstats\.com\/event-details\/[0-9a-f]+$/);matched++;
  }
 }
 assert.equal(matched,6);
});
test('wave26: Ross DWCS feeder never counted as UFC bout, official losses override misleading tiles and Sean date shift stays safe',()=>{
 const ross=reg.fighters['shannon-ross'],sean=reg.fighters['sean-sharaf'];
 assert.deepEqual(ross.bouts.map(b=>b.result),['loss','loss','loss']);
 assert.ok(ross.sourceVerifiedExcludedFeederBouts.some(b=>b.opponent==='Vinicius Salvador'&&b.result==='loss'&&b.date==='2022-08-02'&&b.officialSourceUrl.includes('ufc.com')));
 assert.ok(!ross.bouts.some(b=>b.opponent==='Vinicius Salvador'));
 assert.deepEqual(sean.bouts.map(b=>b.result),['loss','loss','win']);
 assert.equal(sean.bouts.find(b=>b.opponent==='Steven Asplund').date,'2025-12-13');
 assert.equal(cache.bouts['60655'].eventDate,'2025-12-14');
});
