import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const get=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const source=get('data/ufc-unified-wave10-official-source-review-20261114.json');
const registry=get('data/ufc-independent-full-career-verification.json');
const roster=get('data/ufc-36-month-roster-approval.json');
const feeder=get('data/ufc-feeder-bout-evidence.json');
const expected={
  "lance-gibson-jr": {
    "ids": [
      "60652",
      "60630"
    ],
    "excluded": []
  },
  "lawrence-lui": {
    "ids": [
      "65859",
      "83784"
    ],
    "excluded": []
  },
  "leon-shahbazyan": {
    "ids": [
      "82829",
      "93269"
    ],
    "excluded": [
      "88225"
    ]
  },
  "lerryan-douglas": {
    "ids": [
      "60626",
      "83661"
    ],
    "excluded": [
      "83910"
    ]
  },
  "levi-rodrigues-jr": {
    "ids": [
      "82922",
      "83813"
    ],
    "excluded": [
      "84103"
    ]
  },
  "lucas-fernando": {
    "ids": [
      "83426",
      "93276"
    ],
    "excluded": [
      "83866"
    ]
  },
  "lucas-rocha": {
    "ids": [
      "61127",
      "65896"
    ],
    "excluded": [
      "84102"
    ]
  }
};
test('wave10 maintains seven independent complete source biographies, 14 UFC bouts and five excluded DWCS bouts',()=>{
 assert.equal(roster.status,'approved');
 assert.equal(new Set(roster.approvedFighters).size,783);
 assert.equal(Object.keys(source.fighters).length,7);
 let confirmed=0,excluded=0;
 for(const [slug,expect] of Object.entries(expected)){
  assert.ok(roster.approvedFighters.includes(slug),slug);
  const entry=registry.fighters[slug],proof=source.fighters[slug];
  assert.equal(entry.sourceCoverageAttested,true,slug);
  assert.equal(entry.scope,'complete_official_ufc_career',slug);
  assert.equal(entry.fighterUrl,proof.pinnedGrecoFighterUrl,slug);
  assert.equal(entry.officialFighterUrl,proof.officialFighterUrl,slug);
  assert.equal(entry.bouts.length,2,slug);
  assert.equal(entry.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f',slug);
  assert.deepEqual(entry.bouts.map(b=>b.nativeBoutId),expect.ids,slug);
  assert.equal(new Set(entry.bouts.map(b=>b.fightUrl)).size,2,slug);
  assert.equal(new Set(entry.bouts.map(b=>b.nativeFighterId)).size,1,slug);
  for(const bout of entry.bouts){
   const match=proof.bouts.filter(x=>x.date===bout.date&&x.result===bout.result&&x.opponent===bout.opponent);
   assert.equal(match.length,1,slug);
   assert.equal(new URL(bout.fightUrl).hostname,'ufcstats.com',slug);
   assert.ok(new RegExp('^/fight-details/[a-f0-9]{16}$','i').test(new URL(bout.fightUrl).pathname),slug);
   confirmed++;
  }
  const fw=entry.sourceVerifiedExcludedFeederBouts||[];
  assert.deepEqual(fw.map(b=>b.nativeBoutId),expect.excluded,slug);
  for(const f of fw){
   assert.ok(!entry.bouts.some(x=>x.nativeBoutId===f.nativeBoutId),slug);
   assert.match(f.event,/contender series|dwcs/i,slug);
   assert.equal(feeder.bouts.filter(x=>x.boutId===f.nativeBoutId&&x.fighterSlug===slug).length,1,slug);
   excluded++;
  }
 }
 assert.equal(confirmed,14);
 assert.equal(excluded,5);
});
test('Road to UFC final remains in Lawrence Lui official UFC record and calendar day-shift stays explicit',()=>{
 assert.ok(registry.fighters['lawrence-lui'].bouts.some(x=>x.nativeBoutId==='65859'&&x.date==='2026-01-31'));
 assert.equal(registry.fighters['lance-gibson-jr'].bouts[0].date,'2025-12-13');
});
