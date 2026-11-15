import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {preflightRikishi,summarizePreflight}
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
