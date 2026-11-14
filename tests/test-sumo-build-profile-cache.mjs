import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildResearchProfile} from '../scripts/sumo-build-profile-cache.mjs';
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
