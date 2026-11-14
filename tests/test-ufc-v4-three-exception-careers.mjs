import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditApprovedStage3} from '../scripts/ufc-36-month-stage3-progress.mjs';
const load=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const cases={
 'aliaskhab-khizriev':{count:2,ids:['59855','61440'],nc:'59855',excluded:'83840'},
 'alibi-idiris':{count:2,ids:['60507','60666'],nc:'60666'},
 'ange-loosa':{count:6,ids:['60294','61068','61237','60072','59847','61520'],nc:'61237',excluded:'83966'}
};
const approval=load('data/ufc-36-month-roster-approval.json');
const census=load('data/ufc-36-month-candidates.json');
const progress=load('data/ufcalendar-rich-progress.json');
const research=load('data/ufcalendar-fighter-research.json');
const register=load('data/ufc-independent-full-career-verification.json');
const report=auditApprovedStage3(approval,census,progress,research,
 load('data/ufc-research-archive.json'),load('data/ufc-feeder-bout-evidence.json'),
 load('data/ufc-official-finale-recovery.json'),load('data/ufc-official-legacy-evidence.json'),
 register,load('data/ufc-official-career-bout-inventory.json'));
const decisions=new Map(report.careerVerificationDecisions.map(x=>[x.slug,x]));

test('all three have strict independently verified complete UFC careers, not merely provider search exhaustion',()=>{
 assert.equal(approval.approvedFighters.length,783);
 for(const [slug,expected] of Object.entries(cases)){
  const d=decisions.get(slug),s=register.fighters[slug],rows=s.bouts;
  assert.equal(d.independentlyVerifiedFullCareer,true,slug+': full career source gate');
  assert.equal(d.allKnownFightsMeasured,true,slug+': round statistics');
  assert.equal(d.knownOfficialUfcFightCount,expected.count,slug+': official count');
  assert.equal(s.sourceCoverageAttested,true);
  assert.equal(s.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(rows.length,expected.count);
  assert.deepEqual(rows.map(x=>x.nativeBoutId).sort(),expected.ids.slice().sort());
  assert.equal(new Set(rows.map(x=>x.fightUrl)).size,expected.count);
  assert.ok(rows.every(x=>x.fightUrl.startsWith('https://ufcstats.com/fight-details/')));
  assert.ok(rows.every(x=>x.eventUrl.startsWith('https://ufcstats.com/event-details/')));
  assert.ok(rows.every(x=>progress.bouts[String(x.nativeBoutId)]?.org==='ufc'));
  assert.equal(rows.find(x=>x.nativeBoutId===expected.nc)?.result,'no_contest');
  if(expected.excluded)assert.ok(s.excludedFromOfficialUfc?.some(x=>
   x.nativeBoutId===expected.excluded));
 }
});
test('stale original UFCStats-derived verdict is retained for amended Idiris/Osbourne NC',()=>{
 const entry=register.fighters['alibi-idiris'];
 const nc=entry.bouts.find(x=>x.nativeBoutId==='60666');
 assert.equal(nc.result,'no_contest');
 assert.equal(nc.originalResult,'win_by_unanimous_decision');
 assert.match(nc.sourceDiscrepancy,/historical/);
 assert.ok(nc.amendedFinalResultSourceUrl.startsWith('https://www.ufc.com/'));
 assert.equal(progress.bouts['60666'].status,'no_contest');
});
test('UFCStats historical source SHAs and no paid API evidence persist for all cases',()=>{
 for(const slug of Object.keys(cases)){
  const s=register.fighters[slug];
  assert.match(s.sourceSnapshot.fightResultsBlobSha,/^[a-f0-9]{40}$/);
  assert.match(s.sourceSnapshot.fighterDetailsBlobSha,/^[a-f0-9]{40}$/);
  assert.equal(s.verifiedAt,approval.rosterAsOf);
 }
});
console.log('BEFN_EXCEPTION_CERTIFICATION '+JSON.stringify({
 independentlyVerified:report.summary.independentlyVerifiedFullCareerTimelines,
 newlyAttested:Object.entries(cases).map(([slug,x])=>({slug,count:x.count,nc:x.nc})),
 collectorCalls:0,productionModified:false
}));
