import test from 'node:test';
import assert from 'node:assert/strict';
import {canShowVerifiedCareer} from '../scripts/ufc-v4-r2-career-gate.mjs';

const sha='a'.repeat(40);
const audit={status:'success',scope:'full_cohort',approved:783,passed:true,commitSha:sha,
  certified:2,exceptions:781,certifiedSlugs:['pilot-one','pilot-two']};
const evaluate=(overrides={})=>canShowVerifiedCareer({
  featureEnabled:true,fighterSlug:'pilot-one',audit,expectedCommit:sha,...overrides
});
test('feature flag defaults off and never exposes career history implicitly',()=>{
  assert.equal(canShowVerifiedCareer({fighterSlug:'pilot-one',audit,expectedCommit:sha}).reason,'feature_disabled');
});
test('requires successful exact-commit full-cohort audit and certified fighter membership',()=>{
  assert.equal(evaluate().allowed,true);
  assert.equal(evaluate({expectedCommit:'b'.repeat(40)}).allowed,false);
  assert.equal(evaluate({audit:{...audit,scope:'partial'}}).allowed,false);
  assert.equal(evaluate({audit:{...audit,status:'pending'}}).allowed,false);
  assert.equal(evaluate({fighterSlug:'unknown'}).allowed,false);
});
test('fail closed on duplicate identities and malformed audited partition',()=>{
  assert.equal(evaluate({duplicateIdentitySlugs:['pilot-one','park-hyun-sung']}).reason,'identity_unresolved');
  assert.equal(evaluate({audit:{...audit,certifiedSlugs:['pilot-one','pilot-one']}}).allowed,false);
  assert.equal(evaluate({audit:{...audit,exceptions:780}}).allowed,false);
  assert.equal(evaluate({audit:{...audit,certified:3}}).allowed,false);
  assert.equal(evaluate({audit:{...audit,certifiedSlugs:null}}).allowed,false);
});
