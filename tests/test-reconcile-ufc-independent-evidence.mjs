import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileIndependentEvidence} from '../scripts/reconcile-ufc-independent-evidence.mjs';
const roster=Array.from({length:783},(_,i)=>'fighter-'+(i+1));
const approval={schema:1,status:'approved',rosterAsOf:'2026-11-14',approvedFighters:roster};
const id='a'.repeat(16),fight='b'.repeat(16);
const record={slug:'fighter-1',fighterUrl:'https://ufcstats.com/fighter-details/'+id,
 bouts:[{date:'2025-01-01',opponent:'John Doe',result:'win',
 fightUrl:'https://ufcstats.com/fight-details/'+fight}]};
const evidence={schema:1,scope:'ufc-authorized-independent-source-export',
 rosterAsOf:'2026-11-14',accessProvenance:'authorized copy from provider',fighters:[record]};
const research={profiles:{'fighter-1':{recentHistory:[
 {date:'2025-01-01',opponent:'John Doe',promotion:'ufc',result:'win'}]}}};
test('exact saved fight match does not certify career',()=>{
 const x=reconcileIndependentEvidence(approval,research,evidence);
 assert.equal(x.summary.matchedKnownHistory,1);
 assert.equal(x.cases[0].sourceCoverageAttested,false);
 assert.equal(x.status,'offline_not_certification');
});
test('official fight missing in saved history yields explicit exception',()=>{
 const x=reconcileIndependentEvidence(approval,{profiles:{}},evidence);
 assert.equal(x.summary.mismatched,1);
 assert.equal(x.cases[0].missingFromSaved.length,1);
});
test('UTC/local one-day date offset is reviewable match, not invented extra fight',()=>{
 const x=reconcileIndependentEvidence(approval,{profiles:{'fighter-1':{
 recentHistory:[{date:'2025-01-02',opponent:'John Doe',promotion:'ufc',result:'win'}]}}},evidence);
 assert.equal(x.summary.matchedKnownHistory,1);
});
test('wrong result and missing source fight URL never passes',()=>{
 const wrong=reconcileIndependentEvidence(approval,{profiles:{'fighter-1':{
 recentHistory:[{date:'2025-01-01',opponent:'John Doe',promotion:'ufc',result:'loss'}]}}},evidence);
 assert.equal(wrong.summary.mismatched,1);
 const broken={...evidence,fighters:[{...record,bouts:[{...record.bouts[0],fightUrl:'http://example.com'}]}]};
 assert.equal(reconcileIndependentEvidence(approval,research,broken).summary.invalid,1);
});
test('unknown duplicate identities and missing provenance fail closed',()=>{
 assert.throws(()=>reconcileIndependentEvidence(approval,research,{...evidence,accessProvenance:''}));
 assert.throws(()=>reconcileIndependentEvidence(approval,research,
 {...evidence,fighters:[record,record]}));
});
