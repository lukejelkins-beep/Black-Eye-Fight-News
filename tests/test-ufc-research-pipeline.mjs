import test from "node:test";
import assert from "node:assert/strict";
import {recentHistoryStatus,audit} from "../scripts/audit-ufc-research-pipeline.mjs";
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