import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url),'utf8'));
const evidence=read('ufc-unified-wave66-judice-pulyaev-source-review-20261115.json');
const registry=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const cache=read('ufcalendar-rich-progress.json');
const approval=read('ufc-36-month-roster-approval.json');
const census=read('ufc-36-month-candidates.json');
const targets={
  "carli-judice": {
    "n": "454",
    "urls": {
      "60367": "a8f8245096eaf0cd",
      "60672": "6e78d874097a3d22",
      "60816": "a602c68147b752b2",
      "61061": "19ef5890b20f903a",
      "82992": "a4b3becc0cc394d7"
    },
    "feeders": [
      "83950"
    ]
  },
  "andrey-pulyaev": {
    "n": "334",
    "urls": {
      "60317": "8af2b589d5e9c1ae",
      "60642": "33be2456161c14c3",
      "60760": "b3c695728e177fd4",
      "66368": "5e7f4ba1210f433d",
      "83727": "31b85cd63fb291ed"
    },
    "feeders": [
      "84008"
    ]
  }
};
const norm=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const history=slug=>profiles[slug].recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&cache.bouts[h.boutId]?.org==='ufc'&&!/contender series/i.test(cache.bouts[h.boutId]?.event||''));
const gate=(slug,entry)=>evaluateCareerEvidence(profiles[slug],history(slug),census.fighters.find(x=>x.slug===slug)?.lastUfcFight,approval.rosterAsOf,entry,cache.bouts,approval.rosterAsOf).independentlyVerified;
test('wave66 retains ten independently pinned result/native identity matches and two DWCS exclusions without claiming certification',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(evidence.certificationGranted,false);
 assert.equal(evidence.pendingOfficialBiographyCrosscheck,true);
 assert.equal(evidence.pinnedHistoricalSource.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
 for(const [slug,target] of Object.entries(targets)){
  assert.ok(approval.approvedFighters.includes(slug));
  const e=evidence.fighters[slug],h=history(slug);
  assert.equal(e.officialUfcBiographyExhaustivenessVerified,false);
  assert.equal(e.bouts.length,5);
  assert.equal(h.length,5);
  assert.equal(e.nativeFighterId,target.n);
  assert.deepEqual(e.bouts.map(x=>x.nativeBoutId).sort(),Object.keys(target.urls).sort());
  assert.deepEqual(e.excludedFeederAppearances.map(x=>x.nativeBoutId).sort(),target.feeders.sort());
  const urls=new Set();
  for(const x of e.bouts){
   const b=cache.bouts[x.nativeBoutId];
   assert.ok(b,'original bout exists');
   assert.equal(b.org,'ufc');assert.equal(b.status,'completed');
   assert.ok(Number(cache.roundDone[x.nativeBoutId])>0);
   assert.equal(x.sourceFightUrl,'https://ufcstats.com/fight-details/'+target.urls[x.nativeBoutId]);
   assert.ok(!urls.has(x.sourceFightUrl));urls.add(x.sourceFightUrl);
   const own=b.a?.id===target.n?b.a:b.b?.id===target.n?b.b:null,other=own===b.a?b.b:b.a;
   assert.ok(own&&other);
   assert.equal(own.slug,slug);
   assert.equal(x.originalNativeFighterId,target.n);
   assert.equal(x.originalOpponentFighterId,String(other.id));
   assert.equal(norm(x.opponent),norm(other.name));
   assert.equal(x.result,b.result.winnerId===own.id?'win':'loss');
   assert.ok(Math.abs(Date.parse(x.sourceEventDate+'T00:00:00Z')-Date.parse(x.date+'T00:00:00Z'))<=86400000);
  }
  assert.equal(urls.size,5);
  for(const feeder of e.excludedFeederAppearances)
   assert.match(cache.bouts[feeder.nativeBoutId].event,/Contender Series/i);
 }
});
test('wave66 source review cannot itself promote certificates; any later canonical proof must pass strict gate',()=>{
 for(const slug of Object.keys(targets)){
  const e=registry[slug];
  if(e){
   assert.equal(e.sourceCoverageAttested,true);
   assert.equal(gate(slug,e),true,'a later canonical entry must pass complete strict Stage3 gate');
   assert.equal(gate(slug,{...e,bouts:e.bouts.slice(1)}),false);
   assert.equal(gate(slug,{...e,bouts:e.bouts.map((r,i)=>i===0?{...r,result:r.result==='win'?'loss':'win'}:r)}),false);
  } else assert.equal(evidence.fighters[slug].certificationStatus,'source_reconciled_pending_official_full_career_scope_and_strict_stage3_gate');
 }
});
