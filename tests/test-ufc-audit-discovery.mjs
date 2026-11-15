import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {stage3TestFiles} from '../scripts/run-ufc-stage3-tests.mjs';

test('central audit discovers every existing Stage 3 research test without pulling in provider collectors',()=>{
 const available=readdirSync(new URL('.',import.meta.url));
 const selected=stage3TestFiles(available);
 assert.ok(selected.length>=70,'a missing research test family must fail the audit');
 for(const required of [
  'test-ufc-36-month-stage3-progress.mjs',
  'test-ufc-stage3-frozen-cohort-cutoff-20261115.mjs',
  'test-ufc-v4-stage3-import.mjs',
  'test-ufc-unified-wave59-santos-brener-prado-20261115.mjs'
 ])assert.ok(selected.includes(required),required);
 for(const name of [
  'test-ufc-unified-wave71-ten-careers-20261115.mjs',
  'test-ufc-unified-wave72-thirty-careers-20261115.mjs',
  'test-ufc-unified-wave73-six-fastlane-careers-20261115.mjs',
  'test-ufc-three-11-bout-career-source-gates-20261115.mjs'
 ])if(available.includes(name))assert.ok(selected.includes(name),
   'newly staged UFC source-gate regression must run in central strict audit: '+name);
 assert.ok(!selected.includes('test-ufc-stage3-v4-reconciliation.mjs'));
 assert.ok(!selected.includes('test-ufcalendar-relay.mjs'));
 assert.ok(!selected.includes('test-sumo-backfill-190.mjs'));
 const workflow=readFileSync(new URL('../.github/workflows/audit-ufc-research-pipeline.yml',import.meta.url),'utf8');
 assert.match(workflow,/node scripts\/run-ufc-stage3-tests\.mjs/);
 assert.match(workflow,/node --test tests\/test-ufc-stage3-v4-reconciliation\.mjs/);
 assert.match(workflow,/tests\/test-ufc-\*\.mjs/);
});
