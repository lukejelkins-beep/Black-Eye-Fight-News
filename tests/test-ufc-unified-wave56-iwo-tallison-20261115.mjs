import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const source=read('ufc-unified-wave56-iwo-tallison-source-review-20261115.json'),ledger=read('ufc-independent-full-career-verification.json').fighters;
const approval=read('ufc-36-month-roster-approval.json'),census=read('ufc-36-month-candidates.json'),profiles=read('ufcalendar-fighter-research.json').profiles,cache=read('ufcalendar-rich-progress.json'),feed=read('ufc-feeder-bout-evidence.json').bouts;
const cases=Object.entries(source.fighters);
const history=slug=>profiles[slug].recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&!/contender series|road to ufc|\\bdwcs\\b/i.test(cache.bouts[h.boutId]?.event||''));
const gate=(slug,e)=>evaluateCareerEvidence(profiles[slug],history(slug),census.fighters.find(x=>x.slug===slug)?.lastUfcFight,approval.rosterAsOf,e,cache.bouts).independentlyVerified;
test('wave56 exact eight Octagon fights: approved cohort, Greco, native corners, winner and DWCS exclusion',()=>{
 assert.equal(approval.approvedFighters.length,783);assert.equal(source.certificationGranted,false);
 assert.equal(cases.length,2);assert.equal(new Set(cases.flatMap(([,c])=>c.bouts.map(x=>x.nativeBoutId))).size,8);
 for(const [slug,c] of cases){
  assert.ok(approval.approvedFighters.includes(slug));assert.equal(c.officialUfcCareerBoutCount,4);assert.equal(history(slug).length,4);
  const e=ledger[slug];assert.equal(e.sourceCoverageAttested,true);assert.equal(e.scope,'complete_official_ufc_career');
  assert.equal(e.bouts.length,4);assert.equal(e.officialUfcCareerBoutCount,4);
  assert.equal(e.sourceSnapshot.fightResultsBlobSha,source.pinnedSource.fightResultsBlobSha);
  assert.equal(e.fighterUrl,'https://ufcstats.com/fighter-details/'+c.ufcStatsFighterId);
  assert.equal(e.officialFighterUrl,c.officialFighterUrl);assert.deepEqual(e.verifiedNumericFighterIds,[c.nativeFighterId]);
  for(const b of c.bouts){
   const {originalOpponentNumericId:oppId,...clean}=b;assert.deepEqual(e.bouts.find(x=>x.nativeBoutId===b.nativeBoutId),clean);
   const n=cache.bouts[b.nativeBoutId];assert.equal(n.org,'ufc');assert.equal(n.status,'completed');assert.ok(Number(cache.roundDone[b.nativeBoutId])>0);
   assert.ok(Math.abs(Date.parse(n.eventDate)-Date.parse(b.date))<=86400000);
   const own=n.a.id===c.nativeFighterId?n.a:n.b.id===c.nativeFighterId?n.b:null,other=own===n.a?n.b:n.a;
   assert.equal(own.slug,slug);assert.equal(other.id,oppId);assert.equal(other.name,b.opponent);
   assert.equal(n.result.winnerId===own.id?'win':n.result.winnerId===other.id?'loss':null,b.result);
  }
  for(const f of c.sourceVerifiedExcludedFeederBouts)assert.ok(feed.some(x=>x.fighterSlug===slug&&x.boutId===f.boutId&&x.date===f.date&&x.opponent===f.opponent));
  assert.equal(gate(slug,e),true);
 }
});
test('wave56 fail-closed: incomplete source, wrong fighter ID or flipped winner',()=>{
 for(const [slug] of cases){const e=ledger[slug];assert.equal(gate(slug,{...e,bouts:e.bouts.slice(1)}),false);
 assert.equal(gate(slug,{...e,verifiedNumericFighterIds:['999999']}),false);
 assert.equal(gate(slug,{...e,bouts:e.bouts.map((b,i)=>i===0?{...b,result:b.result==='win'?'loss':'win'}:b)}),false);}
});
