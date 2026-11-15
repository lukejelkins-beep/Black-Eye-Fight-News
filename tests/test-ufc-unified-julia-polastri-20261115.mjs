import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const src=read('ufc-unified-julia-polastri-source-review-20261115.json');
const e=read('ufc-independent-full-career-verification.json').fighters['julia-polastri'];
const approval=read('ufc-36-month-roster-approval.json'),census=read('ufc-36-month-candidates.json');
const profile=read('ufcalendar-fighter-research.json').profiles['julia-polastri'];
const cache=read('ufcalendar-rich-progress.json'),v=src.fighters['julia-polastri'];
const history=()=>profile.recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&!/contender series|road to ufc|\\bdwcs\\b/i.test(cache.bouts[h.boutId]?.event||''));
const gate=x=>evaluateCareerEvidence(profile,history(),census.fighters.find(x=>x.slug==='julia-polastri')?.lastUfcFight,approval.rosterAsOf,x,cache.bouts).independentlyVerified;
test('Julia Polastri six full UFC bouts and two precisely excluded DWCS bouts pass native and independent source checks',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.ok(approval.approvedFighters.includes('julia-polastri'));
 assert.equal(src.certificationGranted,false);
 assert.equal(v.officialUfcCareerBoutCount,6);
 assert.equal(history().length,6);
 assert.equal(e.sourceCoverageAttested,true);
 assert.equal(e.scope,'complete_official_ufc_career');
 assert.equal(e.officialUfcCareerBoutCount,6);
 assert.equal(e.bouts.length,6);
 assert.deepEqual(e.verifiedNumericFighterIds,['176']);
 assert.equal(e.fighterUrl,'https://ufcstats.com/fighter-details/'+v.ufcStatsFighterId);
 assert.equal(e.sourceSnapshot.fightResultsBlobSha,src.pinnedSource.fightResultsBlobSha);
 assert.equal(new Set(v.bouts.map(x=>x.fightUrl)).size,6);
 for(const b of v.bouts){
  const {originalOpponentNumericId:oppId,...x}=b;
  assert.deepEqual(e.bouts.find(y=>y.nativeBoutId===b.nativeBoutId),x);
  const n=cache.bouts[b.nativeBoutId];
  assert.equal(n.org,'ufc');assert.equal(n.status,'completed');
  assert.ok(Number(cache.roundDone[b.nativeBoutId])>0);
  assert.ok(Math.abs(Date.parse(n.eventDate)-Date.parse(b.date))<=86400000);
  const me=n.a.id==='176'?n.a:n.b.id==='176'?n.b:null;
  assert.ok(me);assert.equal(me.slug,'julia-polastri');
  const other=me===n.a?n.b:n.a;
  assert.equal(other.id,oppId);assert.equal(other.name,b.opponent);
  assert.equal(n.result.winnerId===me.id?'win':n.result.winnerId===other.id?'loss':null,b.result);
 }
 assert.equal(v.sourceVerifiedExcludedFeederBouts.length,2);
 for(const f of v.sourceVerifiedExcludedFeederBouts){
  assert.match(cache.bouts[f.boutId].event,/contender series/i);
  assert.ok(!history().some(x=>x.boutId===f.boutId));
 }
 assert.equal(v.sourceVerifiedOpponentNameVariants.length,2);
 assert.equal(gate(e),true);
});
test('Julia fail-closed: missing native fight, unsupported fighter ID and inverted final result',()=>{
 assert.equal(gate({...e,bouts:e.bouts.slice(1)}),false);
 assert.equal(gate({...e,verifiedNumericFighterIds:['999999']}),false);
 assert.equal(gate({...e,bouts:e.bouts.map((b,i)=>i===0?{...b,result:b.result==='win'?'loss':'win'}:b)}),false);
});
