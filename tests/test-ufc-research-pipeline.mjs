import test from "node:test";
import assert from "node:assert/strict";
import {recentHistoryStatus,audit,auditLastFiveCoverage} from "../scripts/audit-ufc-research-pipeline.mjs";
const recent=n=>Array.from({length:n},(_,i)=>({date:"2026-11-"+String(12-i).padStart(2,"0"),opponent:"Opponent "+i}));
test("rookie with three UFC fights legitimately has only three recent results",()=>{
 const s=recentHistoryStatus({latest:recent(3),ufcRecord:{wins:3,losses:0,draws:0,complete:true}});
 assert.equal(s.expectedRecentBouts,3);assert.deepEqual(s.issues,[]);
});
test("an established UFC fighter needs five latest verified results",()=>{
 const s=recentHistoryStatus({latest:recent(2),ufcRecord:{wins:6,losses:2,draws:0,complete:true}});
 assert.equal(s.expectedRecentBouts,5);assert(s.issues.includes("missing_recent_fights"));
});
test("tracked rounds do not reduce the required five UFC results",()=>{
 const s=recentHistoryStatus({latest:recent(5),ufcRecord:{wins:6,losses:2,draws:0,complete:true},trackedBouts:2});
 assert.deepEqual(s.issues,[]);
});
test("unverified UFC career counts must not be assumed zero",()=>{
 const s=recentHistoryStatus({latest:recent(5),record:"19-2"});
 assert.equal(s.careerUfcBouts,null);assert(s.issues.includes("ufc_only_career_count_not_verified"));
});
test("large historical queues are not restricted to the preview limit",()=>{
 const q={candidateCount:883,candidates:[{}],historicalCounts:{"A-F":125,"G-L":208,"M-R":245,"S-Z":235}};
 const r=audit({queue:q});assert.equal(r.counts.fullHistoricalQueue,813);assert.equal(r.counts.previewQueueSize,1);
});
test("paid UFC lookup yield audit distinguishes useful matches from empty and 404 results",()=>{
 const coverage={schema:1,scope:"ufc",asOf:"2026-11-13",activityCutoff:"2025-05-13",
  fighters:[
   {name:"Champion A",slug:"champ-a",lastUfcFight:"2026-06-12",champion:true,
    recentCount:5,measuredCount:3,needsHistoryCheck:false,needsStats:true,
    recent:Array.from({length:5},(_,i)=>({boutId:"a"+i,date:"2026-06-0"+(9-i),
     opponent:"UFC Opp "+i,outcome:i===4?"NC":"W"}))},
   {name:"Prospect B",slug:"rookie-b",lastUfcFight:"2026-11-07",upcoming:true,
    recentCount:2,measuredCount:1,needsHistoryCheck:true,needsStats:true,
    recent:[{boutId:"b1",outcome:"W"},{boutId:null,outcome:null}]},
   {name:"Contender C",slug:"cont-c",lastUfcFight:"2026-10-07",ranked:true,
    recentCount:0,measuredCount:0,needsHistoryCheck:true,needsStats:false,recent:[]},
   {name:"Duplicate D",slug:"dup-d",lastUfcFight:"2026-07-12",
    recentCount:5,measuredCount:0,needsHistoryCheck:true,needsStats:true,
    recent:Array.from({length:5},(_,i)=>({boutId:i===4?"d1":"d"+(i+1),
     outcome:"L"}))}
  ]};
 const progress={status:"connected",lastRun:"2026-11-13T06:40:00Z",lastCalls:283,
  provider:{usedAtStart:12000},
  ufcHistoricalSearchDone:{
   "champ-a":{matchedWinnerBouts:5,newIndexedBouts:3,checkedAt:"2026-11-13"},
   "cont-c":{status:"unresolved_slug_404",retryAfter:"2026-11-20"},
   "dup-d":{matchedWinnerBouts:0,newIndexedBouts:0,checkedAt:"2026-11-13"}
  }};
 const out=auditLastFiveCoverage({coverage,progress,postfight:{metricBouts:2010},
  v3:{population:4,boards:[{id:"slpm",eligible:2}],
   identityReviewPending:[{name:"Carlos Hernandez"}]}});
 assert.equal(out.coverage.activeFighters,4);
 assert.equal(out.coverage.withFiveKnown,2);
 assert.equal(out.coverage.withFiveUfcBoutIds,1,"duplicated fight IDs must not count as five");
 assert.equal(out.coverage.withFiveRecordedOutcomes,2);
 assert.equal(out.coverage.withThreeMeasured,1);
 assert.equal(out.coverage.knownBoutsMissingIds,1);
 assert.equal(out.coverage.recordedOutcomesMissing,1);
 assert.equal(out.coverage.needHistoryCheck,3);
 assert.equal(out.targetedSearch.attempted,3);
 assert.equal(out.targetedSearch.foundCompletedMatches,1);
 assert.equal(out.targetedSearch.zeroCompletedMatches,1);
 assert.equal(out.targetedSearch.unresolvedSlug404,1);
 assert.equal(out.targetedSearch.unsearched,1);
 assert.equal(out.targetedSearch.newUniqueBoutIdsIndexed,3);
 assert.equal(out.targetedSearch.totalCompletedMatches,5);
 assert.equal(out.apiBudgetSnapshot.providerUsedAtLastStart,12000);
 assert.equal(out.observedStatBouts,2010);
 assert.equal(out.perMetricEligibleFighters.slpm,2);
 assert.equal(out.quarantinedNameAliases,1);
 assert.equal(out.priorityGaps[0].name,"Champion A");
 assert.equal(out.priorityGaps[1].name,"Prospect B");
 assert(out.priorityGaps.every(x=>typeof x.historyQueried==="boolean"));
});
test("missing provider progress or coverage remains unknown, not claimed as zero usage",()=>{
 const out=auditLastFiveCoverage();
 assert.equal(out.coverage.activeFighters,0);
 assert.equal(out.apiBudgetSnapshot.providerUsedAtLastStart,null);
 assert.equal(out.observedStatBouts,null);
 assert.equal(out.publishedV3Fighters,null);
 assert.equal(out.quarantinedNameAliases,null);
 assert.deepEqual(out.priorityGaps,[]);
});
