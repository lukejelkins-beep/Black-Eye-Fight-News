import test from 'node:test';
import assert from 'node:assert/strict';
import {auditR1Boundary,releaseOnePaths} from '../scripts/verify-ufc-v4-r1-boundary.mjs';

const approval=()=>({status:'approved',rosterAsOf:'2026-11-14',
 approvedFighters:Array.from({length:783},(_,i)=>'fighter-'+i)});
const registry=()=>({scope:'ufc-independent-full-career-verification',
 rosterAsOf:'2026-11-14',fighters:{
  'fighter-1':{sourceCoverageAttested:true,
   certificationStatus:'independently_verified_full_career_pending_offline_ci'}
 }});

test('allows only read-only R1 safety files with immutable roster',()=>{
 const r=auditR1Boundary({changedFiles:[...releaseOnePaths],approval:approval(),registry:registry()});
 assert.equal(r.ok,true);
 assert.equal(r.approvedCount,783);
 assert.equal(r.sourceRegistryEntries,1);
 assert.equal(r.pendingIndependentCi,1);
 assert.equal(r.statusMarkedVerified,0);
});

test('rejects production UI, paid collector and public score changes',()=>{
 const r=auditR1Boundary({changedFiles:['assets/fighter-insights.js',
  '.github/workflows/ufcalendar-rich-backfill.yml','data/ufc-v4-shadow-ratings.json'],
  approval:approval(),registry:registry()});
 assert.equal(r.ok,false);
 assert.equal(r.errors.filter(x=>x.includes('disallowed path')).length,3);
});

test('rejects duplicated or modified approved cohort',()=>{
 const bad=approval();
 bad.approvedFighters[1]=bad.approvedFighters[0];
 const r=auditR1Boundary({changedFiles:[],approval:bad,registry:registry()});
 assert.equal(r.ok,false);
 assert.match(r.errors.join(' '),/roster mismatch/);
});

test('rejects source records outside frozen roster',()=>{
 const bad=registry();
 bad.fighters['outside-cohort']={sourceCoverageAttested:true};
 const r=auditR1Boundary({changedFiles:[],approval:approval(),registry:bad});
 assert.equal(r.ok,false);
 assert.match(r.errors.join(' '),/off-cohort/);
});

test('rejects invalid registry, never invents certificates',()=>{
 const r=auditR1Boundary({changedFiles:[],approval:approval(),registry:{}});
 assert.equal(r.ok,false);
 assert.equal(r.statusMarkedVerified,0);
});
