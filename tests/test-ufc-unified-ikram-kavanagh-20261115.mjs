import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const source=read('ufc-unified-ikram-kavanagh-source-review-20261115.json');
const ledger=read('ufc-independent-full-career-verification.json').fighters;
const approval=read('ufc-36-month-roster-approval.json');
const census=read('ufc-36-month-candidates.json');
const profiles=read('ufcalendar-fighter-research.json').profiles;
const cache=read('ufcalendar-rich-progress.json');
const cases=Object.entries(source.fighters);
const history=slug=>profiles[slug].recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&!/contender series|road to ufc|\\bdwcs\\b/i.test(cache.bouts[h.boutId]?.event||''));
const gate=(slug,e)=>evaluateCareerEvidence(profiles[slug],history(slug),census.fighters.find(x=>x.slug===slug)?.lastUfcFight,approval.rosterAsOf,e,cache.bouts).independentlyVerified;
test('Ikram and Loneer: 12 independently sourced Octagon fights reconcile to native corners and measured rounds',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(source.certificationGranted,false);
 assert.equal(cases.length,2);
 assert.equal(new Set(cases.flatMap(([,v])=>v.bouts.map(x=>x.nativeBoutId))).size,12);
 assert.equal(new Set(cases.flatMap(([,v])=>v.bouts.map(x=>x.fightUrl))).size,12);
 for(const [slug,v] of cases){
  assert.ok(approval.approvedFighters.includes(slug));
  assert.equal(v.officialUfcCareerBoutCount,6);
  assert.equal(history(slug).length,6);
  const e=ledger[slug];assert.ok(e);
  assert.equal(e.sourceCoverageAttested,true);
  assert.equal(e.scope,'complete_official_ufc_career');
  assert.equal(e.officialUfcCareerBoutCount,6);
  assert.equal(e.bouts.length,6);
  assert.deepEqual(e.verifiedNumericFighterIds,[v.nativeFighterId]);
  assert.equal(e.fighterUrl,'https://ufcstats.com/fighter-details/'+v.ufcStatsFighterId);
  assert.equal(e.officialFighterUrl,v.officialFighterUrl);
  assert.equal(e.sourceSnapshot.fightResultsBlobSha,source.pinnedSource.fightResultsBlobSha);
  for(const b of v.bouts){
   const {originalOpponentNumericId:oppId,...rest}=b;
   assert.deepEqual(e.bouts.find(x=>x.nativeBoutId===b.nativeBoutId),rest);
   const n=cache.bouts[b.nativeBoutId];
   assert.equal(n.org,'ufc');assert.equal(n.status,'completed');
   assert.ok(Number(cache.roundDone[b.nativeBoutId])>0);
   assert.ok(Math.abs(Date.parse(b.date)-Date.parse(n.eventDate))<=86400000);
   const own=n.a.id===v.nativeFighterId?n.a:n.b.id===v.nativeFighterId?n.b:null;
   assert.ok(own);assert.equal(own.slug,slug);
   const other=own===n.a?n.b:n.a;assert.equal(other.id,oppId);
   assert.equal(other.name,b.opponent);
   assert.equal(n.result.winnerId===own.id?'win':n.result.winnerId===other.id?'loss':null,b.result);
  }
  assert.equal(v.sourceVerifiedExcludedFeederBouts.length,1);
  for(const f of v.sourceVerifiedExcludedFeederBouts){
   assert.match(cache.bouts[f.boutId].event,/contender series/i);
   assert.ok(!history(slug).some(x=>x.boutId===f.boutId));
  }
  assert.equal(gate(slug,e),true);
 }
});
test('Ikram and Loneer fail closed on missing bout, invented native fighter ID and inverted winner',()=>{
 for(const [slug] of cases){
  const e=ledger[slug];
  assert.equal(gate(slug,{...e,bouts:e.bouts.slice(1)}),false);
  assert.equal(gate(slug,{...e,verifiedNumericFighterIds:['999999']}),false);
  assert.equal(gate(slug,{...e,bouts:e.bouts.map((b,i)=>i===0?{...b,result:b.result==='win'?'loss':'win'}:b)}),false);
 }
});
