import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const source=read('ufc-unified-wave60-parkin-elliott-baghdasaryan-source-review-20261115.json');
const evidence=read('ufc-independent-full-career-verification.json').fighters,approval=read('ufc-36-month-roster-approval.json'),census=read('ufc-36-month-candidates.json'),profiles=read('ufcalendar-fighter-research.json').profiles,cache=read('ufcalendar-rich-progress.json');
const norm=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const hist=slug=>profiles[slug].recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&cache.bouts[h.boutId]?.org==='ufc'&&!/contender series/i.test(cache.bouts[h.boutId]?.event||''));
const gate=(slug,e)=>evaluateCareerEvidence(profiles[slug],hist(slug),census.fighters.find(x=>x.slug===slug)?.lastUfcFight,approval.rosterAsOf,e,cache.bouts,approval.rosterAsOf).independentlyVerified;
test('wave60: three complete UFC careers have 18 pinned Greco/native/result/round proofs without duplicates',()=>{
 assert.equal(source.certificationGranted,false);assert.equal(approval.approvedFighters.length,783);
 assert.equal(Object.keys(source.fighters).length,3);
 assert.equal(new Set(Object.values(source.fighters).flatMap(x=>x.bouts.map(b=>b.nativeBoutId))).size,18);
 for(const [slug,x] of Object.entries(source.fighters)){
  assert.ok(approval.approvedFighters.includes(slug));assert.equal(hist(slug).length,6);
  const e=evidence[slug];assert.equal(e.scope,'complete_official_ufc_career');assert.equal(e.sourceCoverageAttested,true);
  assert.equal(e.bouts.length,6);assert.equal(e.officialUfcCareerBoutCount,6);
  assert.equal(e.fighterUrl,'https://ufcstats.com/fighter-details/'+x.ufcStatsFighterId);
  assert.equal(e.officialFighterUrl,x.officialFighterUrl);assert.deepEqual(e.verifiedNumericFighterIds,[x.nativeFighterId]);
  assert.equal(e.sourceSnapshot.fightResultsBlobSha,source.pinnedSource.fightResultsBlobSha);
  for(const b of x.bouts){
   const {originalOpponentNumericId,...strict}=b;
   assert.deepEqual(e.bouts.find(y=>y.nativeBoutId===b.nativeBoutId),strict);
   const saved=cache.bouts[b.nativeBoutId];
   assert.equal(saved.org,'ufc');assert.equal(saved.status,'completed');assert.equal(saved.eventDate,b.date);
   assert.ok(Number(cache.roundDone[b.nativeBoutId])>0);
   const [own,other]=saved.a.id===x.nativeFighterId?[saved.a,saved.b]:[saved.b,saved.a];
   assert.equal(own.slug,slug);assert.equal(String(other.id),originalOpponentNumericId);
   assert.equal(norm(other.name),norm(b.opponent));
   assert.equal(saved.result.winnerId===own.id?'win':'loss',b.result);
   assert.ok(hist(slug).some(h=>h.boutId===b.nativeBoutId&&h.result===b.result&&h.date===b.date));
  }
  assert.ok(/contender series/i.test(cache.bouts[x.excludedFeederBout.nativeBoutId].event));
  assert.ok(e.bouts.every(b=>b.nativeBoutId!==x.excludedFeederBout.nativeBoutId));
  assert.equal(gate(slug,e),true);
 }
});
test('wave60: strict source gate rejects omitted bout, forged native identity and inverted outcome',()=>{
 for(const slug of Object.keys(source.fighters)){
  const e=evidence[slug];
  assert.equal(gate(slug,{...e,bouts:e.bouts.slice(1)}),false);
  assert.equal(gate(slug,{...e,verifiedNumericFighterIds:['999999']}),false);
  assert.equal(gate(slug,{...e,bouts:e.bouts.map((b,i)=>i===0?{...b,result:b.result==='win'?'loss':'win'}:b)}),false);
 }
});
