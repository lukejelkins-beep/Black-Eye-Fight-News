import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const get=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const source=get('data/ufc-unified-wave11-official-source-review-20261114.json');
const registry=get('data/ufc-independent-full-career-verification.json');
const cohort=get('data/ufc-36-month-roster-approval.json');
const feeder=get('data/ufc-feeder-bout-evidence.json');
const expected={
  "manolo-zecchini": {
    "ids": [
      "60070",
      "60702"
    ],
    "outcomes": [
      "loss",
      "loss"
    ],
    "feeder": []
  },
  "mantas-kondratavicius": {
    "ids": [
      "60568",
      "93562"
    ],
    "outcomes": [
      "win",
      "loss"
    ],
    "feeder": [
      "88282"
    ]
  },
  "mark-vologdin": {
    "ids": [
      "66099",
      "83276"
    ],
    "outcomes": [
      "draw",
      "loss"
    ],
    "feeder": [
      "88293"
    ]
  },
  "murtazali-magomedov": {
    "ids": [
      "66453",
      "93284"
    ],
    "outcomes": [
      "win",
      "win"
    ],
    "feeder": [
      "88283"
    ]
  },
  "noah-gugnon": {
    "ids": [
      "83275",
      "93509"
    ],
    "outcomes": [
      "win",
      "loss"
    ],
    "feeder": []
  }
};
test('wave11 protects ten independently attested official UFC fights across five approved careers',()=>{
 assert.equal(cohort.status,'approved');
 assert.equal(new Set(cohort.approvedFighters).size,783);
 assert.equal(Object.keys(source.fighters).length,5);
 let num=0;let excluded=0;
 for(const [slug,check] of Object.entries(expected)){
  assert.ok(cohort.approvedFighters.includes(slug));
  const item=registry.fighters[slug],official=source.fighters[slug];
  assert.equal(item.sourceCoverageAttested,true,slug);
  assert.equal(item.scope,'complete_official_ufc_career',slug);
  assert.equal(item.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
  assert.equal(item.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f',slug);
  assert.equal(item.bouts.length,2,slug);
  assert.equal(item.officialUfcCareerBoutCount,2,slug);
  assert.deepEqual(item.bouts.map(b=>b.nativeBoutId),check.ids,slug);
  assert.deepEqual(item.bouts.map(b=>b.result),check.outcomes,slug);
  assert.equal(new Set(item.bouts.map(b=>b.nativeFighterId)).size,1,slug);
  assert.equal(new Set(item.bouts.map(b=>b.fightUrl)).size,2,slug);
  for(const b of item.bouts){
   assert.equal(official.bouts.filter(x=>x.date===b.date&&x.opponent===b.opponent&&x.result===b.result).length,1,slug);
   assert.equal(new URL(b.fightUrl).hostname,'ufcstats.com',slug);
   num++;
  }
  const excludedBouts=item.sourceVerifiedExcludedFeederBouts||[];
  assert.deepEqual(excludedBouts.map(b=>b.nativeBoutId),check.feeder,slug);
  for(const b of excludedBouts){
   assert.match(b.event,/contender series|dwcs/i,slug);
   assert.ok(!item.bouts.some(x=>x.nativeBoutId===b.nativeBoutId));
   assert.equal(feeder.bouts.filter(x=>x.fighterSlug===slug&&x.boutId===b.nativeBoutId).length,1,slug);
   excluded++;
  }
 }
 assert.equal(num,10);
 assert.equal(excluded,3);
});
test('Mark Vologdin retains official majority draw, never converted to win',()=>{
 const p=registry.fighters['mark-vologdin'];
 const b=p.bouts.find(x=>x.nativeBoutId==='66099');
 assert.equal(b.result,'draw');
 assert.equal(b.opponent,'John Castaneda');
 assert.equal(b.date,'2026-04-18');
});
test('wave11 historical follow-ups remain recorded while Marnic is independently re-gated',()=>{
 assert.ok(source.followUpNotCertified.some(x=>x.slug==='marnic-mann'));
 assert.ok(source.followUpNotCertified.some(x=>x.slug==='nyamjargal-tumendemberel'));
 assert.equal(registry.fighters['marnic-mann']?.sourceCoverageAttested,true);
 assert.equal(registry.fighters['marnic-mann']?.bouts.length,2);
 assert.equal(registry.fighters['nyamjargal-tumendemberel'],undefined);
});
