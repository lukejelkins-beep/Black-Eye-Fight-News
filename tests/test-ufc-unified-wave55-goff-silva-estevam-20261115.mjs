import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const source=read('ufc-unified-wave55-goff-silva-estevam-source-review-20261115.json');
const register=read('ufc-independent-full-career-verification.json').fighters;
const approval=read('ufc-36-month-roster-approval.json');
const census=read('ufc-36-month-candidates.json');
const profiles=read('ufcalendar-fighter-research.json').profiles;
const cache=read('ufcalendar-rich-progress.json');
const feeder=read('ufc-feeder-bout-evidence.json').bouts;
const candidates=Object.entries(source.fighters);
const history=slug=>profiles[slug].recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&& !/contender series|\\bdwcs\\b|road to ufc/i.test(cache.bouts[h.boutId]?.event||''));
const proof=(slug,p)=>evaluateCareerEvidence(profiles[slug],history(slug),census.fighters.find(x=>x.slug===slug)?.lastUfcFight,approval.rosterAsOf,p,cache.bouts).independentlyVerified;
test('wave55 verifies all 12 unique official UFC fight IDs and retains exact three DWCS exclusions',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(source.certificationGranted,false);
 assert.equal(candidates.length,3);
 assert.equal(new Set(candidates.flatMap(([,c])=>c.bouts.map(b=>b.nativeBoutId))).size,12);
 for(const [slug,c] of candidates){
  assert.ok(approval.approvedFighters.includes(slug));
  assert.equal(c.bouts.length,4);
  assert.equal(history(slug).length,4);
  const e=register[slug];assert.equal(e.sourceCoverageAttested,true);
  assert.equal(e.scope,'complete_official_ufc_career');
  assert.equal(e.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(e.officialUfcCareerBoutCount,4);
  assert.equal(e.bouts.length,4);
  assert.equal(e.sourceSnapshot.fightResultsBlobSha,source.pinnedSource.fightResultsBlobSha);
  assert.equal(e.fighterUrl,'https://ufcstats.com/fighter-details/'+c.ufcStatsFighterId);
  assert.equal(e.officialFighterUrl,c.officialFighterUrl);
  assert.deepEqual(e.verifiedNumericFighterIds,[c.nativeFighterId]);
  for(const b of c.bouts){
   const {originalOpponentNumericId:opp,...cert}=b;
   assert.deepEqual(e.bouts.find(x=>x.nativeBoutId===b.nativeBoutId),cert);
   const x=cache.bouts[b.nativeBoutId];assert.equal(x.org,'ufc');assert.equal(x.status,'completed');
   assert.ok(Number(cache.roundDone[b.nativeBoutId])>0);
   assert.ok(Math.abs(Date.parse(x.eventDate)-Date.parse(b.date))<=86400000);
   const own=x.a.id===c.nativeFighterId?x.a:x.b.id===c.nativeFighterId?x.b:null;
   const other=own===x.a?x.b:x.a;
   assert.equal(own.slug,slug);assert.equal(other.id,opp);assert.equal(other.name,b.opponent);
   assert.equal(x.result.winnerId===own.id?'win':x.result.winnerId===other.id?'loss':null,b.result);
  }
  for(const f of c.sourceVerifiedExcludedFeederBouts){
   assert.ok(feeder.some(x=>x.fighterSlug===slug&&x.boutId===f.boutId&&x.date===f.date&&x.opponent===f.opponent));
   assert.match(cache.bouts[f.boutId].event,/Contender Series/);
  }
  assert.equal(proof(slug,e),true,'strict source/native exhaustive gate: '+slug);
 }
});
test('wave55 rejects missing official bouts, swapped winner, or fake numeric fighter ID',()=>{
 for(const [slug] of candidates){
  const e=register[slug];
  assert.equal(proof(slug,{...e,bouts:e.bouts.slice(1)}),false);
  assert.equal(proof(slug,{...e,verifiedNumericFighterIds:['999999']}),false);
  assert.equal(proof(slug,{...e,bouts:e.bouts.map((b,i)=>i===0?{...b,result:b.result==='win'?'loss':'win'}:b)}),false);
 }
});
