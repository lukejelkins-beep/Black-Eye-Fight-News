import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {preflightRikishi,proveZeroCareerAbsencesFromCompleteBasho,independentlyCorroboratedProfileWeightForCareerOnly}
 from '../scripts/sumo-certification-preflight-190.mjs';

const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const root='data/sumo/backfill/v1/';
const cohort=read('data/sumo/rikishi-index.json');
const wrestler=id=>cohort.rikishi.find(x=>x.sourceId===id);
const projected=id=>read(root+'profile-ready/'+id+'.json');
const official=id=>read(root+'jsa-public/profiles/'+id+'.json');
const source=id=>read(root+'weight-source-crosschecks/'+id+'.json');
const cached=id=>read(root+'rikishi/'+id+'.json');
const note=read(root+'manual-source-review-20261116.json');

test('Gojinyu eight-bout July 2026 tournament proves attendance only when the JSA exactly corroborates 3-5',()=>{
 const id=88,w=wrestler(id),p=projected(id),j=official(id),s=source(id);
 const july=p.perBasho.find(x=>x.bashoId==='202607');
 const independent=j.officialBashoRecords.find(x=>x.bashoId==='202607');
 assert.deepEqual([july.wins,july.losses,july.scheduledBoutRows],[3,5,8]);
 assert.deepEqual([independent.wins,independent.losses],[3,5]);
 const proof=proveZeroCareerAbsencesFromCompleteBasho(p,j,s,'202611');
 assert.equal(proof.passed,true,JSON.stringify(proof));
 assert.equal(proof.completedBashoProven,28);
 const decision=preflightRikishi(w,p,j,s,'202611');
 assert.equal(decision.classification,'candidate-for-strict-audit',JSON.stringify(decision.blockers));
 assert.equal(decision.fullAttendanceZeroAbsencesProved,true);
 assert.equal(decision.certified,false);
 assert.equal(decision.productionReleaseApproved,false);
 const contradictory=structuredClone(j);
 contradictory.officialBashoRecords.find(x=>x.bashoId==='202607').losses=4;
 assert.equal(proveZeroCareerAbsencesFromCompleteBasho(p,contradictory,s,'202611').passed,false);
 const uncorroborated=structuredClone(p);
 const altered=uncorroborated.perBasho.find(x=>x.bashoId==='202607');
 altered.losses=6;
 altered.scheduledBoutRows=9;
 assert.equal(proveZeroCareerAbsencesFromCompleteBasho(uncorroborated,j,s,'202611').passed,false);
 const missing=structuredClone(p);
 const alteredMissing=missing.perBasho.find(x=>x.bashoId==='202607');
 alteredMissing.losses=3;
 alteredMissing.scheduledBoutRows=6;
 assert.equal(proveZeroCareerAbsencesFromCompleteBasho(missing,j,s,'202611').passed,false);
});

test('Ikawasakura and Kototsubasa differ only by one win in active November 2026 tournament, not in completed overlap',()=>{
 for(const [id,priorExpected] of [[118,83],[172,115]]){
  const p=projected(id),s=source(id),independent=s.careerRecordCrosscheck;
  const byDate=new Map(independent.independentBashoRows.map(x=>[String(x.bashoId),x]));
  const completed=p.perBasho.filter(x=>x.bashoId!=='202611');
  assert.equal(completed.length,priorExpected);
  for(const row of completed){
   const other=byDate.get(row.bashoId);
   assert.ok(other,'Missing independently corroborated basho: '+id+' '+row.bashoId);
   assert.deepEqual([other.wins,other.losses],[row.wins,row.losses],id+' '+row.bashoId);
  }
  const active=p.perBasho.find(x=>x.bashoId==='202611');
  const latest=byDate.get('202611');
  assert.equal(latest.wins-active.wins,1);
  assert.equal(latest.losses-active.losses,0);
  assert.equal(independent.career.wins-p.career.wins,1);
  assert.equal(independent.career.losses,p.career.losses);
  assert.equal(independent.career.absences,p.career.absences);
  const reviewed=note.cases.find(c=>c.sourceId===id);
  assert.equal(reviewed.historicalOverlapReconciliation.historicalWLDisagreements,0);
  assert.equal(reviewed.historicalOverlapReconciliation.projectedCompletedBasho,priorExpected);
 }
 assert.equal(note.certificationEffect,'none');
});

test('unpublished absences and stale-profile weight remain unknown or flagged, never silently certified',()=>{
 for(const id of [112,98]){
  const p=projected(id),j=official(id),s=source(id);
  assert.equal(j.career.absences-p.career.absences,1);
  assert.equal(s.careerRecordCrosscheck.career.absences,p.career.absences);
  assert.equal(note.cases.find(x=>x.sourceId===id).cachedSumoDbCareer.absences,p.career.absences);
 }
 const g=official(88);
 assert.equal(g.career.absences,null);
 assert.equal(source(88).careerRecordCrosscheck.career.absences,null);
 const t=cached(9104),j=official(9104),n=note.cases.find(c=>c.sourceId===9104);
 assert.equal(t.data.profile.weight,172);
 assert.equal(t.data.measurements[0].weight,173);
 assert.equal(j.weightKg,173);
 assert.equal(n.liveIndependentSources.sumodbProfileWeightKg,173);
 assert.equal(n.certified??false,false);
});

test('Tenshoyama corroborated weight-only conflict is retained without blocking unrelated career results',()=>{
 const id=9104,w=wrestler(id),p=projected(id),j=official(id),s=source(id);
 const reviewed=independentlyCorroboratedProfileWeightForCareerOnly(w,p,j,s);
 assert.equal(reviewed.passed,true,JSON.stringify(reviewed));
 assert.equal(reviewed.officialJsaWeightKg,173);
 assert.equal(reviewed.preservedRawApiProfileWeightKg,172);
 assert.equal(reviewed.weightProfileFieldStillDisputed,true);
 assert.equal(reviewed.historicalWeightTimelineCertified,false);
 const pre=preflightRikishi(w,p,j,s,'202611');
 assert.equal(pre.classification,'candidate-for-strict-audit',JSON.stringify(pre.blockers));
 assert.equal(pre.certified,false);
 assert.equal(pre.productionReleaseApproved,false);
 const falseHeight=structuredClone(j);
 falseHeight.fieldComparisons.height=false;
 assert.equal(independentlyCorroboratedProfileWeightForCareerOnly(w,p,falseHeight,s).passed,false);
 const wrongBirth=structuredClone(s);
 wrongBirth.identityEvidence.birthDateStatus='mismatch';
 assert.equal(independentlyCorroboratedProfileWeightForCareerOnly(w,p,j,wrongBirth).passed,false);
 const noDatedApi=structuredClone(p);
 noDatedApi.measurements=noDatedApi.measurements.filter(x=>x.source!=='Sumo API historical change');
 assert.equal(independentlyCorroboratedProfileWeightForCareerOnly(w,noDatedApi,j,s).passed,false);
 const noDatedIndependent=structuredClone(s);
 noDatedIndependent.datedEvidence=[];
 assert.equal(independentlyCorroboratedProfileWeightForCareerOnly(w,p,j,noDatedIndependent).passed,false);
 assert.equal(cached(id).data.profile.weight,172);
 assert.equal(official(id).weightKg,173);
});
