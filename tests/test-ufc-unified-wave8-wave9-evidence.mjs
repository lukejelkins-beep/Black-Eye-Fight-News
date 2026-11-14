import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const registry=read('data/ufc-independent-full-career-verification.json');
const approval=read('data/ufc-36-month-roster-approval.json');
const expected={
  "gable-steveson": {
    "ids": [
      "66443",
      "83414"
    ],
    "results": [
      "win",
      "loss"
    ],
    "feeder": []
  },
  "gianni-vazquez": {
    "ids": [
      "60734",
      "83433"
    ],
    "results": [
      "loss",
      "loss"
    ],
    "feeder": []
  },
  "harry-hardwick": {
    "ids": [
      "60479",
      "60714"
    ],
    "results": [
      "loss",
      "loss"
    ],
    "feeder": []
  },
  "imanol-rodriguez": {
    "ids": [
      "60677",
      "83726"
    ],
    "results": [
      "win",
      "win"
    ],
    "feeder": [
      "88294"
    ]
  },
  "javier-reyes": {
    "ids": [
      "60682",
      "82670"
    ],
    "results": [
      "win",
      "loss"
    ],
    "feeder": [
      "88285"
    ]
  },
  "jeisla-chaves": {
    "ids": [
      "66016",
      "82992"
    ],
    "results": [
      "win",
      "loss"
    ],
    "feeder": [
      "88284"
    ]
  },
  "jonny-parsons": {
    "ids": [
      "60107",
      "93282"
    ],
    "results": [
      "win",
      "loss"
    ],
    "feeder": [
      "83899"
    ]
  },
  "jose-henrique": {
    "ids": [
      "66109",
      "93282"
    ],
    "results": [
      "win",
      "win"
    ],
    "feeder": [
      "88254"
    ]
  },
  "josiah-harrell": {
    "ids": [
      "60663",
      "85945"
    ],
    "results": [
      "loss",
      "loss"
    ],
    "feeder": []
  },
  "julien-leblanc": {
    "ids": [
      "66095",
      "93412"
    ],
    "results": [
      "loss",
      "loss"
    ],
    "feeder": []
  },
  "keiichiro-nakamura": {
    "ids": [
      "65858",
      "93280"
    ],
    "results": [
      "win",
      "loss"
    ],
    "feeder": []
  },
  "kevin-christian": {
    "ids": [
      "60424",
      "66070"
    ],
    "results": [
      "loss",
      "loss"
    ],
    "feeder": [
      "83985"
    ]
  },
  "kurtis-campbell": {
    "ids": [
      "60564",
      "83070"
    ],
    "results": [
      "loss",
      "win"
    ],
    "feeder": [
      "88290"
    ]
  }
};

test('wave8 and wave9 preserve thirteen exhaustive certificates and 26 official fight corners',()=>{
 assert.equal(approval.status,'approved');
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(new Set(approval.approvedFighters).size,783);
 assert.ok(Object.keys(registry.fighters).length>=237);
 const sourceNames=new Set();let official=0,excluded=0;
 for(const [slug,check] of Object.entries(expected)){
  assert.ok(approval.approvedFighters.includes(slug),slug);
  const p=registry.fighters[slug];
  assert.equal(p?.sourceCoverageAttested,true,slug);
  assert.equal(p.scope,'complete_official_ufc_career',slug);
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
  assert.equal(p.sourceSnapshot?.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f',slug);
  assert.equal(p.sourceSnapshot?.fighterDetailsBlobSha,'7141332f0b319edbc10d006b229050ee947e7336',slug);
  assert.equal(p.bouts.length,2,slug);
  assert.equal(p.officialUfcCareerBoutCount,2,slug);
  assert.equal(new Set(p.bouts.map(b=>b.nativeBoutId)).size,2,slug);
  assert.equal(new Set(p.bouts.map(b=>b.fightUrl)).size,2,slug);
  assert.equal(new Set(p.bouts.map(b=>b.nativeFighterId)).size,1,slug);
  assert.deepEqual(p.bouts.map(b=>String(b.nativeBoutId)),check.ids,slug);
  assert.deepEqual(p.bouts.map(b=>b.result),check.results,slug);
  for(const fight of p.bouts){
   assert.match(fight.fightUrl,/^https:\\/\\/ufcstats\\.com\\/fight-details\\/[a-f0-9]{16}$/i,slug);
   assert.match(String(fight.nativeFighterId),/^[1-9][0-9]*$/,slug);
   assert.match(String(fight.nativeBoutId),/^[1-9][0-9]*$/,slug);
   sourceNames.add(fight.fightUrl);official++;
  }
  const feeders=p.sourceVerifiedExcludedFeederBouts||[];
  assert.deepEqual(feeders.map(f=>String(f.nativeBoutId)),check.feeder,slug);
  for(const f of feeders){
   assert.ok(!p.bouts.some(b=>String(b.nativeBoutId)===String(f.nativeBoutId)),slug);
   assert.match(f.event,/contender series|dwcs/i,slug);
   assert.match(f.officialSourceUrl||p.officialFighterUrl,/^https:\\/\\/www\\.ufc\\.com\\/athlete\\//,slug);
   excluded++;
  }
 }
 assert.equal(official,26);
 assert.equal(excluded,7);
 assert.equal(sourceNames.size,25,'shared Parsons/Souza fight must have one Greco source ID');
});

test('Jonny Parsons and Jose Souza are opposite native corners of one official 2026 fight, not merged identities',()=>{
 const parsons=registry.fighters['jonny-parsons'];
 const souza=registry.fighters['jose-henrique'];
 const p=parsons.bouts.find(b=>b.nativeBoutId==='93282');
 const s=souza.bouts.find(b=>b.nativeBoutId==='93282');
 assert.equal(p.result,'loss');
 assert.equal(s.result,'win');
 assert.equal(p.fightUrl,s.fightUrl);
 assert.notEqual(p.nativeFighterId,s.nativeFighterId);
 assert.deepEqual(p.sourceVerifiedNativeOpponentAliases,['Jose Henrique']);
 assert.deepEqual(p.verifiedOpponentNativeFighterIds,[s.nativeFighterId]);
 assert.deepEqual(souza.sourceVerifiedNativeNameAliases,['Jose Henrique']);
 assert.equal(souza.disambiguation.verifiedUfcStatsFighterId,'20a0e4cc5227c117');
 assert.equal(souza.fighterUrl,'https://ufcstats.com/fighter-details/20a0e4cc5227c117');
 assert.equal(souza.officialFighterUrl,'https://www.ufc.com/athlete/jose-souza');
});

test('Keiichiro Nakamura official UFC 325 Road to UFC final stays in full-career chronology',()=>{
 const row=registry.fighters['keiichiro-nakamura'].bouts.find(x=>x.nativeBoutId==='65858');
 assert.equal(row.opponent,'Sebastian Szalay');
 assert.equal(row.result,'win');
 assert.equal(row.date,'2026-01-31');
});
