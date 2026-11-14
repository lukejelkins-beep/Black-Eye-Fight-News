import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const get=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const evidence=get('data/ufc-independent-full-career-verification.json'),feeder=get('data/ufc-feeder-bout-evidence.json'),roster=get('data/ufc-36-month-roster-approval.json'),review=get('data/ufc-unified-marnic-official-career-review-20261114.json');
test('Marnic Mann has two distinct official UFC bouts, never three from duplicated source event names',()=>{
 assert.equal(roster.status,'approved');assert.equal(roster.approvedFighters.length,783);assert.equal(new Set(roster.approvedFighters).size,783);
 assert.equal(review.certificationGranted,false);
 assert.equal(review.duplicateHistoricalRecords.deduplicatedByExactUfcStatsFightUrl,true);
 const e=evidence.fighters['marnic-mann'];assert.equal(e.sourceCoverageAttested,true);
 assert.equal(e.scope,'complete_official_ufc_career');assert.equal(e.bouts.length,2);assert.equal(e.officialUfcCareerBoutCount,2);
 assert.deepEqual(e.bouts.map(x=>x.nativeBoutId),['60052','65843']);
 assert.equal(new Set(e.bouts.map(x=>x.fightUrl)).size,2);
 assert.ok(e.bouts.every(b=>b.nativeFighterId==='2804'&&b.result==='loss'));
 const j=e.bouts[0];assert.deepEqual(j.sourceVerifiedNativeOpponentAliases,['Josefine Lindgren Knutsson']);assert.deepEqual(j.verifiedOpponentNativeFighterIds,['11107']);
 assert.equal(e.bouts[1].opponent,'Ketlen Souza');
 assert.equal(feeder.bouts.filter(x=>x.fighterSlug==='marnic-mann'&&x.boutId==='88262').length,1);
 assert.ok(!e.bouts.some(x=>x.nativeBoutId==='88262'));
});
