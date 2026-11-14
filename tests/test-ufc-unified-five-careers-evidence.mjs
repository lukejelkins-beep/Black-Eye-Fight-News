import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=load('data/ufc-36-month-roster-approval.json');
const registry=load('data/ufc-independent-full-career-verification.json');
const feeder=load('data/ufc-feeder-bout-evidence.json');
const source=load('data/ufc-unified-five-career-source-review-20261114.json');
const cases={
  "ramon-taveras": {
    "id": "60",
    "b": [
      [
        "59871",
        "Serhiy Sidey",
        "win"
      ],
      [
        "60379",
        "Davey Grant",
        "loss"
      ],
      [
        "38211",
        "Jack Jenkins",
        "loss"
      ]
    ],
    "excluded": [
      "84097",
      "88267"
    ]
  },
  "brogan-walker": {
    "id": "134",
    "b": [
      [
        "59550",
        "Juliana Miller",
        "loss"
      ],
      [
        "61275",
        "Iasmin Lucindo",
        "loss"
      ],
      [
        "60751",
        "Veronica Hardy",
        "loss"
      ]
    ],
    "excluded": []
  },
  "mitch-ramirez": {
    "id": "2852",
    "b": [
      [
        "61247",
        "Thiago Moises",
        "loss"
      ],
      [
        "60839",
        "Mike Davis",
        "loss"
      ],
      [
        "66460",
        "Chase Hooper",
        "loss"
      ]
    ],
    "excluded": [
      "84164"
    ]
  },
  "steven-asplund": {
    "id": "337",
    "b": [
      [
        "60655",
        "Sean Sharaf",
        "win"
      ],
      [
        "60718",
        "Vitor Petrino",
        "loss"
      ],
      [
        "83096",
        "Guilherme Pat",
        "win"
      ]
    ],
    "excluded": [
      "83909"
    ]
  },
  "tommy-mcmillen": {
    "id": "592",
    "b": [
      [
        "60702",
        "Manolo Zecchini",
        "win"
      ],
      [
        "82919",
        "Alberto Montes",
        "win"
      ],
      [
        "83442",
        "Marwan Rahiki",
        "win"
      ]
    ],
    "excluded": [
      "84143"
    ]
  }
};
test('five independently source-proven three-bout UFC careers and frozen approved 783 roster',()=>{
 assert.equal(roster.status,'approved');assert.equal(roster.approvedFighters.length,783);
 assert.equal(new Set(roster.approvedFighters).size,783);
 assert.equal(source.nonproduction,true);assert.equal(source.certificationGranted,false);
 assert.equal(source.rosterSize,783);assert.deepEqual(Object.keys(source.fighters),Object.keys(cases));
 let count=0;
 for(const [slug,x] of Object.entries(cases)){
  assert.ok(roster.approvedFighters.includes(slug),slug);
  const e=registry.fighters[slug],s=source.fighters[slug];
  assert.ok(e?.sourceCoverageAttested,slug);
  assert.equal(e.scope,'complete_official_ufc_career',slug);
  assert.equal(e.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
  assert.equal(e.sourceSnapshot.sourceCommit,source.pinnedSource.sourceCommit,slug);
  assert.equal(e.officialFighterUrl,s.officialFighterUrl,slug);
  assert.equal(e.fighterUrl,s.pinnedGrecoFighterUrl,slug);
  assert.equal(e.officialUfcCareerBoutCount,3,slug);
  assert.deepEqual(e.verifiedNumericFighterIds,[x.id],slug);
  assert.deepEqual(e.bouts.map(b=>[b.nativeBoutId,b.opponent,b.result]),x.b,slug);
  assert.equal(new Set(e.bouts.map(b=>b.nativeBoutId)).size,3,slug);
  assert.equal(new Set(e.bouts.map(b=>b.fightUrl)).size,3,slug);
  for(const b of e.bouts){
   assert.equal(b.nativeFighterId,x.id,slug);
   assert.match(b.fightUrl,new RegExp('^https://ufcstats[.]com/fight-details/[a-f0-9]{16}$','i'),slug);
   assert.equal(s.bouts.filter(j=>j.date===b.date&&j.opponent===b.opponent&&j.result===b.result&&j.fightUrl===b.fightUrl).length,1,slug);
  }
  count+=e.bouts.length;
 }
 assert.equal(count,15);
});
test('five exact DWCS feeders are excluded without inventing or altering UFC final results',()=>{
 let sum=0;
 for(const [slug,expected] of Object.entries(cases)){
  const e=registry.fighters[slug];const excluded=e.sourceVerifiedExcludedFeederBouts||[];
  assert.deepEqual(excluded.map(x=>x.nativeBoutId),expected.excluded,slug);
  for(const id of expected.excluded){
   assert.ok(!e.bouts.some(b=>b.nativeBoutId===id),slug);
   const rows=feeder.bouts.filter(x=>x.fighterSlug===slug&&String(x.boutId)===id);
   assert.equal(rows.length,1,slug);
   assert.equal(rows[0].sourceUrl,e.officialFighterUrl,slug);
   sum++;
  }
 }
 assert.equal(sum,5);
 const tuf=registry.fighters['brogan-walker'];
 assert.ok(tuf.bouts.some(x=>x.date==='2022-08-06'&&x.opponent==='Juliana Miller'&&x.result==='loss'));
 assert.ok(!tuf.bouts.some(x=>x.opponent==='Hannah Guy'||x.opponent==='Laura Gallardo'));
});
