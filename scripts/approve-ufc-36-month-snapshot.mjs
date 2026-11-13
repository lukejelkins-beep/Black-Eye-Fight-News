#!/usr/bin/env node
/**
 * Freeze the explicitly approved 14 Nov 2026 fighter cohort from the exact
 * immutable GitHub audit commit. No provider calls; no new data collector.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const AUDIT=Object.freeze({
  commit:'65d66aa3d6d0d8e91e7c96858d000253163a9892',
  workflowRun:43519481276,
  artifactId:14081822686,
  artifactDigest:'sha256:b075e262f358b5d18a3721864d0e6c7ffbcec59cd4001154004c5f827e6b4323',
  rosterAsOf:'2026-11-14',
  activityCutoff:'2023-11-14',
  rosterCount:783,
  excludedCount:332,
  completedEvents:127
});
const summaryValid=r=>r?.schema===1&&r?.scope==='ufc-36-month-roster-review'&&
  r?.summary?.eventScanComplete===true&&
  r?.summary?.missingOfficialEventDetails===0&&
  r?.summary?.integrityIssues===0&&
  r?.summary?.openExceptions===0&&
  Array.isArray(r.exceptions)&&r.exceptions.length===0&&
  Array.isArray(r.integrityIssues)&&r.integrityIssues.length===0;

export function buildSignedOffManifest(audit,current,previous={},approvedAt='2026-11-14'){
  assert.ok(summaryValid(audit),'Frozen audit must be complete and have zero exceptions');
  const s=audit.summary;
  assert.equal(s.asOf,AUDIT.rosterAsOf,'Snapshot date differs from explicit approval');
  assert.equal(s.activityCutoff,AUDIT.activityCutoff,'36-month cutoff differs from approved audit');
  assert.equal(s.indexedOfficialEvents,AUDIT.completedEvents,'Event count differs from approved audit');
  assert.equal(s.provisionalIncluded,AUDIT.rosterCount,'Provisional roster count changed');
  assert.equal(s.proposedWithoutExceptions,AUDIT.rosterCount,'Proposed cohort count changed');
  assert.equal(s.excludedCount,AUDIT.excludedCount,'Exclusions differ from approved audit');
  assert.equal(audit.exclusions?.length,AUDIT.excludedCount,'Excluded rows must be present');
  assert.deepEqual(s.exclusionsByReason,{
    no_official_ufc_fight_in_36_months:193,
    official_ufc_status_not_fighting:10,
    later_professional_mma_outside_official_ufc:105,
    confirmed_left_ufc:13,
    confirmed_retired:11
  },'Exclusion reasons must reproduce audited evidence');
  assert.equal(audit.proposedRoster?.length,AUDIT.rosterCount,'Exact approved slugs required');
  const slugs=audit.proposedRoster.map(f=>f.slug);
  assert.ok(slugs.every(v=>typeof v==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)),
    'Invalid fighter slug');
  assert.equal(new Set(slugs).size,AUDIT.rosterCount,'Duplicate approved fighter');
  assert.ok(summaryValid(current),'Current census is not complete or has exceptions');
  assert.ok(current.summary.asOf>=AUDIT.rosterAsOf,
    'Current census predates the frozen signed-off snapshot');
  assert.equal(previous.schema,1,'Approval gate schema changed');
  assert.equal(previous.scope,'ufc-36-month-roster','Approval gate scope changed');
  assert.ok(['pending_review','approved'].includes(previous.status),
    'Approval gate is in an unexpected state');
  const ordered=slugs.sort();
  const snapshotSha256=createHash('sha256').update(ordered.join('\n')+'\n').digest('hex');
  if(previous.status==='approved'){
    assert.deepEqual(previous.approvedFighters,ordered,
      'An already signed-off roster may not be replaced silently');
    assert.equal(previous.rosterAsOf,AUDIT.rosterAsOf,
      'Already approved snapshot date may not change');
    return previous;
  }
  const currentSet=new Set(current.proposedRoster.map(f=>f.slug));
  const unavailable=ordered.filter(v=>!currentSet.has(v));
  console.log('Current audit roster differences: '+unavailable.length+
    ' original approved slugs no longer eligible; Stage 3 intersects current eligibility');
  assert.match(approvedAt,/^2026-11-14$/,'Approval date must match explicit user confirmation');
  return {
    schema:1,
    scope:'ufc-36-month-roster',
    status:'approved',
    rosterAsOf:AUDIT.rosterAsOf,
    approvedAt,
    approvedBy:'user',
    approvedFighters:ordered,
    approvedCount:AUDIT.rosterCount,
    approvedRosterSha256:snapshotSha256,
    auditCommit:AUDIT.commit,
    auditWorkflowRun:AUDIT.workflowRun,
    auditArtifactId:AUDIT.artifactId,
    auditArtifactDigest:AUDIT.artifactDigest,
    note:'User approved exactly 783 reviewed fighters on 14 November 2026. This immutable allowlist is intersected with refreshed current eligibility; new arrivals and exclusions are not silently added. Stage 3 reuses saved career history and cached fight statistics and must not spawn a second collector.'
  };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,4,
    'Usage: node scripts/approve-ufc-36-month-snapshot.mjs <frozen-review.json> <current-review.json>');
  const audit=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  const current=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
  const approvalPath=path.join(root,'data/ufc-36-month-roster-approval.json');
  const previous=JSON.parse(fs.readFileSync(approvalPath,'utf8'));
  const approval=buildSignedOffManifest(audit,current,previous);
  fs.writeFileSync(approvalPath,JSON.stringify(approval,null,2)+'\n');
  console.log('BEFN_STAGE3_APPROVED='+JSON.stringify({
    approvedFighters:approval.approvedFighters.length,
    rosterAsOf:approval.rosterAsOf,
    approvedRosterSha256:approval.approvedRosterSha256,
    currentProposed:current.summary.proposedWithoutExceptions,
    previousApprovalStatus:previous.status
  }));
}