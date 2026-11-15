
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const doc=read('ufc-unified-wave61-turcios-cuamba-source-review-20261115.json');
const evidence=read('ufc-independent-full-career-verification.json').fighters;
const roster=read('ufc-36-month-roster-approval.json');
const census=read('ufc-36-month-candidates.json');
const profiles=read('ufcalendar-fighter-research.json').profiles;
const native=read('ufcalendar-rich-progress.json');
const norm=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const hist=slug=>profiles[slug].recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&native.bouts[h.boutId]?.org==='ufc'&&!/contender series/i.test(native.bouts[h.boutId]?.event||''));
const gate=(slug,e)=>evaluateCareerEvidence(profiles[slug],hist(slug),census.fighters.find(x=>x.slug===slug)?.lastUfcFight,roster.rosterAsOf,e,native.bouts,roster.rosterAsOf).independentlyVerified;
test('wave61 two complete UFC careers have 12 exact unique Greco/native winner+round proofs and separately excluded DWCS',()=>{
 assert.equal(roster.approvedFighters.length,783);assert.equal(doc.certificationGranted,false);
 assert.equal(Object.keys(doc.fighters).length,2);
 assert.equal(new Set(Object.values(doc.fighters).flatMap(x=>x.bouts.map(b=>b.nativeBoutId))).size,12);
 for(const [slug,x] of Object.entries(doc.fighters)){
  assert.ok(roster.approvedFighters.includes(slug));assert.equal(hist(slug).length,6);
  const e=evidence[slug];assert.equal(e.sourceCoverageAttested,true);assert.equal(e.scope,'complete_official_ufc_career');
  assert.equal(e.officialUfcCareerBoutCount,6);assert.equal(e.bouts.length,6);
  assert.equal(e.officialFighterUrl,x.officialFighterUrl);assert.equal(e.fighterUrl,'https://ufcstats.com/fighter-details/'+x.ufcStatsFighterId);
  assert.deepEqual(e.verifiedNumericFighterIds,[x.nativeFighterId]);
  assert.equal(e.sourceSnapshot.fightResultsBlobSha,doc.pinnedSource.fightResultsBlobSha);
  for(const b of x.bouts){
   const {originalOpponentNumericId,...expected}=b;
   assert.deepEqual(e.bouts.find(y=>y.nativeBoutId===b.nativeBoutId),expected);
   const saved=native.bouts[b.nativeBoutId];assert.equal(saved.org,'ufc');assert.equal(saved.status,'completed');
   assert.equal(saved.eventDate,b.date);assert.ok(Number(native.roundDone[b.nativeBoutId])>0);
   const [own,other]=saved.a.id===x.nativeFighterId?[saved.a,saved.b]:[saved.b,saved.a];
   assert.equal(own.slug,slug);assert.equal(String(other.id),originalOpponentNumericId);
   assert.equal(norm(other.name),norm(b.opponent));
   assert.equal(saved.result.winnerId===own.id?'win':'loss',b.result);
   assert.ok(hist(slug).some(h=>h.boutId===b.nativeBoutId&&h.date===b.date&&h.result===b.result));
  }
  assert.ok(/contender series/i.test(native.bouts[x.excludedFeederBout.nativeBoutId].event));
  assert.ok(e.bouts.every(b=>b.nativeBoutId!==x.excludedFeederBout.nativeBoutId));
  assert.equal(gate(slug,e),true);
 }
});
test('wave61 exact gate fails on missing UFC fight, wrong native fighter ID or flipped outcome',()=>{
 for(const slug of Object.keys(doc.fighters)){
  const e=evidence[slug];
  assert.equal(gate(slug,{...e,bouts:e.bouts.slice(1)}),false);
  assert.equal(gate(slug,{...e,verifiedNumericFighterIds:['999999']}),false);
  assert.equal(gate(slug,{...e,bouts:e.bouts.map((b,i)=>i===0?{...b,result:b.result==='win'?'loss':'win'}:b)}),false);
 }
});
