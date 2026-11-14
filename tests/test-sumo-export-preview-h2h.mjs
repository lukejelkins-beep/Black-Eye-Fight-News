import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPreviewH2h,keyFor} from '../scripts/sumo-export-preview-h2h.mjs';
import {buildResearchProfile} from '../scripts/sumo-build-profile-cache.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('data/sumo/rikishi-index.json');
const corrections=read('data/sumo/backfill/v1/official-bout-corrections.json');
test('JSA-documented one-result aggregate lag does not hide Fujiseiun and Nishikigi profiles',()=>{
  for(const [id,wins,losses] of [[82,206,131],[16,677,716]]){
    const w=roster.rikishi.find(x=>x.sourceId===id);
    const source=read('data/sumo/backfill/v1/rikishi/'+id+'.json');
    const jsa=read('data/sumo/backfill/v1/jsa-public/profiles/'+id+'.json');
    const p=buildResearchProfile(w,source,corrections,jsa);
    assert.equal(p.status,'source-regular-bouts-reconciled-external-verification-pending');
    assert.equal(p.career.wins,wins);
    assert.equal(p.career.losses,losses);
    assert.equal(p.career.sourceSummaryLagReconciled,true);
    assert.equal(p.certification,'not-started');
    assert.equal(p.headToHead.reduce((n,x)=>n+x.regularBouts,0),p.boutHistory.regularBouts);
  }
});
test('the full Sumo research cohort exports active pair previews plus every archived opponent meeting',()=>{
  const profiles=roster.rikishi.map(x=>read('data/sumo/backfill/v1/profile-ready/'+x.sourceId+'.json'));
  const {summary,history,opponents}=createPreviewH2h(profiles,roster.rikishi.map(w=>w.sourceId),roster.collectedAt);
  assert.equal(summary.profileCount,190);
  assert.equal(summary.cohortSize,190);
  assert.equal(opponents.profileCount,190);
  assert.ok(Array.isArray(opponents.profiles["28"]));
  assert.equal(opponents.profiles["28"].length,summary.profiles["28"].opponentCount);
  assert.equal(summary.profiles["28"].opponents,undefined,"bulky opponent directory must not be in the initial payload");
  assert.ok(summary.activePairCount>300,'Expected extensive source-backed active pair history');
  assert.ok(history.pairCount>=summary.activePairCount);
  assert.ok(summary.profiles['82'].reconciledAggregateLag);
  assert.ok(summary.profiles['16'].reconciledAggregateLag);
  const k=keyFor(8850,8857),pair=history.pairs[k],quick=summary.activePairs[k];
  assert.ok(pair?.regular.length>0);
  assert.equal(quick?.total,pair.regular.length);
  assert.equal(quick.latest.length,Math.min(5,pair.regular.length));
  assert.ok(pair.regular.every(m=>m[2]===8850||m[2]===8857));
  assert.ok(pair.regular.some(m=>typeof m[3]==='string'&&m[3].length>0));
  assert.equal(history.certified,false);
});
