import test from 'node:test';
import assert from 'node:assert/strict';
import {strictCareerAudit,strictSummary,preventSilentCertificationRegression} from '../scripts/sumo-certify-strict-190.mjs';
const copy=x=>structuredClone(x);
function fixture(){
 const w={sourceId:1,officialNskId:10,sumoDbId:20,shikonaEn:'Test Rikishi'};
 const p={
  sourceId:1,officialNskId:10,certification:'not-started',
  releaseGates:{certified:false},career:{wins:1,losses:1,absences:0},
  boutHistory:{fullPagination:true,rawSourceImmutable:true,regularBouts:2,
    otherBouts:0,totalRawBouts:2,regularWins:1,regularLosses:1},
  perBasho:[{bashoId:'202609',wins:1,losses:0,scheduledBoutRows:1},
    {bashoId:'202611',wins:0,losses:1,scheduledBoutRows:1}],
  rankTimeline:[{bashoId:'202609',rank:'Jonidan 17 East'},
    {bashoId:'202611',rank:'Jonidan 22 East'}],
  rankHistoryGaps:[],measurementCoverage:{conflictingOverlaps:[]},
  headToHead:[{opponentId:2,wins:1,losses:1,regularBouts:2,
    meetings:[{winnerId:1,kimarite:'oshidashi',resultKind:'kimarite'},
      {winnerId:2,kimarite:'yorikiri',resultKind:'kimarite'}]}]
 };
 const raw={rikishiId:1,nskId:10,researchOnly:true,certification:'not-started',
  stages:Object.fromEntries(['profile','stats','measurements','ranks',
   'shikonas','matches'].map(x=>[x,{complete:true}])),
  data:{matches:[{bashoId:'202609',day:5},{bashoId:'202611',day:1}]}};
 const official={sourceId:1,officialNskId:10,
  url:'https://www.sumo.or.jp/EnSumoDataRikishi/profile/10/',
  rawHtmlSha256:'a'.repeat(64),
  fieldComparisons:{name:true,stable:true,rankGrade:true,weight:true,height:true},
  career:{wins:1,losses:1,absences:0},
  officialBashoRecords:[{bashoId:'202609',wins:1,losses:0},
   {bashoId:'202611',wins:0,losses:1}],
  bashoReconciliation:{discrepantBasho:0,agreeingBasho:1,comparedBasho:1,
   unmatchedOfficialBasho:[],rawSourceMatchesChanged:false},
  officialRankRecords:[{bashoId:'202609',rank:'Jonidan 17 East'}],
  rankReconciliation:{comparedBasho:1,agreedBasho:1,mismatches:[],
   missingSourceRankBasho:[]}
 };
 const weight={sourceId:1,officialNskId:10,sumoDbId:20,
  identityEvidence:{valid:true,birthDateStatus:'match'},
  datedEvidence:[{bashoId:'202609',weightKg:125}],
  sourcePageUrl:'https://sumodb.sumogames.de/Rikishi.aspx?r=20'};
 const preflight={sourceId:1,classification:'candidate-for-strict-audit',blockers:[]};
 const sourceAudit={sourceId:1,readyForExternalCrosscheck:true,
  errors:[],boutLedger:{missingWinner:0,authoritativeWins:1,authoritativeLosses:1}};
 const h2h={cohortSize:190,profilesChecked:190,counterpartConflicts:0,
  counterpartGaps:0,integrityStatus:'source-pair-reconciled'};
 return {w,p,raw,official,weight,preflight,sourceAudit,h2h,activeBasho:'202611'};
}
test('strict gate can certify career result ledger but does not certify full profile or techniques',()=>{
 const result=strictCareerAudit(fixture());
 assert.equal(result.careerResultsCertified,true);
 assert.equal(result.status,'career-results-strictly-certified');
 assert.deepEqual(result.blockers,[]);
 assert.equal(result.fullProfileCertified,false);
 assert.equal(result.independentBoutByBoutKimariteCertified,false);
 assert.equal(result.historicalWeightTimelineCertified,false);
 assert.equal(result.releaseApproved,false);
 assert.equal(result.checks.completedTournamentResultsCrosschecked,1);
 assert.match(result.evidenceDigest,/^[0-9a-f]{64}$/);
});
test('not enough to merely pass preflight',()=>{
 const f=fixture();
 f.preflight.blockers=['official-JSA-career-totals-unpublished-or-disagree'];
 assert.equal(strictCareerAudit(f).careerResultsCertified,false);
});
test('never certify source without full pagination and raw native-bout count match',()=>{
 const f=fixture();f.raw.stages.matches.complete=false;
 assert.ok(strictCareerAudit(f).blockers.includes('incomplete-source-pagination-or-identity'));
 f.raw.stages.matches.complete=true;f.p.boutHistory.totalRawBouts=20;
 assert.ok(strictCareerAudit(f).blockers.includes('full-per-basho-and-regular-bout-ledger-reconciliation'));
});
test('JSA career absences are required and must not be substituted with zero',()=>{
 const f=fixture();f.official.career.absences=null;
 assert.ok(strictCareerAudit(f).blockers.includes('independent-published-career-wins-losses-absences'));
 f.official.career.absences=1;
 assert.equal(strictCareerAudit(f).careerResultsCertified,false);
});
test('a JSA prior-tournament discrepancy blocks certification despite current-basho exclusion',()=>{
 const f=fixture();f.official.officialBashoRecords[0].wins=0;
 assert.ok(strictCareerAudit(f).blockers.includes('independent-official-completed-tournament-results'));
 f.official.officialBashoRecords[0].wins=1;
 f.official.bashoReconciliation.discrepantBasho=1;
 assert.equal(strictCareerAudit(f).careerResultsCertified,false);
});
test('JSA historical rank mismatch or inadequate rank coverage blocks certification',()=>{
 const f=fixture();
 f.official.rankReconciliation.mismatches=[{bashoId:'202609'}];
 assert.ok(strictCareerAudit(f).blockers.includes('independent-official-banzuke-rank-coverage'));
});
test('conflicting official field blocks the result',()=>{
 const f=fixture();f.official.fieldComparisons.weight=false;
 assert.ok(strictCareerAudit(f).blockers.includes('independent-official-profile-identity-or-fields'));
});
test('unverified birth date or conflicting weight dates blocks source identity',()=>{
 const f=fixture();f.weight.identityEvidence.birthDateStatus='source-birth-date-missing';
 assert.ok(strictCareerAudit(f).blockers.includes('independent-source-identity-or-measurement-conflict'));
 f.weight.identityEvidence.birthDateStatus='match';
 f.p.measurementCoverage.conflictingOverlaps=[{bashoId:'202609'}];
 assert.equal(strictCareerAudit(f).careerResultsCertified,false);
});
test('H2H must have all source bouts and a nonmissing recorded technique or forfeit',()=>{
 const f=fixture();f.p.headToHead[0].meetings[0].kimarite=null;
 assert.ok(strictCareerAudit(f).blockers.includes('complete-native-h2h-or-kimarite-provenance'));
 f.p.headToHead[0].meetings[0].kimarite='oshidashi';
 f.h2h.counterpartConflicts=1;
 assert.equal(strictCareerAudit(f).careerResultsCertified,false);
});
test('strict evidence digest changes when an official source result changes',()=>{
 const f=fixture(),a=strictCareerAudit(f);
 const modified=copy(f);modified.official.career.absences=2;
 const b=strictCareerAudit(modified);
 assert.notEqual(a.evidenceDigest,b.evidenceDigest);
 assert.equal(b.careerResultsCertified,false);
});
test('summary never certifies more than preflight candidates or a reduced cohort',()=>{
 const rows=Array.from({length:190},(_,i)=>({sourceId:i+1,
  careerResultsCertified:i===0,blockers:i===0?[]:['missing']}));
 const summary=strictSummary(rows,{candidateForStrictAudit:1});
 assert.equal(summary.strictCareerResultsCertified,1);
 assert.equal(summary.fullProfilesCertified,0);
 assert.equal(summary.productionApproved,false);
 assert.throws(()=>strictSummary(rows,{candidateForStrictAudit:0}),/cannot exceed/);
 assert.throws(()=>strictSummary(rows.slice(1),{candidateForStrictAudit:1}),/exactly/);
});

test('third-party career totals can supplement unpublished JSA absences only with exact W-L-A and identity proof',()=>{
 const f=fixture();f.official.career.absences=null;
 f.weight.careerRecordCrosscheck={
  sourceUrl:'https://sumodb.sumogames.de/Rikishi.aspx?r=20',
  rawHtmlSha256:'b'.repeat(64),
  identityVerified:true,originalMeasurementsUnchanged:true,
  independentOfApi:true,career:{wins:1,losses:1,absences:0,providerReportedBoutCount:2}};
 const ok=strictCareerAudit(f);
 assert.equal(ok.careerResultsCertified,true);
 assert.equal(ok.careerTotalsEvidenceBasis,
   'separate-SumoDB-career-WLA-plus-published-JSA-basho');
 assert.ok(!ok.independentlyVerifiedBy.includes('JSA published W-L-A'));
 f.weight.careerRecordCrosscheck.career.absences=null;
 assert.equal(strictCareerAudit(f).careerResultsCertified,false);
 f.weight.careerRecordCrosscheck.career.absences=0;
 f.weight.careerRecordCrosscheck.identityVerified=false;
 assert.equal(strictCareerAudit(f).careerResultsCertified,false);
});
test('never use supplemental records to override explicitly conflicting JSA career totals',()=>{
 const f=fixture();f.official.career.absences=1;
 f.weight.careerRecordCrosscheck={
  sourceUrl:'https://sumodb.sumogames.de/Rikishi.aspx?r=20',
  rawHtmlSha256:'c'.repeat(64),identityVerified:true,
  originalMeasurementsUnchanged:true,independentOfApi:true,
  career:{wins:1,losses:1,absences:0,providerReportedBoutCount:2}};
 const result=strictCareerAudit(f);
 assert.equal(result.careerResultsCertified,false);
 assert.ok(result.blockers.includes('independent-published-career-wins-losses-absences'));
 f.official.career={wins:10,losses:1,absences:null};
 assert.equal(strictCareerAudit(f).careerResultsCertified,false);
});
test('missing full JSA aggregate may be independently corroborated only alongside official tournament ledger',()=>{
 const f=fixture();f.official.career=null;
 f.weight.careerRecordCrosscheck={
  sourceUrl:'https://sumodb.sumogames.de/Rikishi.aspx?r=20',
  rawHtmlSha256:'d'.repeat(64),identityVerified:true,
  originalMeasurementsUnchanged:true,independentOfApi:true,
  career:{wins:1,losses:1,absences:0,providerReportedBoutCount:2}};
 assert.equal(strictCareerAudit(f).careerResultsCertified,true);
 f.official.bashoReconciliation.comparedBasho=0;
 assert.equal(strictCareerAudit(f).careerResultsCertified,false);
});

test('strict audit accepts an official-results-proven debut lacking a published numbered rank',()=>{
 const f=fixture();
 f.p.rankHistoryGaps=[{bashoId:'202609',
  firstPublishedRankBasho:'202611',
  status:'competed-before-first-published-banzuke-rank',
  rank:null,independentlyCertified:false}];
 f.p.rankTimeline=[{bashoId:'202611',rank:'Jonidan 22 East'}];
 f.official.officialRankRecords=[{bashoId:'202611',rank:'Jonidan 22 East'}];
 assert.equal(strictCareerAudit(f).careerResultsCertified,true);
 assert.equal(strictCareerAudit(f).missingDebutRankPreservedAsNull,true);
 f.official.officialBashoRecords=f.official.officialBashoRecords.filter(x=>x.bashoId!=='202609');
 assert.ok(strictCareerAudit(f).blockers.includes('dated-career-rank-history-incomplete'));
});

test('old certificates cannot silently disappear when a new source or parser disagrees',()=>{
 const previous={cohortSize:190,rows:[
  {sourceId:1,name:'Previously certified',careerResultsCertified:true},
  {sourceId:2,name:'Previously blocked',careerResultsCertified:false}]};
 const same={cohortSize:190,rows:[
  {sourceId:1,name:'Previously certified',careerResultsCertified:true},
  {sourceId:2,name:'Previously blocked',careerResultsCertified:true}]};
 assert.equal(preventSilentCertificationRegression(previous,same),true);
 const losing={cohortSize:190,rows:[
  {sourceId:1,name:'Previously certified',careerResultsCertified:false},
  {sourceId:2,name:'Previously blocked',careerResultsCertified:true}]};
 assert.throws(()=>preventSilentCertificationRegression(previous,losing),/regression requires independent review/);
 assert.equal(preventSilentCertificationRegression(null,same),true);
});

test('strict W-L audit can independently cover an older basho missing from JSA history',()=>{
 const f=fixture();
 f.official.officialBashoRecords=f.official.officialBashoRecords.filter(x=>x.bashoId!=='202609');
 f.official.bashoReconciliation.comparedBasho=0;
 f.official.bashoReconciliation.agreeingBasho=0;
 f.weight.careerRecordCrosscheck={
  sourceUrl:'https://sumodb.sumogames.de/Rikishi.aspx?r=20',
  identityVerified:true,originalMeasurementsUnchanged:true,
  independentOfApi:true,datedBashoLedgerSourceSha256:'f'.repeat(64),
  independentBashoRows:[{bashoId:'202609',wins:1,losses:0}],
  careerRecordDiffersFromPriorSnapshot:false
 };
 const r=strictCareerAudit(f);
 assert.equal(r.careerResultsCertified,true);
 assert.equal(r.independentlyCrosscheckedOlderBashoFromSumoDB,1);
 f.weight.careerRecordCrosscheck.independentBashoRows[0].losses=1;
 assert.ok(strictCareerAudit(f).blockers.includes('independent-official-completed-tournament-results'));
});

test('older SumoDB rank corroboration can meet strict rank threshold only with exact positions',()=>{
 const f=fixture();
 f.p.rankTimeline=[
  {bashoId:'202507',rank:'Jonidan 35 East'},
  {bashoId:'202609',rank:'Jonidan 17 East'},
  {bashoId:'202611',rank:'Jonidan 22 East'}
 ];
 f.official.officialRankRecords=[{bashoId:'202611',rank:'Jonidan 22 East'}];
 f.official.rankReconciliation={comparedBasho:1,agreedBasho:1,mismatches:[],
  missingSourceRankBasho:[]};
 f.weight.careerRecordCrosscheck={
  sourceUrl:'https://sumodb.sumogames.de/Rikishi.aspx?r=20',
  identityVerified:true,originalMeasurementsUnchanged:true,independentOfApi:true,
  datedBashoLedgerSourceSha256:'e'.repeat(64),
  independentBashoRows:[
   {bashoId:'202507',rankEn:'Jonidan 35 East'},
   {bashoId:'202609',rankEn:'Jonidan 17 East'}],
  careerRecordDiffersFromPriorSnapshot:false
 };
 assert.equal(strictCareerAudit(f).careerResultsCertified,true);
 assert.equal(strictCareerAudit(f).independentlyCrosscheckedOlderRanksFromSumoDB,2);
 f.weight.careerRecordCrosscheck.independentBashoRows[0].rankEn='Jonidan 34 East';
 assert.ok(strictCareerAudit(f).blockers.includes('independent-official-banzuke-rank-coverage'));
 f.weight.careerRecordCrosscheck.independentBashoRows[0].rankEn=null;
 assert.equal(strictCareerAudit(f).careerResultsCertified,true,
  'one exact additional rank plus one JSA rank reaches the 2/3 minimum');
 f.weight.careerRecordCrosscheck.independentBashoRows[1].rankEn=null;
 assert.ok(strictCareerAudit(f).blockers.includes('independent-official-banzuke-rank-coverage'));
});

test('strict audit can use fully sourced dated ranks when JSA publishes no historical ranks',()=>{
 const f=fixture();
 delete f.official.rankReconciliation;
 delete f.official.officialRankRecords;
 const missing=strictCareerAudit(f);
 assert.ok(missing.blockers.includes('independent-official-banzuke-rank-coverage'));
 f.weight.careerRecordCrosscheck={
  sourceUrl:'https://sumodb.sumogames.de/Rikishi.aspx?r=20',
  identityVerified:true,originalMeasurementsUnchanged:true,independentOfApi:true,
  datedBashoLedgerSourceSha256:'d'.repeat(64),
  independentBashoRows:[
   {bashoId:'202609',rankEn:'Jonidan 17 East'},
   {bashoId:'202611',rankEn:'Jonidan 22 East'}],
  careerRecordDiffersFromPriorSnapshot:false};
 const proved=strictCareerAudit(f);
 assert.equal(proved.careerResultsCertified,true);
 assert.equal(proved.rankHistoryEvidenceBasis,
  'SumoDB-dated-ranks-JSA-historical-ranks-unavailable');
 assert.equal(proved.independentlyCrosscheckedOlderRanksFromSumoDB,2);
 assert.ok(proved.independentlyVerifiedBy.some(x=>
  x.includes('JSA historical ranks unavailable')));
 assert.equal(proved.fullProfileCertified,false);
 f.weight.careerRecordCrosscheck.independentBashoRows[0].rankEn='Jonidan 19 East';
 assert.ok(strictCareerAudit(f).blockers.includes('independent-official-banzuke-rank-coverage'));
 f.weight.careerRecordCrosscheck.independentBashoRows[0].rankEn='Jonidan 17 East';
 f.official.officialRankRecords=[{bashoId:'202609',rank:'Jonidan 17 East'}];
 assert.ok(strictCareerAudit(f).blockers.includes('independent-official-banzuke-rank-coverage'),
  'an available but unverified official rank comparison cannot be bypassed');
});

test('strict audit only resolves a later JSA W-L on a dated single current-basho bout',()=>{
 const f=fixture();
 f.p.headToHead[0].meetings[1].bashoId='202611';
 f.p.headToHead[0].meetings[1].day=1;
 f.official.officialAsOf={monthYear:'November 2026',day:2};
 f.official.officialBashoRecords[1].losses=2;
 f.official.career.losses=2;
 const ok=strictCareerAudit(f);
 assert.equal(ok.careerResultsCertified,true);
 assert.equal(ok.datedJsaCareerCutoffReconciled,true);
 assert.equal(ok.datedJsaCareerCutoffEvidence.extraLosses,1);
 f.official.career.absences=null;
 assert.ok(strictCareerAudit(f).blockers.includes('independent-published-career-wins-losses-absences'));
 f.official.career.absences=0;
 f.official.career.losses=3;
 assert.ok(strictCareerAudit(f).blockers.includes('independent-published-career-wins-losses-absences'));
 f.official.career.losses=2;
 f.official.officialAsOf.day=1;
 assert.ok(strictCareerAudit(f).blockers.includes('independent-published-career-wins-losses-absences'));
});
