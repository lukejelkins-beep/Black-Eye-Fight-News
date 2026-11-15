import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('partially completed historical wave exits before any outbound pinned Greco fetch',()=>{
 const p=spawnSync(process.execPath,['scripts/ufc-unified-wave6-source-review.mjs'],{
  encoding:'utf8',timeout:15000});
 assert.equal(p.status,0,p.stderr);
 const line=p.stdout.split('\n').find(x=>x.startsWith('BEFN_WAVE6_SUMMARY '));
 assert.ok(line,p.stdout);
 const summary=JSON.parse(line.slice('BEFN_WAVE6_SUMMARY '.length));
 assert.equal(summary.outboundRequests,0);
 assert.equal(summary.paidUfcalendarCalls,0);
 assert.equal(summary.certificationGrantedByThisScript,false);
 assert.ok(['partially_certified_wave_deferred','already_certified_source_wave'].includes(summary.status));
});
