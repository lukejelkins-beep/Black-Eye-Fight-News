import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const source=read('ufc-unified-wave59-santos-brener-prado-source-review-20261115.json');
const register=read('ufc-independent-full-career-verification.json').fighters,roster=read('ufc-36-month-roster-approval.json'),census=read('ufc-36-month-candidates.json'),profiles=read('ufcalendar-fighter-research.json').profiles,cache=read('ufcalendar-rich-progress.json');
const normalizeName=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const history=slug=>profiles[slug].recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&!/contender series|road to ufc|\\bdwcs\\b/i.test(cache.bouts[h.boutId]?.event||''));
const gate=(slug,e)=>evaluateCareerEvidence(profiles[slug],history(slug),census.fighters.find(x=>x.slug===slug)?.lastUfcFight,roster.rosterAsOf,e,cache.bouts).independentlyVerified;
test('wave59 21 complete seven-bout UFC source/native histories: independent athlete ID, opponent/corner/winner/date/round proof',()=>{
 assert.equal(source.certificationGranted,false);assert.equal(Object.keys(source.fighters).length,3);
 assert.equal(new Set(Object.values(source.fighters).flatMap(x=>x.bouts.map(b=>b.nativeBoutId))).size,21);
 for(const [slug,x] of Object.entries(source.fighters)){
  assert.ok(roster.approvedFighters.includes(slug));assert.equal(x.officialUfcCareerBoutCount,7);assert.equal(history(slug).length,7);
  const e=register[slug];assert.equal(e.sourceCoverageAttested,true);assert.equal(e.scope,'complete_official_ufc_career');assert.equal(e.bouts.length,7);
  assert.equal(e.fighterUrl,'https://ufcstats.com/fighter-details/'+x.ufcStatsFighterId);assert.equal(e.officialFighterUrl,x.officialFighterUrl);
  assert.equal(e.sourceSnapshot.fightResultsBlobSha,source.pinnedSource.fightResultsBlobSha);assert.deepEqual(e.verifiedNumericFighterIds,[x.nativeFighterId]);
  for(const b of x.bouts){const {originalOpponentNumericId:otherId,...clean}=b;
   assert.deepEqual(e.bouts.find(y=>y.nativeBoutId===b.nativeBoutId),clean);
   const n=cache.bouts[b.nativeBoutId];assert.equal(n.org,'ufc');assert.equal(n.status,'completed');
   assert.ok(Number(cache.roundDone[b.nativeBoutId])>0);assert.ok(Math.abs(Date.parse(n.eventDate)-Date.parse(b.date))<=86400000);
   const [own,other]=n.a.id===x.nativeFighterId?[n.a,n.b]:[n.b,n.a];assert.equal(own.slug,slug);assert.equal(other.id,otherId);assert.equal(normalizeName(other.name),normalizeName(b.opponent));
   assert.equal(n.result.winnerId===own.id?'win':n.result.winnerId===other.id?'loss':null,b.result);
  }
  assert.equal(gate(slug,e),true);
 }
});
test('wave59 strict gate fails on omitted bout, fabricated fighter ID and flipped historical winner',()=>{
 for(const slug of Object.keys(source.fighters)){const e=register[slug];
  assert.equal(gate(slug,{...e,bouts:e.bouts.slice(1)}),false);
  assert.equal(gate(slug,{...e,verifiedNumericFighterIds:['999999']}),false);
  assert.equal(gate(slug,{...e,bouts:e.bouts.map((b,i)=>i===0?{...b,result:b.result==='win'?'loss':'win'}:b)}),false);
 }
});
