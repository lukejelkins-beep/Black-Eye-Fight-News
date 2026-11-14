import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditThreePilotSources} from '../scripts/audit-ufc-three-pilot-source-links.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const approval=read('data/ufc-36-month-roster-approval.json');
const official=read('data/ufc-official-career-bout-inventory.json');
const independent=read('data/ufc-three-pilot-source-linked-evidence.json');
const clone=o=>JSON.parse(JSON.stringify(o));
const native=()=>{
 const research={profiles:{}};
 let i=1;
 for(const [slug,entry] of Object.entries(independent.fighters)){
  research.profiles[slug]={recentHistory:entry.bouts.map(b=>({date:b.date,
   opponent:b.opponent,result:b.result,promotion:'ufc',source:'native',boutId:String(i++)}))};
 }
 return research;
};
test('all 24 source URLs are unique per athlete, 22 distinct fights and never independently certified',()=>{
 const data=native();
 const r=auditThreePilotSources(approval,official,independent,data,{bouts:{}});
 assert.equal(r.summary.officialBiographicalBouts,24);
 assert.equal(r.summary.exactSourceInventoryMatches,24);
 assert.equal(r.summary.savedHistoryMatches,24);
 assert.equal(r.summary.officialRowsMissingFromSavedHistory,0);
 assert.equal(r.summary.independentlyCertifiedFullCareers,0);
 const urls=Object.values(independent.fighters).flatMap(x=>x.bouts.map(y=>y.fightUrl));
 assert.equal(new Set(urls).size,22);
 assert.equal(independent.fighters['bruno-gustavo-da-silva'].bouts[0].result,'no_contest');
 assert.notEqual(independent.fighters['bruno-gustavo-da-silva'].ufcStatsFighterUrl,
  independent.fighters['bruno-gustavo-da-silva'].excludedHomonym);
});
test('verified 2025 Parker/Bruno duplicate native IDs are flagged, never counted as a sixth fight',()=>{
 const d=native(),park=d.profiles['park-hyun-sung'].recentHistory;
 park.push({date:'2025-10-18',opponent:'Bruno Gustavo da Silva',result:'loss',
   promotion:'ufc',source:'native',boutId:'83254'});
 const r=auditThreePilotSources(approval,official,independent,d,{bouts:{}});
 assert.equal(r.summary.savedHistoryMatches,24);
 assert.equal(r.summary.additionalSavedNativeRows,1);
 assert.equal(r.summary.savedDuplicateIdentityCases,1);
 assert.equal(r.fighters['park-hyun-sung'].extraSaved[0].nativeFightId,'83254');
 assert.equal(r.summary.independentlyCertifiedFullCareers,0);
});
test('source document cannot self-attest, forge 24th fighter result or invent detail URLs',()=>{
 const src=clone(independent);src.sourceCoverageAttested=true;
 assert.throws(()=>auditThreePilotSources(approval,official,src,native(),{}),/fail-closed/);
 src.sourceCoverageAttested=false;
 src.fighters['carlos-hernandez-7'].bouts[0].result='loss';
 assert.throws(()=>auditThreePilotSources(approval,official,src,native(),{}),/not mapped/);
 src.fighters['carlos-hernandez-7'].bouts[0].result='win';
 src.fighters['carlos-hernandez-7'].bouts[0].fightUrl='https://example.com/fake';
 assert.throws(()=>auditThreePilotSources(approval,official,src,native(),{}),/not mapped/);
});
test('source-linked official bout missing from native history remains unresolved',()=>{
 const d=native();
 d.profiles['bruno-gustavo-da-silva'].recentHistory.shift();
 const r=auditThreePilotSources(approval,official,independent,d,{bouts:{}});
 assert.equal(r.summary.exactSourceInventoryMatches,24);
 assert.equal(r.summary.savedHistoryMatches,23);
 assert.equal(r.summary.officialRowsMissingFromSavedHistory,1);
 assert.equal(r.summary.independentlyCertifiedFullCareers,0);
});
