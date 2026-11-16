import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const load=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url),'utf8'));
const approval=load('ufc-36-month-roster-approval.json'),census=load('ufc-36-month-candidates.json');
const profiles=load('ufcalendar-fighter-research.json').profiles,cache=load('ufcalendar-rich-progress.json');
const register=load('ufc-independent-full-career-verification.json').fighters;
const cases={"bruno-lopes":{"n":4,"feeder":["83990","88266"]},"marquel-mederos":{"n":5,"feeder":["84101"]},"michael-aswell-jr":{"n":5,"feeder":["84009"]}};
const history=slug=>profiles[slug].recentHistory.filter(h=>h.source==='native'&&h.promotion==='ufc'&&h.boutId&&!/contender series|road to ufc|dwcs/i.test(cache.bouts[h.boutId]?.event||''));
const strict=(slug,proof)=>evaluateCareerEvidence(profiles[slug],history(slug),census.fighters.find(x=>x.slug===slug).lastUfcFight,approval.rosterAsOf,proof,cache.bouts).independentlyVerified;
test('wave85 three new exhaustive careers retain fourteen independent UFC fight URLs and four explicitly excluded DWCS bouts',()=>{
 assert.equal(approval.approvedFighters.length,783);const urls=new Set();
 for(const [slug,x] of Object.entries(cases)){
  const p=register[slug];assert.equal(p.sourceCoverageAttested,true);assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.officialUfcCareerBoutCount,x.n);assert.equal(p.bouts.length,x.n);assert.equal(history(slug).length,x.n);
  assert.deepEqual(p.sourceVerifiedExcludedFeederBouts.map(b=>b.nativeBoutId).sort(),x.feeder.slice().sort());
  for(const f of p.sourceVerifiedExcludedFeederBouts){
    assert.match(cache.bouts[f.nativeBoutId].event,/Contender Series/);
    assert.equal(history(slug).some(h=>h.boutId===f.nativeBoutId),false);
  }
  for(const b of p.bouts){
    assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[0-9a-f]{16}$/);
    assert.equal(urls.has(b.fightUrl),false);urls.add(b.fightUrl);
    assert.ok(Number(cache.roundDone[b.nativeBoutId])>0);
    const own=cache.bouts[b.nativeBoutId];assert.ok([own.a.id,own.b.id].includes(b.nativeFighterId));
  }
  assert.equal(strict(slug,p),true,'strict source/full UFC career gate '+slug);
 }
 assert.equal(urls.size,14);
});
test('wave85 strict gate refuses omitted contest, reversed outcome or fictitious native athlete identity',()=>{
 for(const slug of Object.keys(cases)){
 const p=register[slug];
 assert.equal(strict(slug,{...p,bouts:p.bouts.slice(1)}),false);
 assert.equal(strict(slug,{...p,verifiedNumericFighterIds:['999999']}),false);
 const tampered=p.bouts.map((b,i)=>i===0?{...b,result:b.result==='win'?'loss':'win'}:b);
 assert.equal(strict(slug,{...p,bouts:tampered}),false);
 }
});
test('Mederos 2026 majority draw survives strict source/native/corner corroboration unchanged',()=>{
 const p=register['marquel-mederos'],d=p.bouts.filter(x=>x.result==='draw');
 assert.equal(d.length,1);assert.equal(d[0].nativeBoutId,'65994');assert.equal(cache.bouts['65994'].result.method,'draw');
 assert.equal(strict('marquel-mederos',p),true);
});
