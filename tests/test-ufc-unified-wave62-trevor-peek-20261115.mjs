import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const source=read('ufc-unified-wave62-trevor-peek-source-review-20261115.json'),proof=read('ufc-independent-full-career-verification.json').fighters['trevor-peek'],approval=read('ufc-36-month-roster-approval.json'),census=read('ufc-36-month-candidates.json'),profiles=read('ufcalendar-fighter-research.json').profiles,cache=read('ufcalendar-rich-progress.json');
const raw=source.fighters['trevor-peek'];const norm=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const history=profiles['trevor-peek'].recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&!/contender series/i.test(cache.bouts[h.boutId]?.event||''));
const gate=e=>evaluateCareerEvidence(profiles['trevor-peek'],history,census.fighters.find(x=>x.slug==='trevor-peek')?.lastUfcFight,approval.rosterAsOf,e,cache.bouts,approval.rosterAsOf).independentlyVerified;
test('wave62: Trevor Peek six exact complete UFC source/native/corner/winner/round identities',()=>{
 assert.equal(source.certificationGranted,false);assert.equal(approval.approvedFighters.length,783);assert.ok(approval.approvedFighters.includes('trevor-peek'));
 assert.equal(history.length,6);assert.equal(proof.bouts.length,6);assert.equal(proof.officialUfcCareerBoutCount,6);
 assert.equal(proof.fighterUrl,'https://ufcstats.com/fighter-details/'+raw.ufcStatsFighterId);
 assert.equal(proof.officialFighterUrl,raw.officialFighterUrl);assert.deepEqual(proof.verifiedNumericFighterIds,[raw.nativeFighterId]);
 assert.equal(proof.sourceSnapshot.fightResultsBlobSha,source.pinnedSource.fightResultsBlobSha);
 for(const bout of raw.bouts){
  const {originalOpponentNumericId,...exact}=bout;
  assert.deepEqual(proof.bouts.find(x=>x.nativeBoutId===bout.nativeBoutId),exact);
  const b=cache.bouts[bout.nativeBoutId];assert.equal(b.org,'ufc');assert.equal(b.status,'completed');assert.equal(b.eventDate,bout.date);
  assert.ok(Number(cache.roundDone[bout.nativeBoutId])>0);
  const [own,other]=b.a.id===raw.nativeFighterId?[b.a,b.b]:[b.b,b.a];
  assert.equal(own.slug,'trevor-peek');assert.equal(String(other.id),originalOpponentNumericId);assert.equal(norm(other.name),norm(bout.opponent));
  assert.equal(b.result.winnerId===own.id?'win':'loss',bout.result);
  assert.ok(history.some(h=>h.boutId===bout.nativeBoutId&&h.date===bout.date&&h.result===bout.result));
 }
 assert.ok(/contender series/i.test(cache.bouts[raw.excludedFeederBout.nativeBoutId].event));
 assert.ok(proof.bouts.every(b=>b.nativeBoutId!=='88261'));
 assert.equal(gate(proof),true);
});
test('wave62: missing official bout, forged fighter identity or reversed result fail the strict gate',()=>{
 assert.equal(gate({...proof,bouts:proof.bouts.slice(1)}),false);
 assert.equal(gate({...proof,verifiedNumericFighterIds:['999999']}),false);
 assert.equal(gate({...proof,bouts:proof.bouts.map((b,i)=>i?b:{...b,result:b.result==='win'?'loss':'win'})}),false);
});
