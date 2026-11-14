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
  // The source-only research artifact is historical: it never grants certification.
  // Its missing IDs have since been reconciled into the sole canonical register.
  const proof=registry.fighters[slug];
  assert.equal(proof.sourceCoverageAttested,true);
  assert.equal(proof.scope,'complete_official_ufc_career');
  assert.equal(proof.bouts.length,1);
  assert.ok(proof.bouts[0].fightUrl.startsWith('https://ufcstats.com/fight-details/'));
  assert.ok(Number.isSafeInteger(Number(proof.bouts[0].nativeBoutId)));
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

test('newly resolved Chokheli, Brennan and Degli evidence preserves exact UFC fight results and excludes DWCS',()=>{
 const cases={
  'levan-chokheli':{id:'82829',fighter:'22100',opponent:'Leon Shahbazyan',result:'win'},
  'lucas-brennan':{id:'66086',fighter:'546',opponent:'Francis Marshall',result:'loss'},
  'marcos-degli':{id:'93615',fighter:'11999',opponent:'Mitch Raposo',result:'loss'}
 };
 for(const [slug,expected] of Object.entries(cases)){
  const proof=registry.fighters[slug];
  assert.ok(proof,slug+' independent source evidence absent');
  assert.equal(proof.sourceCoverageAttested,true);
  assert.equal(proof.officialUfcCareerBoutCount,1);
  assert.equal(proof.bouts.length,1);
  assert.equal(proof.bouts[0].nativeBoutId,expected.id);
  assert.equal(proof.bouts[0].nativeFighterId,expected.fighter);
  assert.equal(proof.bouts[0].opponent,expected.opponent);
  assert.equal(proof.bouts[0].result,expected.result);
  assert.equal(proof.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
 }
 assert.match(registry.fighters['marcos-degli'].sourceScopeVerified,/DWCS/);
 assert.match(registry.fighters['lucas-brennan'].sourceScopeVerified,/incorrect athlete header Win/);
});

test('four additional frozen-roster official UFC debut careers retain one-to-one source/native proof',()=>{
 const cases={
  'luis-hernandez':{native:'93180',fid:'42105',result:'win'},
  'magomed-tuchalov':{native:'82603',fid:'11127',result:'win'},
  'marina-spasic':{native:'83278',fid:'41158',result:'loss'},
  'matthieu-duclos':{native:'83409',fid:'32933',result:'win'}
 };
 for(const [slug,expected] of Object.entries(cases)){
  assert.ok(roster.approvedFighters.includes(slug));
  const row=registry.fighters[slug];
  assert.ok(row,slug+' requires independent source proof');
  assert.equal(row.sourceCoverageAttested,true);
  assert.equal(row.scope,'complete_official_ufc_career');
  assert.equal(row.officialUfcCareerBoutCount,1);
  assert.equal(row.bouts.length,1);
  assert.equal(row.verifiedNumericFighterIds.length,1);
  assert.equal(row.bouts[0].nativeBoutId,expected.native);
  assert.equal(row.bouts[0].nativeFighterId,expected.fid);
  assert.equal(row.bouts[0].result,expected.result);
  assert.ok(row.fighterUrl.startsWith('https://ufcstats.com/fighter-details/'));
  assert.ok(row.bouts[0].fightUrl.startsWith('https://ufcstats.com/fight-details/'));
  assert.equal(row.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
 }
 assert.ok(registry.fighters['luis-hernandez'].sourceScopeVerified.includes('DWCS'));
 assert.ok(registry.fighters['matthieu-duclos'].sourceScopeVerified.includes('DWCS'));
 assert.ok(registry.fighters['marina-spasic'].sourceScopeVerified.includes('loss'));
});
