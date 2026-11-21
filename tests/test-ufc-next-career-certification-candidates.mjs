import test from 'node:test';
import assert from 'node:assert/strict';
import {triage,EXCEPTIONS} from '../scripts/ufc-next-career-certification-candidates.mjs';
const roster=Array.from({length:780},(_,i)=>'candidate-'+i).concat([...EXCEPTIONS]);
test('preserves immutable cohort, excludes exactly three exception cases and never certifies',()=>{
 const approval={status:'approved',approvedFighters:roster};
 const foundation={scope:'ufc-only-v4-stat-foundation',population:783,fighters:{}};
 const research={profiles:{}},progress={ufcApprovedFullFightSearchChecks:{},ufcFullCareerHistoryChecks:{}};
 const out=triage(approval,foundation,research,progress);
 assert.equal(out.candidateCount,780);
 assert.equal(out.certifiedByThisReport,0);
 assert.ok(out.candidates.every(x=>!EXCEPTIONS.has(x.slug)));
 assert.equal(out.candidates[0].blockers.includes('independent_exhaustive_official_fight_links_required'),true);
});
test('prioritizes checked historical identities without treating them as certified',()=>{
 const approval={status:'approved',approvedFighters:roster};
 const foundation={scope:'ufc-only-v4-stat-foundation',population:783,fighters:{}};
 const research={profiles:{}},progress={ufcApprovedFullFightSearchChecks:{
 'candidate-10':{status:'checked'}},ufcFullCareerHistoryChecks:{'candidate-10':{status:'checked'}}};
 const out=triage(approval,foundation,research,progress);
 assert.equal(out.candidates[0].slug,'candidate-10');
 assert.equal(out.candidates[0].independentlyCertified,false);
});
