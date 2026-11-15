import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=x=>JSON.parse(readFileSync(new URL('../data/'+x,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json'),census=read('ufc-36-month-candidates.json'),cache=read('ufcalendar-rich-progress.json'),profiles=read('ufcalendar-fighter-research.json').profiles,register=read('ufc-independent-full-career-verification.json').fighters,source=read('ufc-unified-wave54-miller-matsumoto-source-review-20261115.json'),metrics=read('ufc-postfight-metrics.json').fighters;
const history=s=>profiles[s].recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&h.date<=census.asOf);
const strict=(s,p)=>evaluateCareerEvidence(profiles[s],history(s),census.fighters.find(x=>x.slug===s)?.lastUfcFight,approval.rosterAsOf,p,cache.bouts).independentlyVerified;
test('wave54: 12 original official full-career UFC fights independently reconciled across sources, native IDs and rounds',()=>{
 assert.equal(approval.approvedFighters.length,783);assert.equal(source.certificationGranted,false);
 const cases=Object.entries(source.fighters);assert.equal(cases.length,2);
 assert.equal(new Set(cases.flatMap(([s,c])=>c.bouts.map(x=>x.nativeBoutId))).size,12);
 for(const [slug,c] of cases){
  assert.ok(approval.approvedFighters.includes(slug));const p=register[slug];
  assert.equal(p.sourceCoverageAttested,true);assert.equal(p.scope,'complete_official_ufc_career');assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.officialUfcCareerBoutCount,6);assert.equal(p.bouts.length,6);assert.equal(metrics[slug].trackedBouts,6);
  assert.deepEqual(p.verifiedNumericFighterIds,[c.nativeFighterId]);assert.equal(p.sourceSnapshot.sourceCommit,source.pinnedSource.sourceCommit);
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+c.ufcStatsFighterId);assert.equal(p.officialFighterUrl,c.officialFighterUrl);
  assert.equal(history(slug).length,6+c.sourceVerifiedExcludedFeederBouts.length);
  for(const b of c.bouts){
   const {originalOpponentNumericId,...expected}=b;assert.deepEqual(p.bouts.find(x=>x.nativeBoutId===b.nativeBoutId),expected);
   const n=cache.bouts[b.nativeBoutId];assert.equal(n?.org,'ufc');assert.equal(n?.status,'completed');assert.ok(Number(cache.roundDone[b.nativeBoutId])>0);
   assert.ok(Math.abs(Date.parse(n.eventDate)-Date.parse(b.date))<=86400000);
   const own=[n.a,n.b].find(x=>x?.id===c.nativeFighterId),opp=own===n.a?n.b:n.a;
   assert.equal(own.slug,slug);assert.equal(opp.id,originalOpponentNumericId);assert.equal(opp.name,b.opponent);
   assert.equal(n.result.winnerId===own.id?'win':n.result.winnerId===opp.id?'loss':null,b.result);
  }
  assert.equal(strict(slug,p),true,'strict source-to-native career proof '+slug);
 }
});
test('wave54: DWCS/TUF distinctions and missing/mutated evidence fail closed',()=>{
 assert.equal(source.fighters['juliana-miller'].sourceVerifiedExcludedFeederBouts.length,0);
 const e=source.fighters['jean-matsumoto'].sourceVerifiedExcludedFeederBouts;
 assert.equal(e.length,1);assert.equal(e[0].nativeBoutId,'84123');assert.match(cache.bouts['84123'].event,/Contender Series/);
 for(const slug of Object.keys(source.fighters)){
  const p=register[slug];assert.equal(strict(slug,{...p,bouts:p.bouts.slice(1)}),false);
  assert.equal(strict(slug,{...p,verifiedNumericFighterIds:['9999999']}),false);
  assert.equal(strict(slug,{...p,bouts:p.bouts.map((b,i)=>i===0?{...b,result:b.result==='win'?'loss':'win'}:b)}),false);
 }
});
