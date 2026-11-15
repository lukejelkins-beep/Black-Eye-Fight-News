import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPreviewCareer} from '../scripts/sumo-export-preview-career.mjs';
import {careerPoints} from '../assets/sumo-career.mjs';
const raw=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=raw('data/sumo/rikishi-index.json');
const cohort=roster.rikishi.map(w=>({
 sourceId:w.sourceId,officialNskId:w.officialNskId,certification:'not-started',
 status:'source-regular-bouts-reconciled-external-verification-pending',
 releaseGates:{certified:false},career:{careerHigh:{rank:w.currentRank}},
 measurements:[{bashoId:'202405',heightCm:175,weightKg:141.5,
  source:'Sumo API historical change',
  sourceUrl:'https://www.sumo-api.com/api/measurements?rikishiId='+w.sourceId}],
 rankTimeline:[{bashoId:'202405',rank:'Jonidan 9 East'},
 {bashoId:'202611',rank:w.currentRank}],
 measurementCoverage:{extraPoints:0,independentPoints:0,status:'api-only'},
 currentOfficialMeasurement:{weightKg:172,sourceUrl:'https://www.sumo.or.jp/EnSumoDataRikishi/profile/'+w.officialNskId+'/',
   snapshotType:'current-listed-weight-not-dated-weigh-in',measurementDateKnown:false,
   officialAsOf:{monthYear:'November 2026',day:8}}
}));
test('190 profiles export only actual dated weights; current listed weight stays separate',()=>{
 const report=createPreviewCareer(roster,cohort,'2026-11-15');
 assert.equal(report.cohortSize,190);
 assert.equal(Object.keys(report.bySourceId).length,190);
 assert.equal(report.datedWeightPoints,190);
 assert.equal(report.independentAdditionalDatedWeightPoints,0);
 assert.equal(report.certified,false);
 const example=report.bySourceId[String(roster.rikishi[0].sourceId)];
 assert.deepEqual(example.weight.map(x=>x.basho),['202405']);
 assert.equal(example.weight[0].kg,141.5);
 assert.equal(example.rankSource,'https://www.sumo-api.com/api/ranks?rikishiId='+
   roster.rikishi[0].sourceId+'&limit=200&skip=0&sortOrder=asc');
 assert.equal(example.independentRankReference,'https://sumodb.sumogames.de/Rikishi.aspx?r='+
   roster.rikishi[0].sumoDbId);
 assert.equal(example.currentListedWeight.kg,172);
 assert.equal(example.currentListedWeight.heightCm,undefined,
  'No JSA listed height can be fabricated from a current weight alone');
 assert.equal(example.currentListedWeight.datedMeasurement,false);
 const view=careerPoints({...roster.rikishi[0],weightKg:172},report,'202611','202609','Jonidan 9 West');
 assert.equal(view.weight.length,1,'current displayed listing must not create a dot');
});
test('historically dated independent records do enter the weight curve but never receive certification',()=>{
 const ura=raw('data/sumo/backfill/v1/profile-ready/28.json');
 const w=roster.rikishi.find(x=>x.sourceId===28);
 const replaced=cohort.map(p=>p.sourceId===28?ura:p);
 const view=createPreviewCareer(roster,replaced,'2026-11-15');
 const weight=view.bySourceId['28'].weight;
 assert.equal(weight.length,6);
 assert.equal(weight.find(x=>x.basho==='202205')?.kg,148);
 assert.ok(!weight.some(x=>x.basho==='202611'));
 assert.equal(view.bySourceId['28'].currentListedWeight.kg,138);
 assert.equal(view.bySourceId['28'].currentListedWeight.heightCm,173);
 assert.equal(weight.some(x=>x.independentlyCertified),false);
 assert.equal(w.sumoDbId,12226);
});
test('reject fabricated, undated, repeated or out-of-range historical weight records',()=>{
 const modify=fn=>{const first=structuredClone(cohort[0]);
  fn(first);return [first,...cohort.slice(1)];};
 assert.throws(()=>createPreviewCareer(roster,modify(p=>p.measurements[0].bashoId='202602')),/Undated/);
 assert.throws(()=>createPreviewCareer(roster,modify(p=>p.measurements[0].weightKg=999)),/Undated/);
 assert.throws(()=>createPreviewCareer(roster,modify(p=>p.measurements.push(p.measurements[0]))),/Duplicate historical/);
 assert.throws(()=>createPreviewCareer(roster,modify(p=>p.currentOfficialMeasurement.measurementDateKnown=true)),
  /undated/);
});
test('never export certified or mismatched wrestler identity as research-ready',()=>{
 const duplicate=cohort.map((p,i)=>i===0?{...p,officialNskId:999}:p);
 assert.throws(()=>createPreviewCareer(roster,duplicate),/Unready/);
 const certified=cohort.map((p,i)=>i===0?{...p,releaseGates:{certified:true}}:p);
 assert.throws(()=>createPreviewCareer(roster,certified),/Unready/);
});
