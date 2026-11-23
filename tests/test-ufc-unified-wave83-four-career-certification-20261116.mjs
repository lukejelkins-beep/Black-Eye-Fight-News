import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';

const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json');
const census=read('ufc-36-month-candidates.json');
const profiles=read('ufcalendar-fighter-research.json').profiles;
const cache=read('ufcalendar-rich-progress.json');
const registry=read('ufc-independent-full-career-verification.json').fighters;
const four={
 'ibo-aslan':{id:'351',n:5,feeder:'84024'},
 'jacobe-smith':{id:'489',n:5,feeder:'84032'},
 'malcolm-wellmaker':{id:'31',n:5,feeder:'84011'},
 'bolaji-oki':{id:'257',n:6,feeder:'84168'}
};
const officialHistory=slug=>profiles[slug].recentHistory.filter(h=>
 h.source==='native'&&h.promotion==='ufc'&&h.boutId&&
 !/contender series|road to ufc|\\bdwcs\\b/i.test(cache.bouts[h.boutId]?.event||''));
const strict=(slug,proof)=>evaluateCareerEvidence(profiles[slug],officialHistory(slug),
 census.fighters.find(x=>x.slug===slug).lastUfcFight,approval.rosterAsOf,proof,cache.bouts).independentlyVerified;

test('four newly sourced UFC careers retain 21 unique official fight identities, measured rounds and separate DWCS exclusions',()=>{
 assert.equal(approval.approvedFighters.length,783);
 const urls=new Set();
 for(const [slug,want] of Object.entries(four)){
  assert.ok(approval.approvedFighters.includes(slug));
  const e=registry[slug],h=officialHistory(slug);
  assert.equal(e.sourceCoverageAttested,true);
  assert.equal(e.scope,'complete_official_ufc_career');
  assert.equal(e.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(e.officialUfcCareerBoutCount,want.n);
  assert.equal(e.bouts.length,want.n);
  assert.equal(h.length,want.n);
  assert.deepEqual(e.verifiedNumericFighterIds,[want.id]);
  assert.equal(e.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.match(e.officialFighterUrl,/^https:\/\/www\.ufc\.com\/athlete\//);
  for(const b of e.bouts){
   assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   assert.ok(!urls.has(b.fightUrl));urls.add(b.fightUrl);
   const x=cache.bouts[b.nativeBoutId];
   assert.equal(x.org,'ufc');assert.equal(x.status,'completed');
   assert.ok(Number(cache.roundDone[b.nativeBoutId])>0);
   assert.ok(Math.abs(Date.parse(x.eventDate)-Date.parse(b.date))<=86400000);
   const own=x.a.id===want.id?x.a:x.b.id===want.id?x.b:null;
   assert.ok(own);assert.equal(own.slug,slug);
   const other=own===x.a?x.b:x.a;
   assert.equal(other.name,b.opponent);
   assert.equal(b.nativeFighterId,want.id);
   assert.equal(x.result.winnerId===own.id?'win':x.result.winnerId===other.id?'loss':null,b.result);
  }
  const feeder=cache.bouts[want.feeder];
  assert.match(feeder.event,/contender series/i);
  assert.equal(e.sourceVerifiedExcludedFeederBouts.length,1);
  assert.equal(e.sourceVerifiedExcludedFeederBouts[0].nativeBoutId,want.feeder);
  assert.ok(!e.bouts.some(b=>b.nativeBoutId===want.feeder));
  assert.equal(strict(slug,e),true,'full exact Stage3 source/native gate: '+slug);
 }
 assert.equal(urls.size,21);
});
test('missing source bout, reversed winner, false fighter identity and duplicate source identity must not certify',()=>{
 for(const slug of Object.keys(four)){
  const e=registry[slug];
  assert.equal(strict(slug,{...e,bouts:e.bouts.slice(1)}),false,slug+' missing bout');
  assert.equal(strict(slug,{...e,verifiedNumericFighterIds:['999999']}),false,slug+' false fighter identity');
  assert.equal(strict(slug,{...e,bouts:e.bouts.map((b,i)=>i===0?{...b,result:b.result==='win'?'loss':'win'}:b)}),false,slug+' reversed result');
  assert.equal(strict(slug,{...e,bouts:e.bouts.map((b,i)=>i===0?{...b,fightUrl:e.bouts[1].fightUrl}:b)}),false,slug+' duplicated UFCStats fight');
 }
});
