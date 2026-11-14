import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('data/ufc-36-month-roster-approval.json'),registry=read('data/ufc-independent-full-career-verification.json'),feed=read('data/ufc-feeder-bout-evidence.json'),evidence=read('data/ufc-unified-wave19-three-two-bout-careers-20261114.json');
const cases={
  "michelle-montague": {
    "id": "218",
    "greco": "ca80d72da81d7224",
    "official": "https://www.ufc.com/athlete/michelle-montague",
    "b": [
      [
        "2025-09-27",
        "Luana Carolina",
        "win",
        "44cd8c9f622e155f",
        "38218"
      ],
      [
        "2026-04-25",
        "Mayra Bueno Silva",
        "win",
        "dcfd594b68ff5ae1",
        "66084"
      ]
    ],
    "feed": []
  },
  "jakub-wiklacz": {
    "id": "205",
    "greco": "6902fcf0610dd303",
    "official": "https://www.ufc.com/athlete/jakub-wiklacz",
    "b": [
      [
        "2025-10-04",
        "Patchy Mix",
        "win",
        "b09ecdc8ef0f0d20",
        "60745"
      ],
      [
        "2026-02-07",
        "Muin Gafurov",
        "win",
        "9d30c887e8bd8824",
        "60736"
      ]
    ],
    "feed": []
  },
  "austin-vanderford": {
    "id": "184",
    "greco": "32c3ee378671a5d9",
    "official": "https://www.ufc.com/athlete/austin-vanderford",
    "b": [
      [
        "2025-02-22",
        "Nikolay Veretennikov",
        "win",
        "615f7f894bafad82",
        "38537"
      ],
      [
        "2025-10-04",
        "Ramiz Brahimaj",
        "loss",
        "b98bc1ecb94ef4a5",
        "60750"
      ]
    ],
    "feed": [
      [
        "83854",
        "2018-07-17",
        "Angelo Trevino",
        "win",
        "Dana White's Tuesday Night Contender Series 13"
      ]
    ]
  }
};
test('wave19 complete official UFC two-bout careers pass exact pinned Greco and source-native identity regression',()=>{
 assert.equal(roster.status,'approved');assert.equal(roster.approvedFighters.length,783);
 assert.equal(evidence.nonproduction,true);assert.equal(evidence.certificationGranted,false);
 assert.deepEqual(Object.keys(evidence.fighters),Object.keys(cases));
 for(const [slug,x] of Object.entries(cases)){
   assert.ok(roster.approvedFighters.includes(slug),slug);
   const p=registry.fighters[slug];
   assert.equal(p.sourceCoverageAttested,true,slug);
   assert.equal(p.scope,'complete_official_ufc_career',slug);
   assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
   assert.deepEqual(p.verifiedNumericFighterIds,[x.id],slug);
   assert.equal(p.officialFighterUrl,x.official,slug);
   assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+x.greco,slug);
   assert.equal(p.sourceSnapshot.sourceCommit,evidence.pinnedSource.sourceCommit,slug);
   assert.equal(p.officialUfcCareerBoutCount,2,slug);
   assert.deepEqual(p.bouts.map(b=>[b.date,b.opponent,b.result,b.fightUrl.slice(-16),b.nativeBoutId]),x.b,slug);
   assert.equal(new Set(p.bouts.map(b=>b.fightUrl)).size,2,slug);
   assert.ok(p.bouts.every(b=>b.nativeFighterId===x.id),slug);
 }
});
test('Austin 2018 DWCS win excluded and Jakub cancelled fight never certified',()=>{
 if(cases['austin-vanderford']){
  const a=registry.fighters['austin-vanderford'];
  assert.deepEqual(a.sourceVerifiedExcludedFeederBouts.map(b=>b.nativeBoutId),['83854']);
  assert.ok(!a.bouts.some(x=>x.nativeBoutId==='83854'));
  const src=feed.bouts.filter(x=>x.fighterSlug==='austin-vanderford'&&x.boutId==='83854');
  assert.equal(src.length,1);assert.equal(src[0].opponent,'Angelo Trevino');
  assert.equal(src[0].sourceUrl,cases['austin-vanderford'].official);
 }
 if(cases['jakub-wiklacz']){
  const j=registry.fighters['jakub-wiklacz'];
  assert.ok(!j.bouts.some(x=>x.nativeBoutId==='66019'||x.opponent==='Marcus McGhee'));
 }
});
