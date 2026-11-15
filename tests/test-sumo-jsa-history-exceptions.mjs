import test from 'node:test';
import assert from 'node:assert/strict';
import {auditJsaSnapshot,buildJsaExceptionReport} from '../scripts/sumo-jsa-history-exceptions.mjs';
const rosterItem={sourceId:42,shikonaEn:'Example',officialNskId:1234};
const base={
 sourceId:42,officialNskId:1234,url:'https://www.sumo.or.jp/EnSumoDataRikishi/profile/1234/',
 status:'basic-fields-parsed',fieldComparisons:{name:true,rankGrade:true,weight:true},
 officialAsOf:{monthYear:'November 2026',day:8},
 bashoReconciliation:{comparedBasho:5,agreeingBasho:4,discrepantBasho:1,
  excludedCurrentBasho:'202611',unmatchedOfficialBasho:['202105'],
  discrepancies:[{bashoId:'202207',official:{wins:3,losses:4},apiLedger:{wins:4,losses:3}}]}
};
test('records exact historical exception and identity without certifying a career',()=>{
 const checked=auditJsaSnapshot(rosterItem,base);
 assert.equal(checked.sourceId,42);
 assert.equal(checked.unreconciledTournamentCount,1);
 assert.equal(checked.discrepancies[0].bashoId,'202207');
 assert.equal(checked.discrepancies[0].official.wins,3);
 assert.equal(checked.certification,'not-started');
 assert.deepEqual(checked.missingApiTournamentRows,['202105']);
});
test('does not silently accept source identity or count mismatch',()=>{
 assert.throws(()=>auditJsaSnapshot(rosterItem,{...base,sourceId:41}),/identity/);
 assert.throws(()=>auditJsaSnapshot(rosterItem,{...base,
  bashoReconciliation:{...base.bashoReconciliation,discrepantBasho:2}}),/count mismatch/);
});
test('completed tournament mismatch and malformed profiles go to review, no current basho fiction',()=>{
 const roster={count:190,rikishi:[rosterItem,...Array.from({length:189},(_,i)=>({
  sourceId:i+1000,shikonaEn:'Athlete '+i,officialNskId:3000+i}))]};
 const review=new Map([[42,base],[1000,{...base,sourceId:1000,officialNskId:3000,
  status:'parse-review',bashoReconciliation:{
   comparedBasho:0,agreeingBasho:0,discrepantBasho:0,discrepancies:[]}}]]);
 const audit=buildJsaExceptionReport(roster,review);
 assert.equal(audit.capturedProfiles,2);
 assert.equal(audit.pendingProfiles,188);
 assert.equal(audit.historicalTournamentsDisagree,1);
 assert.deepEqual(audit.historicalCases,[42]);
 assert.equal(audit.profileReviewCases,2);
 assert.equal(audit.certifiedCareers,0);
});

test('career record absent on official page is distinct from checked tournament mismatch',()=>{
 const doc={...base,
  status:'parse-review',career:null,officialAsOf:null,
  bashoReconciliation:{comparedBasho:94,agreeingBasho:94,
   discrepantBasho:0,discrepancies:[],unmatchedOfficialBasho:[]}};
 const row=auditJsaSnapshot(rosterItem,doc);
 assert.equal(row.reviewClassification,'official-career-totals-not-found');
 assert.equal(row.officialCareerTotalsNotFound,true);
 assert.equal(row.tournamentRowsCompared,94);
 assert.equal(row.unreconciledTournamentCount,0);
 assert.equal(row.certification,'not-started');
 const roster={count:190,rikishi:[rosterItem,...Array.from({length:189},(_,i)=>({
  sourceId:1000+i,shikonaEn:'Wrestler '+i,officialNskId:3000+i}))]};
 const report=buildJsaExceptionReport(roster,new Map([[42,doc]]));
 assert.equal(report.officialCareerTotalsNotFoundCases,1);
 assert.equal(report.genuineParserOrFieldReviewCases,0);
 assert.equal(report.historicalTournamentsDisagree,0);
 assert.equal(report.certifiedCareers,0);
});
test('a missing official total plus a field error remains a genuine field review',()=>{
 const doc={...base,career:null,status:'parse-review',fieldComparisons:{name:false},
  bashoReconciliation:{comparedBasho:3,agreeingBasho:3,
   discrepantBasho:0,discrepancies:[]}};
 const row=auditJsaSnapshot(rosterItem,doc);
 assert.equal(row.officialCareerTotalsNotFound,false);
 assert.equal(row.reviewClassification,'official-profile-field-disagreement');
});
