import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditCorrectedJsaTournament} from '../scripts/sumo-jsa-corrected-basho-audit.mjs';
const file=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=file('data/sumo/rikishi-index.json');
const manifest=file('data/sumo/backfill/v1/official-bout-corrections.json');
const w=roster.rikishi.find(x=>x.sourceId===242);
const official=file('data/sumo/backfill/v1/jsa-public/profiles/242.json');
const api=file('data/sumo/backfill/v1/rikishi/242.json');
test('Obara July 2022 JSA 3-3 result reconciles via prior verified forfeit correction',()=>{
 const original=api.data.matches.find(x=>x.bashoId==='202207'&&x.day===12);
 assert.equal(original.winnerId,242);
 const cleaned=auditCorrectedJsaTournament(w,official,api,manifest);
 const july=cleaned.bashoReconciliation.discrepancies.find(x=>x.bashoId==='202207');
 assert.equal(july,undefined);
 assert.equal(cleaned.bashoReconciliation.discrepantBasho,0);
 assert.equal(cleaned.bashoReconciliation.officialOutcomeOverlays.length,1);
 assert.equal(cleaned.bashoReconciliation.officialOutcomeOverlays[0].newWinnerId,213);
 assert.equal(cleaned.bashoReconciliation.rawSourceMatchesChanged,false);
 assert.equal(original.winnerId,242,'raw API bout must never be overwritten');
 assert.equal(cleaned.bashoReconciliation.certified,false);
 assert.equal(cleaned.bashoReconciliation.careerCertified,false);
});
test('reject false JSA identity and invalid corrections instead of silently fixing history',()=>{
 const wrong={...official,sourceId:111};
 assert.throws(()=>auditCorrectedJsaTournament(w,wrong,api,manifest),/identity/);
 const rules=structuredClone(manifest);
 rules.bySourceId['242'][0].verifiedOfficialWinnerId=99999;
 assert.throws(()=>auditCorrectedJsaTournament(w,official,api,rules),/validation failed/);
});
test('no official correction means no implied result adjustment',()=>{
 const without={...manifest,bySourceId:{}};
 const unadjusted=auditCorrectedJsaTournament(w,official,api,without);
 assert.equal(unadjusted.bashoReconciliation.discrepantBasho,1);
 assert.equal(unadjusted.bashoReconciliation.officialOutcomeOverlays.length,0);
 assert.equal(unadjusted.bashoReconciliation.discrepancies[0].bashoId,'202207');
});

test('corrected JSA comparison uses frozen active-basho cutoff when career as-of missing',()=>{
 const copied=structuredClone(official);
 copied.officialAsOf=null;
 copied.officialBashoRecords=[...copied.officialBashoRecords,
  {bashoId:'202611',wins:9,losses:4,absences:null}];
 const report=auditCorrectedJsaTournament(w,copied,api,manifest,'202611');
 assert.equal(report.bashoReconciliation.excludedCurrentBasho,'202611');
 assert.equal(report.bashoReconciliation.currentBashoExclusionEvidence,'frozen-cohort-basho');
 assert.ok(!report.bashoReconciliation.discrepancies.some(x=>x.bashoId==='202611'));
 assert.equal(report.bashoReconciliation.certified,false);
});
