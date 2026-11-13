import test from 'node:test';
import assert from 'node:assert/strict';
import {auditApprovedStage3,markdownReport} from '../scripts/ufc-36-month-stage3-progress.mjs';
const slugs=Array.from({length:783},(_,i)=>'fighter-'+(i+1));
const approval={schema:1,scope:'ufc-36-month-roster',status:'approved',
  approvedBy:'user',rosterAsOf:'2026-11-14',approvedFighters:slugs};
const census={schema:1,scope:'ufc',activityMonths:36,asOf:'2026-11-14',
  indexCompleteness:'36_month_event_scan_complete',
  fighters:slugs.map(slug=>({slug,eligibilityStatus:'latest_observed_mma_ufc'}))};
const progress={bouts:{},roundDone:{},status:'connected',lastCalls:35,lastRun:'2026-11-13T22:30:00Z'};
const research={profiles:{}};
const archive={fights:{}};
const history=(id,opponent,date='2015-01-01')=>({date,opponent,source:'native',
  promotion:'ufc',result:'win',boutId:String(id)});
const fight=(id,opponent)=>({id:String(id),org:'ufc',eventDate:'2015-01-01',
  a:{name:'Fighter 1'},b:{name:opponent},status:'completed'});
test('Count cached fights once globally and distinguish round statistics from result histories',()=>{
 const p={...progress,bouts:{'41':fight(41,'Opponent A'),'42':fight(42,'Opponent B')}};
 const r={profiles:{'fighter-1':{recentHistory:[
   history(41,'Opponent A'),history(41,'Opponent A'),
   history(42,'Opponent B'),history(43,'Opponent C'),
   history(44,'Opponent D'),history(45,'Opponent E')]},
   'fighter-2':{recentHistory:[history(41,'Fighter 1')]}}};
 const a={fights:{
   '2015-01-01:fighter1:opponenta':{rounds:[{round:1,a:{sigLanded:5},b:{sigLanded:3}}]},
   '2015-01-01:fighter1:opponentb':{rounds:[{round:1,a:{},b:{}}]}
 }};
 const result=auditApprovedStage3(approval,census,p,r,a);
 const s=result.summary;
 assert.equal(s.approvedFighters,783);
 assert.equal(s.profilesWithSavedUfcHistory,2);
 assert.equal(s.savedUfcHistoryRows,7);
 assert.equal(s.uniqueNativeFightIds,5);
 assert.equal(s.uniquelyIndexedNativeFightIds,2);
 assert.equal(s.uniqueNativeFightIdsAwaitingIndex,3);
 assert.equal(s.indexedFightsWithMeasuredRoundMetrics,1);
 assert.equal(s.fightersWithAtLeastFiveObservedUfcFights,1);
 assert.equal(s.fightersWithMeasuredFiveOfFive,0);
 assert.equal(s.profilesWithoutSavedUfcHistory,781);
 assert.match(markdownReport(result),/Stage 3/);
});
test('An approved fighter that becomes ineligible is counted but never silently replaced',()=>{
 const data={...census,fighters:[
   ...census.fighters.slice(1),{slug:'new-entrant',eligibilityStatus:'latest_observed_mma_ufc'}]};
 const r=auditApprovedStage3(approval,data,progress,research,archive);
 assert.equal(r.summary.approvedNotCurrentlyEligible,1);
 assert.equal(r.summary.stillEligibleApproved,782);
 assert.equal(r.summary.newlyEligibleNotInApproval,1);
});
test('Reject unauthorised or changed census and never claim missing rounds are measured',()=>{
 assert.throws(()=>auditApprovedStage3({...approval,approvedFighters:slugs.slice(0,782)},census,progress,research,archive),/Invalid immutable/);
 assert.throws(()=>auditApprovedStage3({...approval,status:'pending_review'},census,progress,research,archive),/not approved/);
 assert.throws(()=>auditApprovedStage3(approval,{...census,indexCompleteness:'incomplete'},progress,research,archive),/Invalid cached/);
});
