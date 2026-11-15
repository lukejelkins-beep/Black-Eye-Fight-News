import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSumoHealth} from '../scripts/sumo-research-run-health.mjs';
const cohort={count:190,rikishi:Array.from({length:190},(_,i)=>({
 sourceId:i+1,sumoDbId:12000+i}))};
const api={counts:{collected:190},weightSnapshots:415,rankEntries:8711,matchEntries:76532};
const weights={mappedSumoDbRikishi:190,rawApiWeightEntries:415,
 checkedIndependentRikishi:58,independentDatedPoints:340,
 additionalDatedPoints:205,conflictingOverlaps:0};
const collection={lastRunAt:'2026-11-14T23:31:41Z',requestsThisRun:10,
 updatedThisRun:10,reviewCases:[],nextAllowedAt:null};
const jsa={checked:66,pending:124,historicalBashoCompared:3855,
 historicalDiscrepancies:0,officialOutcomeOverlaysUsed:1};
const profiles={available:190,weightGraphs:58,currentOfficial:66,sourceReady:190};
const input={cohort,api,weights,collection,jsa,profiles,official:{profileReviewCases:5},
 runId:'123456789',workflowSha:'abcdef',completedAt:'2026-11-15T00:00:00.000Z'};
test('report links exact successful research checkpoint, never claims certifications',()=>{
 const r=buildSumoHealth(input);
 assert.equal(r.sumoDb.mapped,190);
 assert.equal(r.sumoDb.additionalDatedWeights,205);
 assert.equal(r.researchProfileProjections.sourceLinkedWeightGraphs,58);
 assert.equal(r.officialJsa.checked,66);
 assert.equal(r.workflowRunUrl,'https://github.com/lukejelkins-beep/Black-Eye-Fight-News/actions/runs/123456789');
 assert.equal(r.certifiedCareers,0);
 assert.equal(r.productionPublished,false);
});
test('refuse stale coverage and duplicate or missing SumoDB IDs',()=>{
 assert.throws(()=>buildSumoHealth({...input,weights:{...weights,mappedSumoDbRikishi:183}}),/not in sync/);
 const broken={count:190,rikishi:cohort.rikishi.map(x=>({...x}))};
 broken.rikishi[15].sumoDbId=12000;
 assert.throws(()=>buildSumoHealth({...input,cohort:broken}),/mapping incomplete/);
});
