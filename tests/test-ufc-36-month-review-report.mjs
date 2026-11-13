import test from 'node:test';
import assert from 'node:assert/strict';
import {rosterReviewReport,summaryMarkdown} from '../scripts/ufc-36-month-review-report.mjs';
const sample=()=>({schema:1,scope:'ufc',activityMonths:36,asOf:'2026-11-14',
 activityCutoff:'2023-11-14',indexCompleteness:'36_month_event_scan_complete',
 missingOfficialUfcEventDetails:0,officialCompletedEventsIndexed:150,
 fighters:[{name:'A',slug:'a',eligibilityStatus:'latest_observed_mma_ufc'},
 {name:'B',slug:'b',eligibilityStatus:'review_required',lastUfcFight:'2024-06-01'}],
 eligibilityReview:[{name:'B',slug:'b',lastUfcFight:'2024-06-01',
   evidence:{date:'2026-01-01',opponent:'Z'}}],
 eligibilityExcluded:[{slug:'x',name:'X',reason:'confirmed_retired'}]});
test('only unresolved exceptions are referred for review, never silently approved',()=>{
 const r=rosterReviewReport(sample());
 assert.equal(r.summary.provisionalIncluded,2);
 assert.equal(r.summary.proposedWithoutExceptions,1);
 assert.equal(r.summary.openExceptions,1);
 assert.equal(r.summary.excludedCount,1);
 assert.equal(r.summary.readyForWholeRosterReview,false);
 assert.deepEqual(r.proposedRoster.map(f=>f.slug),['a']);
 assert.match(summaryMarkdown(r),/Only the user can approve/);
});
test('cache inventory deduplicates native UFC IDs and excludes non-UFC fights',()=>{
 const c=sample();c.fighters=c.fighters.slice(0,1);c.eligibilityReview=[];
 const r=rosterReviewReport(c,{bouts:{'17':{org:'ufc'}}},{
 profiles:{a:{ufcTimeline:{complete:true},recentHistory:[
 {promotion:'ufc',source:'native',boutId:17,result:'win'},
 {promotion:'ufc',source:'native',boutId:17,result:'win'},
 {promotion:'ufc',source:'native',boutId:18,result:'loss'},
 {promotion:'pfl',source:'native',boutId:55,result:'win'}]}}
 },{status:'pending_review'});
 assert.equal(r.summary.alreadyCached.savedUfcHistoryRows,3);
 assert.equal(r.summary.alreadyCached.distinctNativeFightIds,2);
 assert.equal(r.summary.alreadyCached.uniqueNativeIdsNotYetIndexed,1);
 assert.equal(r.summary.alreadyCached.completeProviderTimelines,1);
 assert.equal(r.summary.userApprovalStatus,'pending_review');
 assert.equal(r.summary.readyForWholeRosterReview,true);
});
test('incomplete census or mismatched exception blocks signoff',()=>{
 const c=sample();c.indexCompleteness='36_month_event_scan_incomplete';
 c.eligibilityReview[0].slug='missing';
 const r=rosterReviewReport(c);
 assert.equal(r.summary.readyForWholeRosterReview,false);
 assert.equal(r.summary.integrityIssues,1);
});
