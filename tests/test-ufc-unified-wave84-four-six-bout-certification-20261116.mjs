import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json');
const census=read('ufc-36-month-candidates.json');
const profiles=read('ufcalendar-fighter-research.json').profiles;
const cache=read('ufcalendar-rich-progress.json');
const cert=read('ufc-independent-full-career-verification.json').fighters;
const cases={'ateba-gautier':['11','83826'],'dione-barbosa':['583','88270'],'eduarda-moura':['493','84026'],'hyder-amil':['119','84025']};
const history=slug=>profiles[slug].recentHistory.filter(h=>h.source==='native'&&h.promotion==='ufc'&&h.boutId&&!/contender series|road to ufc|\bdwcs\b/i.test(cache.bouts[h.boutId]?.event||''));
const gate=(slug,p)=>evaluateCareerEvidence(profiles[slug],history(slug),census.fighters.find(x=>x.slug===slug).lastUfcFight,approval.rosterAsOf,p,cache.bouts).independentlyVerified;
test('wave84 four full six-bout careers match all 24 UFCStats identities, corners, outcomes, rounds and independent DWCS exclusions',()=>{
 assert.equal(approval.approvedFighters.length,783);
 const urls=new Set();
 for(const [slug,[id,feeder]] of Object.entries(cases)){
  assert.ok(approval.approvedFighters.includes(slug));
  const p=cert[slug],h=history(slug);
  assert.equal(p.sourceCoverageAttested,true);assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.bouts.length,6);assert.equal(h.length,6);assert.equal(p.officialUfcCareerBoutCount,6);
  assert.deepEqual(p.verifiedNumericFighterIds,[id]);
  assert.equal(p.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(p.officialFighterUrl,'https://www.ufc.com/athlete/'+slug);
  for(const b of p.bouts){
   assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   assert.ok(!urls.has(b.fightUrl));urls.add(b.fightUrl);
   const x=cache.bouts[b.nativeBoutId];
   assert.equal(x.org,'ufc');assert.equal(x.status,'completed');assert.ok(Number(cache.roundDone[b.nativeBoutId])>0);
   assert.ok(Math.abs(Date.parse(x.eventDate)-Date.parse(b.date))<=86400000);
   const own=x.a.id===id?x.a:x.b.id===id?x.b:null;
   assert.ok(own);assert.equal(own.slug,slug);
   const other=own===x.a?x.b:x.a;
   assert.equal(other.name,b.opponent);assert.equal(b.nativeFighterId,id);
   assert.equal(x.result.winnerId===own.id?'win':x.result.winnerId===other.id?'loss':null,b.result);
  }
  assert.equal(p.sourceVerifiedExcludedFeederBouts.length,1);
  assert.equal(p.sourceVerifiedExcludedFeederBouts[0].nativeBoutId,feeder);
  assert.match(cache.bouts[feeder].event,/contender series/i);
  assert.ok(!p.bouts.some(b=>b.nativeBoutId===feeder));
  assert.equal(gate(slug,p),true,slug+' strict Stage3 career gate');
 }
 assert.equal(urls.size,24);
});
test('wave84 altered identity, omitted fight, wrong result or repeated source ID are always blocked',()=>{
 for(const slug of Object.keys(cases)){
  const p=cert[slug];
  assert.equal(gate(slug,{...p,bouts:p.bouts.slice(1)}),false);
  assert.equal(gate(slug,{...p,verifiedNumericFighterIds:['999999']}),false);
  assert.equal(gate(slug,{...p,bouts:p.bouts.map((b,i)=>i===0?{...b,result:b.result==='win'?'loss':'win'}:b)}),false);
  assert.equal(gate(slug,{...p,bouts:p.bouts.map((b,i)=>i===0?{...b,fightUrl:p.bouts[1].fightUrl}:b)}),false);
 }
});
