import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {preflightRikishi,summarizePreflight,planPreflightNextAction,documentedDebutRankGap,supplementalHistoricalBashoCoverage}
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
  rankReconciliation:{comparedBasho:59,mismatches:[]},
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
 j.rankReconciliation.comparedBasho=threshold-1;
 const short=preflightRikishi(w,p,j,s,'202611');
 assert.ok(short.blockers.includes('independent-JSA-historical-ranks-not-compared'));
 assert.equal(short.classification,'needs-source-or-manual-review');
 j.rankReconciliation.comparedBasho=threshold;
 const adequate=preflightRikishi(w,p,j,s,'202611');
 assert.ok(!adequate.blockers.includes('independent-JSA-historical-ranks-not-compared'));
});
