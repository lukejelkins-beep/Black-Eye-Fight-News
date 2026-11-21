import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {preflightRikishi,summarizePreflight,planPreflightNextAction,documentedDebutRankGap,supplementalHistoricalBashoCoverage,independentHistoricalRankCoverage,independentlyVerifiedCurrentBashoCutoff,proveZeroCareerAbsencesFromCompleteBasho}
 from '../scripts/sumo-certification-preflight-190.mjs';
const get=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const roster=get('data/sumo/rikishi-index.json');
const w=roster.rikishi.find(x=>x.sourceId===28);
const profile=get('data/sumo/backfill/v1/profile-ready/28.json');
const official=get('data/sumo/backfill/v1/jsa-public/profiles/28.json');
const sumodb=get('data/sumo/backfill/v1/weight-source-crosschecks/28.json');
const sample=()=>({
 p:structuredClone(profile),
 j:{...structuredClone(official),
  officialRankRecords:profile.rankTimeline.slice(0,59).map(x=>({
   bashoId:x.bashoId,rank:x.rank})),
  rankReconciliation:{comparedBasho:59,agreedBasho:59,
   mismatches:[],missingSourceRankBasho:[]},
  bashoReconciliation:{...structuredClone(official.bashoReconciliation),
    comparedBasho:59,discrepantBasho:0,unmatchedOfficialBasho:[]}},
 s:structuredClone(sumodb)});
test('complete sourced research record may enter an audit queue but cannot self-certify',()=>{
 const {p,j,s}=sample();
 const row=preflightRikishi(w,p,j,s,'202611');
 assert.equal(row.sourceId,28);
 assert.equal(row.classification,'candidate-for-strict-audit');
 assert.deepEqual(row.blockers,[]);
 assert.equal(row.strictAuditPassed,false);
 assert.equal(row.certified,false);
 assert.equal(row.productionReleaseApproved,false);
 assert.equal(row.completedHistoricalBoutTournaments,59);
});
test('birth-date source gaps, incomplete JSA totals, and official-rank omissions remain separate blockers',()=>{
 const {p,j,s}=sample();
 s.identityRecheck.identityEvidence.birthDateStatus='source-birth-date-missing';
 j.career=null;
 j.rankReconciliation=null;
 const row=preflightRikishi(w,p,j,s,'202611');
 assert.equal(row.classification,'needs-source-or-manual-review');
 assert.ok(row.blockers.includes('independent-SumoDB-birth-date-not-verified'));
 assert.ok(row.blockers.includes('official-JSA-career-totals-unpublished-or-disagree'));
 assert.ok(row.blockers.includes('independent-JSA-historical-ranks-not-compared'));
 assert.equal(row.certified,false);
});
test('explicit non-absence official tournament discrepancy never becomes a fast-lane candidate',()=>{
 const {p,j,s}=sample();
 j.bashoReconciliation.unmatchedOfficialBasho=['202601'];
 j.officialBashoRecords=[...j.officialBashoRecords,{bashoId:'202601',wins:9,losses:6}];
 const row=preflightRikishi(w,p,j,s,'202611');
 assert.ok(row.blockers.includes('official-nonabsence-basho-rows-unreconciled'));
 assert.equal(row.strictAuditPassed,false);
});
test('preflight rejects mismatched fighter IDs and requires exactly 190 unique cohort cases',()=>{
 const {p,j,s}=sample();
 assert.throws(()=>preflightRikishi({...w,officialNskId:12345},p,j,s,'202611'),
  /identity/);
 const baseline=preflightRikishi(w,p,j,s,'202611');
 const rows=Array.from({length:190},(_,i)=>({...baseline,sourceId:1000+i}));
 const report=summarizePreflight(rows);
 assert.equal(report.cohortSize,190);
 assert.equal(report.candidateForStrictAudit,190);
 assert.equal(report.certified,0);
 assert.equal(report.productionApproved,false);
 assert.throws(()=>summarizePreflight([...rows,rows[0]]),/190/);
});

test('preflight assigns next action to a single existing worker without self-certifying',()=>{
 const rank=planPreflightNextAction(['independent-JSA-historical-ranks-not-compared']);
 assert.equal(rank.lane,'official-rank-recheck');
 assert.equal(rank.owner,'existing JSA source worker');
 const dob=planPreflightNextAction(['independent-SumoDB-birth-date-not-verified']);
 assert.equal(dob.lane,'source-identity-recheck');
 const both=planPreflightNextAction(['independent-JSA-historical-ranks-not-compared',
  'official-completed-basho-ledger-coverage-incomplete']);
 assert.equal(both.lane,'official-tournament-gap');
 const fast=planPreflightNextAction([]);
 assert.equal(fast.lane,'fast-lane-strict-audit');
 assert.match(fast.nextAction,/cannot be granted by preflight/);
});
test('190-fighter preflight lane counts reconcile with candidates and manual blockers',()=>{
 const {p,j,s}=sample();
 const candidate=preflightRikishi(w,p,j,s,'202611');
 const rows=Array.from({length:190},(_,i)=>({...candidate,sourceId:i+1000}));
 rows[0]={...rows[0],blockers:['independent-JSA-historical-ranks-not-compared'],
  classification:'needs-source-or-manual-review',certificationLane:'official-rank-recheck'};
 const report=summarizePreflight(rows);
 assert.equal(report.candidateForStrictAudit,189);
 assert.equal(report.needsSourceOrManualReview,1);
 assert.equal(report.certificationLanes['fast-lane-strict-audit'],189);
 assert.equal(report.certificationLanes['official-rank-recheck'],1);
 assert.equal(report.certified,0);
});

test('independent SumoDB W-L-A fills only unpublished JSA career fields',()=>{
 const {p,j,s:independent}=sample();
 independent.careerRecordCrosscheck={
  sourceUrl:'https://sumodb.sumogames.de/Rikishi.aspx?r='+w.sumoDbId,
  rawHtmlSha256:'a'.repeat(64),identityVerified:true,
  originalMeasurementsUnchanged:true,independentOfApi:true,
  career:{wins:p.career.wins,losses:p.career.losses,absences:p.career.absences}
 };
 j.career={...j.career,absences:null};
 let row=preflightRikishi(w,p,j,independent,'202611');
 assert.equal(row.classification,'candidate-for-strict-audit');
 assert.equal(row.careerTotalsEvidence,'independent-SumoDB-three-part-career-record-plus-JSA-basho');
 j.career=null;
 row=preflightRikishi(w,p,j,independent,'202611');
 assert.equal(row.classification,'candidate-for-strict-audit');
 independent.careerRecordCrosscheck.career.absences=null;
 row=preflightRikishi(w,p,j,independent,'202611');
 assert.ok(row.blockers.includes('official-absence-total-unpublished-or-disagree'));
});
test('an explicit JSA disagreement blocks preflight even when SumoDB matches the cache',()=>{
 const {p,j,s:independent}=sample();
 independent.careerRecordCrosscheck={
  identityVerified:true,originalMeasurementsUnchanged:true,independentOfApi:true,
  career:{wins:p.career.wins,losses:p.career.losses,absences:p.career.absences}
 };
 j.career={wins:p.career.wins+1,losses:p.career.losses,absences:p.career.absences};
 const row=preflightRikishi(w,p,j,independent,'202611');
 assert.ok(row.blockers.includes('official-JSA-career-totals-unpublished-or-disagree'));
 assert.equal(row.classification,'needs-source-or-manual-review');
});

test('JSA-documented collegiate debut can precede numbered banzuke without inventing a rank',()=>{
 const entrant=roster.rikishi.find(x=>x.sourceId===9084);
 const p=get('data/sumo/backfill/v1/profile-ready/9084.json');
 const j=get('data/sumo/backfill/v1/jsa-public/profiles/9084.json');
 const s=get('data/sumo/backfill/v1/weight-source-crosschecks/9084.json');
 assert.equal(p.rankHistoryGaps[0].rank,null);
 assert.equal(documentedDebutRankGap(p,j),true);
 const row=preflightRikishi(entrant,p,j,s,'202611');
 assert.equal(row.documentedNoPublishedNumberedDebutRank,true);
 assert.equal(row.debutRankStillUnpublished,p.rankHistoryGaps[0].bashoId);
 assert.ok(!row.blockers.includes('complete-rank-timeline-not-evidenced'));
 const changed=structuredClone(j);
 changed.officialBashoRecords=changed.officialBashoRecords.filter(x=>
  x.bashoId!==p.rankHistoryGaps[0].bashoId);
 assert.equal(documentedDebutRankGap(p,changed),false);
 const blocked=preflightRikishi(entrant,p,changed,s,'202611');
 assert.ok(blocked.blockers.includes('complete-rank-timeline-not-evidenced'));
});

test('truncated JSA early tournaments need every missing bout ledger row independently sourced',()=>{
 const historicalProfile=get('data/sumo/backfill/v1/profile-ready/44.json');
 const jsa=get('data/sumo/backfill/v1/jsa-public/profiles/44.json');
 const saved=get('data/sumo/backfill/v1/weight-source-crosschecks/44.json');
 const inJsa=new Set(jsa.officialBashoRecords.map(x=>x.bashoId));
 const missing=historicalProfile.perBasho.filter(x=>
  x.bashoId!=='202611'&&x.scheduledBoutRows>0&&!inJsa.has(x.bashoId));
 assert.ok(missing.length>20,'legacy wrestler must expose truncated JSA years');
 const source={...saved,careerRecordCrosscheck:{
  sourceUrl:'https://sumodb.sumogames.de/Rikishi.aspx?r='+saved.sumoDbId,
  identityVerified:true,originalMeasurementsUnchanged:true,independentOfApi:true,
  datedBashoLedgerSourceSha256:'a'.repeat(64),
  independentBashoRows:historicalProfile.perBasho.map(x=>({
   bashoId:x.bashoId,wins:x.wins,losses:x.losses})),
  careerRecordDiffersFromPriorSnapshot:false
 }};
 const verified=supplementalHistoricalBashoCoverage(historicalProfile,jsa,source,'202611');
 assert.equal(verified.passed,true);
 assert.equal(verified.otherSourceBasho,missing.length);
 const broken=structuredClone(source);
 broken.careerRecordCrosscheck.independentBashoRows=
  broken.careerRecordCrosscheck.independentBashoRows.filter(x=>x.bashoId!==missing[0].bashoId);
 assert.equal(supplementalHistoricalBashoCoverage(historicalProfile,jsa,broken,'202611').passed,false);
 const altered=structuredClone(source);
 const overlapping=altered.careerRecordCrosscheck.independentBashoRows.find(x=>inJsa.has(x.bashoId)&&x.bashoId!=='202611');
 overlapping.wins+=1;
 assert.ok(supplementalHistoricalBashoCoverage(historicalProfile,jsa,altered,'202611').sourceOverlapConflicts>0);
});

test('fast-lane preflight requires at least three quarters of the numbered rank history crosschecked',()=>{
 const {p,j,s}=sample();
 const threshold=Math.max(1,Math.floor(p.rankTimeline.length*0.75));
 assert.ok(threshold>1);
 const independentRanks=p.rankTimeline.slice(0,threshold).map(x=>({
  bashoId:x.bashoId,rank:x.rank}));
 j.rankReconciliation.comparedBasho=threshold-1;
 j.rankReconciliation.agreedBasho=threshold-1;
 j.officialRankRecords=independentRanks.slice(0,threshold-1);
 const short=preflightRikishi(w,p,j,s,'202611');
 assert.ok(short.blockers.includes('independent-JSA-historical-ranks-not-compared'));
 assert.equal(short.classification,'needs-source-or-manual-review');
 j.rankReconciliation.comparedBasho=threshold;
 j.rankReconciliation.agreedBasho=threshold;
 j.officialRankRecords=independentRanks;
 const adequate=preflightRikishi(w,p,j,s,'202611');
 assert.ok(!adequate.blockers.includes('independent-JSA-historical-ranks-not-compared'));
});

test('old JSA rank-window gaps require exact dated independent rank observations',()=>{
 const p=get('data/sumo/backfill/v1/profile-ready/14.json');
 const j=get('data/sumo/backfill/v1/jsa-public/profiles/14.json');
 const source=get('data/sumo/backfill/v1/weight-source-crosschecks/14.json');
 // Source snapshots evolve while scheduled workers progress. Test the
 // JSA-only baseline independently of already cached supplementary evidence.
 const noSupplement=structuredClone(source);
 delete noSupplement.careerRecordCrosscheck;
 const standard=independentHistoricalRankCoverage(p,j,noSupplement);
 assert.equal(standard.passed,false,'official rank excerpt alone is too short');
 const officialDates=new Set(j.officialRankRecords.map(x=>x.bashoId));
 const supplemented=structuredClone(noSupplement);
 supplemented.careerRecordCrosscheck={
  sourceUrl:'https://sumodb.sumogames.de/Rikishi.aspx?r='+source.sumoDbId,
  identityVerified:true,originalMeasurementsUnchanged:true,
  independentOfApi:true,datedBashoLedgerSourceSha256:'e'.repeat(64),
  independentBashoRows:p.rankTimeline.filter(x=>!officialDates.has(x.bashoId))
   .map(x=>({bashoId:x.bashoId,rankEn:x.rank})),
  careerRecordDiffersFromPriorSnapshot:false
 };
 const pass=independentHistoricalRankCoverage(p,j,supplemented);
 assert.equal(pass.passed,true);
 assert.ok(pass.independentAdditional>0);
 supplemented.careerRecordCrosscheck.independentBashoRows[0].rankEn='Maegashira 99 East';
 const wrong=independentHistoricalRankCoverage(p,j,supplemented);
 assert.equal(wrong.passed,false);
 assert.ok(wrong.sourceConflicts>0);
});

test('missing JSA historical rank table requires >=75% exact independent dated ranks',()=>{
 const {p,j,s}=sample();
 delete j.officialRankRecords;
 delete j.rankReconciliation;
 const minimum=Math.max(1,Math.floor(p.rankTimeline.length*0.75));
 assert.ok(minimum>1);
 const missing=independentHistoricalRankCoverage(p,j,s);
 assert.equal(missing.passed,false,'a missing JSA rank table is not a rank comparison');
 assert.equal(missing.jsaCompared,null,'do not invent a zero official comparison');
 const rows=p.rankTimeline.slice(0,minimum).map(x=>({
  bashoId:x.bashoId,rankEn:x.rank}));
 s.careerRecordCrosscheck={
  sourceUrl:'https://sumodb.sumogames.de/Rikishi.aspx?r='+s.sumoDbId,
  identityVerified:true,originalMeasurementsUnchanged:true,independentOfApi:true,
  datedBashoLedgerSourceSha256:'c'.repeat(64),
  independentBashoRows:rows,careerRecordDiffersFromPriorSnapshot:false};
 const independentlyProved=independentHistoricalRankCoverage(p,j,s);
 assert.equal(independentlyProved.passed,true);
 assert.equal(independentlyProved.jsaCompared,null);
 assert.equal(independentlyProved.evidenceBasis,
  'SumoDB-dated-ranks-JSA-historical-ranks-unavailable');
 s.careerRecordCrosscheck.independentBashoRows.pop();
 assert.equal(independentHistoricalRankCoverage(p,j,s).passed,false,
  'less than 75% exact dated ranks must remain blocked');
 s.careerRecordCrosscheck.independentBashoRows.push(rows[rows.length-1]);
 const correctRank=rows[0].rankEn;
 s.careerRecordCrosscheck.independentBashoRows[0].rankEn='Jonidan 999 East';
 assert.equal(independentHistoricalRankCoverage(p,j,s).passed,false,
  'a dated rank contradiction must never be ignored');
 s.careerRecordCrosscheck.independentBashoRows[0].rankEn=correctRank;
 j.officialRankRecords=[{bashoId:'202611',rank:'Jonidan 22 East'}];
 assert.equal(independentHistoricalRankCoverage(p,j,s).passed,false,
  'published JSA ranks lacking a validated reconciliation cannot be bypassed');
});

test('dated JSA current-basho outcome can reconcile exactly one later W/L without mutating past results',()=>{
 const p={career:{wins:60,losses:41,absences:7},
  perBasho:[{bashoId:'202611',wins:0,losses:3}],
  headToHead:[{meetings:[{bashoId:'202611',day:1},{bashoId:'202611',day:4},
   {bashoId:'202611',day:5}]}]};
 const j={rawHtmlSha256:'a'.repeat(64),
  officialAsOf:{monthYear:'November 2026',day:8},
  career:{wins:60,losses:42,absences:7},
  officialBashoRecords:[{bashoId:'202611',wins:0,losses:4}],
  bashoReconciliation:{discrepantBasho:0}};
 const result=independentlyVerifiedCurrentBashoCutoff(p,j,'202611');
 assert.equal(result.passed,true);
 assert.equal(result.extraLosses,1);
 assert.equal(result.lastCachedBoutDay,5);
 assert.equal(result.sourceDay,8);
 // Never use publication lag to hide contradictory historical aggregates,
 // omitted absence totals, an undated source or two new bouts.
 for(const change of [
  x=>{x.career.absences=null;},
  x=>{x.career.losses=43;},
  x=>{x.officialBashoRecords[0].losses=5;},
  x=>{x.officialAsOf.day=5;},
  x=>{x.officialAsOf.monthYear='September 2026';},
  x=>{x.rawHtmlSha256='bad';},
  x=>{x.bashoReconciliation.discrepantBasho=1;}
 ]){
  const altered=structuredClone(j);change(altered);
  assert.equal(independentlyVerifiedCurrentBashoCutoff(p,altered,'202611').passed,false);
 }
});

test('native zero absences needs independently verified FULL numbered-rank tournament attendance',()=>{
 const p={career:{wins:5,losses:5,absences:0},
  perBasho:[
   {bashoId:'202609',wins:3,losses:4,scheduledBoutRows:7},
   {bashoId:'202611',wins:2,losses:1,scheduledBoutRows:3}],
  rankTimeline:[{bashoId:'202609',rank:'Makushita 10 East'},
   {bashoId:'202611',rank:'Makushita 6 East'}],
  rankHistoryGaps:[],
  headToHead:[{meetings:[{bashoId:'202611',day:1},
   {bashoId:'202611',day:3},{bashoId:'202611',day:5}]}]};
 const j={rawHtmlSha256:'a'.repeat(64),
  officialAsOf:{monthYear:'November 2026',day:8},
  career:{wins:5,losses:5,absences:null},
  officialBashoRecords:[{bashoId:'202609',wins:3,losses:4},
   {bashoId:'202611',wins:2,losses:1}],
  bashoReconciliation:{comparedBasho:1,agreeingBasho:1,discrepantBasho:0}};
 const ok=proveZeroCareerAbsencesFromCompleteBasho(p,j,null,'202611');
 assert.equal(ok.passed,true);
 assert.equal(ok.completedBashoProven,1);
 assert.equal(ok.officialCareerAbsencesPublished,false);
 // Confirm no missing aggregate is rewritten to a made-up numeric zero.
 assert.equal(j.career.absences,null);
 assert.equal(p.career.absences,0);
 const changedP=structuredClone(p);
 changedP.perBasho[0].losses=3;
 changedP.perBasho[0].scheduledBoutRows=6;
 assert.equal(proveZeroCareerAbsencesFromCompleteBasho(changedP,j,null,'202611').passed,false);
 const missingP=structuredClone(p);
 missingP.perBasho=missingP.perBasho.slice(1);
 assert.equal(proveZeroCareerAbsencesFromCompleteBasho(missingP,j,null,'202611').passed,false);
 const a=structuredClone(j);
 a.officialBashoRecords[0].losses=3;
 assert.equal(proveZeroCareerAbsencesFromCompleteBasho(p,a,null,'202611').passed,false);
 const conflict=structuredClone(j);
 conflict.career.absences=1;
 assert.equal(proveZeroCareerAbsencesFromCompleteBasho(p,conflict,null,'202611').passed,false);
 const nonzero=structuredClone(p);nonzero.career.absences=2;
 assert.equal(proveZeroCareerAbsencesFromCompleteBasho(nonzero,j,null,'202611').passed,false);
 const next=structuredClone(j);
 next.officialAsOf.day=3;
 assert.equal(proveZeroCareerAbsencesFromCompleteBasho(p,next,null,'202611').passed,false,
  'an official earlier-day snapshot cannot verify later cached bouts');
});
test('current-basho lag is documented separately and cannot conceal two missing bouts',()=>{
 const p={career:{wins:5,losses:5,absences:0},
  perBasho:[{bashoId:'202609',wins:3,losses:4,scheduledBoutRows:7},
   {bashoId:'202611',wins:2,losses:1,scheduledBoutRows:3}],
  rankTimeline:[{bashoId:'202609',rank:'Jonidan 10 West'},
   {bashoId:'202611',rank:'Jonidan 4 West'}],
  rankHistoryGaps:[],headToHead:[{meetings:[{bashoId:'202611',day:5}]}]};
 const j={rawHtmlSha256:'a'.repeat(64),
  officialAsOf:{monthYear:'November 2026',day:8},
  career:{wins:6,losses:5,absences:null},
  officialBashoRecords:[{bashoId:'202609',wins:3,losses:4},
   {bashoId:'202611',wins:3,losses:1}],
  bashoReconciliation:{comparedBasho:1,agreeingBasho:1,discrepantBasho:0}};
 assert.equal(proveZeroCareerAbsencesFromCompleteBasho(p,j,null,'202611').passed,true);
 j.career.wins=7;j.officialBashoRecords[1].wins=4;
 assert.equal(proveZeroCareerAbsencesFromCompleteBasho(p,j,null,'202611').passed,false);
});
