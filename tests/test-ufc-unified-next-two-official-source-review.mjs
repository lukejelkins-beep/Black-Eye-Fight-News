import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const evidence=JSON.parse(fs.readFileSync(new URL('../data/ufc-unified-next-two-official-source-review-20261114.json',import.meta.url)));
const roster=JSON.parse(fs.readFileSync(new URL('../data/ufc-36-month-roster-approval.json',import.meta.url)));
const registry=JSON.parse(fs.readFileSync(new URL('../data/ufc-independent-full-career-verification.json',import.meta.url)));
test('new UFC source evidence is explicitly uncertified and never overwrites existing certificates',()=>{
 assert.equal(roster.approvedFighters.length,783);
 assert.equal(evidence.certifiedByThisEvidence,0);
 assert.equal(evidence.paidProviderCalls,0);
 assert.equal(evidence.collectorCacheWrites,0);
 for(const [slug,f] of Object.entries(evidence.fighters)){
  assert.ok(roster.approvedFighters.includes(slug));
  assert.equal(registry.fighters[slug],undefined);
  assert.equal(f.bouts.length,1);
  assert.equal(f.ufcDebut,f.bouts[0].date);
  assert.ok(f.ufcOfficialResultUrl.startsWith('https://www.ufc.com/news/'));
  assert.equal(f.bouts[0].nativeBoutId,null);
  assert.equal(f.bouts[0].sourceFightUrl,null);
  assert.ok(f.pending.length>0);
 }
});
test('official scorecard defeats misleading athlete win badge for Brennan',()=>{
 const b=evidence.fighters['lucas-brennan'];
 assert.equal(b.bouts[0].result,'loss');
 assert.match(b.sourceConflict,/scorecard/i);
 assert.equal(b.bouts[0].opponent,'Francis Marshall');
});
test('DWCS cannot become a second official Chokheli career bout',()=>{
 const f=evidence.fighters['levan-chokheli'];
 assert.equal(f.officialCareerBoutsThroughSnapshot,1);
 assert.equal(f.bouts[0].result,'win');
 assert.match(f.feederNote,/DWCS/);
});
