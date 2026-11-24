import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildResearchProfile,mergeHistoricalWeights} from '../scripts/sumo-build-profile-cache.mjs';
const roster=JSON.parse(readFileSync(new URL('../data/sumo/rikishi-index.json',import.meta.url),'utf8'));
function cache(id){
 const w=roster.rikishi.find(x=>x.sourceId===id);
 return {w,source:JSON.parse(readFileSync(new URL('../data/sumo/backfill/v1/rikishi/'+id+'.json',import.meta.url),'utf8'))};
}
test('Ura full source matches reconcile without counting playoffs and Mae-zumo as regular wins',()=>{
 const {w,source}=cache(28),v=buildResearchProfile(w,source);
 assert.equal(v.status,'source-regular-bouts-reconciled-external-verification-pending');
 assert.equal(v.boutHistory.regularBouts,763);
 assert.equal(v.boutHistory.otherBouts,9);
 assert.equal(v.boutHistory.totalRawBouts,772);
 assert.equal(v.career.wins,432);
 assert.equal(v.career.losses,331);
 assert.equal(v.career.careerHigh.rank,'Komusubi 1 West');
 assert.equal(v.rankTimeline.length,70);
 assert.equal(v.measurements.length,2);
 assert.equal(v.releaseGates.certified,false);
 assert.equal(v.specialBouts.filter(x=>x.division==='Mae-zumo').length,2);
 assert.equal(v.specialBouts.filter(x=>x.day===16).length,7);
 assert.equal(v.headToHead.reduce((n,x)=>n+x.regularBouts,0),763);
 assert.equal(v.perBasho.reduce((n,x)=>n+x.wins+x.losses,0),763);
 assert.equal(v.recentPerformance.length,10);
});
test('Asanoyama regular bout history agrees with API career wins and losses',()=>{
 const {w,source}=cache(2),v=buildResearchProfile(w,source);
 assert.equal(v.boutHistory.regularBouts,665);
 assert.equal(v.boutHistory.otherBouts,2);
 assert.equal(v.career.wins,442);
 assert.equal(v.career.losses,223);
 assert.equal(v.headToHead.reduce((n,x)=>n+x.wins,0),442);
 assert.equal(v.headToHead.reduce((n,x)=>n+x.losses,0),223);
 assert.equal(v.releaseGates.independentJsaRecord,false);
});
test('an incomplete raw career cannot be presented as a completed research profile',()=>{
 const {w,source}=cache(28);
 source.stages.matches.complete=false;
 const v=buildResearchProfile(w,source);
 assert.equal(v.status,'not-ready');
});
test('source discrepancies do not become certified profiles',()=>{
 const {w,source}=cache(28);
 source.data.stats.totalWins=999;
 const v=buildResearchProfile(w,source);
 assert.equal(v.status,'not-ready');
 assert.equal(v.sourceId,28);
 assert.ok(v.problems.includes('career-win-count-mismatch'));
});

test('Obara research model reconciles official forfeit loss while raw API cache remains unchanged',()=>{
 const {w,source}=cache(242);
 const manifest=JSON.parse(readFileSync(new URL('../data/sumo/backfill/v1/official-bout-corrections.json',import.meta.url),'utf8'));
 const original=source.data.matches.find(m=>m.bashoId==='202207'&&m.day===12);
 assert.equal(original.winnerId,242);
 const result=buildResearchProfile(w,source,manifest);
 assert.equal(result.status,'source-regular-bouts-reconciled-external-verification-pending');
 assert.equal(result.career.wins,249);
 assert.equal(result.career.losses,209);
 assert.equal(result.boutHistory.officialBoutCorrections.length,1);
 assert.equal(result.boutHistory.officialBoutCorrections[0].newWinnerId,213);
 assert.equal(result.headToHead.reduce((n,x)=>n+x.wins,0),249);
 assert.equal(result.headToHead.reduce((n,x)=>n+x.losses,0),209);
 assert.equal(original.winnerId,242);
 assert.equal(result.releaseGates.certified,false);
});

test('Ura profile read model contains all six independently dated points but remains uncertified',()=>{
 const {w,source}=cache(28);
 const independent=JSON.parse(readFileSync(new URL('../data/sumo/backfill/v1/weight-source-crosschecks/28.json',import.meta.url),'utf8'));
 const result=buildResearchProfile(w,source,null,null,independent);
 assert.equal(result.measurements.length,6);
 assert.equal(result.measurementCoverage.extraPoints,4);
 assert.equal(result.measurementCoverage.matchingOverlapPoints,2);
 assert.equal(result.measurementCoverage.conflictingOverlaps.length,0);
 assert.equal(result.measurements.find(x=>x.bashoId==='202205').weightKg,148);
 assert.equal(result.measurements.find(x=>x.bashoId==='201503').independentSourceConfirmed,
  'https://sumodb.sumogames.de/Rikishi.aspx?r=12226');
 assert.equal(result.releaseGates.certified,false);
 assert.equal(source.data.measurements.length,2,'original Sumo API measurements unchanged');
});
test('weight conflicts retain original API values and remain reviewable',()=>{
 const w={sourceId:28,sumoDbId:12226};
 const rows=[{bashoId:'202505',height:175,weight:139}];
 const extra={sourceId:28,sumoDbId:12226,
  datedEvidence:[{bashoId:'202505',weightKg:141,heightCm:175,
   sourceUrl:'https://sumodb.sumogames.de/Rikishi.aspx?r=12226'}]};
 const merged=mergeHistoricalWeights(w,rows,extra);
 assert.equal(merged.measurements[0].weightKg,139);
 assert.equal(merged.coverage.conflictingOverlaps.length,1);
 assert.equal(merged.coverage.status,'needs-overlap-review');
 assert.equal(merged.coverage.extraPoints,0);
 assert.equal(rows[0].weight,139);
});
test('fractional historical weights are retained',()=>{
 const m=mergeHistoricalWeights({sourceId:28},[{bashoId:'202505',weight:121.5,height:175.5}]);
 assert.equal(m.measurements[0].weightKg,121.5);
 assert.equal(m.measurements[0].heightCm,175.5);
});

test('current official profile weight has no inferred weigh-in date, historical points remain separate',()=>{
 const {w,source}=cache(28);
 const jsa=JSON.parse(readFileSync(new URL('../data/sumo/backfill/v1/jsa-public/profiles/28.json',import.meta.url),'utf8'));
 const extra=JSON.parse(readFileSync(new URL('../data/sumo/backfill/v1/weight-source-crosschecks/28.json',import.meta.url),'utf8'));
 const p=buildResearchProfile(w,source,null,jsa,extra);
 assert.equal(p.measurements.length,6);
 assert.equal(p.currentOfficialMeasurement.weightKg,jsa.weightKg);
 assert.equal(p.currentOfficialMeasurement.sourceUrl,jsa.url);
 assert.equal(p.currentOfficialMeasurement.snapshotType,'current-listed-weight-not-dated-weigh-in');
 assert.equal(p.currentOfficialMeasurement.measurementDateKnown,false);
 assert.equal(p.currentOfficialMeasurement.independentlyCertified,false);
 assert.equal(p.currentOfficialMeasurement.officialAsOf.monthYear,'November 2026');
 const fake={...jsa,sourceId:999};
 const p2=buildResearchProfile(w,source,null,fake,extra);
 assert.equal(p2.currentOfficialMeasurement,null);
});
