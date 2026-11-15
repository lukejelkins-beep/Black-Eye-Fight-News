import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const registry=read('data/ufc-independent-full-career-verification.json'),roster=read('data/ufc-36-month-roster-approval.json'),feed=read('data/ufc-feeder-bout-evidence.json'),review=read('data/ufc-unified-wave18-official-career-source-review-20261114.json');
const cases={
  "pete-rodriguez": {
    "fid": "1088",
    "greco": "776d4262c4da38bf",
    "official": "https://www.ufc.com/athlete/pete-rodriguez",
    "b": [
      [
        "2022-01-22",
        "Jack Della Maddalena",
        "loss",
        "0669231ebe3dd560",
        "61640"
      ],
      [
        "2022-10-15",
        "Mike Jackson",
        "win",
        "84b04e8d6b251c54",
        "61211"
      ],
      [
        "2024-02-03",
        "Themba Gorimbo",
        "loss",
        "4cff9aeef3ac75c1",
        "59859"
      ]
    ],
    "feed": []
  },
  "rayanne-dos-santos": {
    "fid": "2802",
    "greco": "02bb48869eb7ac8f",
    "official": "https://www.ufc.com/athlete/rayanne-dos-santos",
    "b": [
      [
        "2023-12-09",
        "Talita Alencar",
        "loss",
        "acde7c89bd724af8",
        "59947"
      ],
      [
        "2024-06-08",
        "Puja Tomar",
        "loss",
        "b20640f9b2634de1",
        "61040"
      ],
      [
        "2025-05-31",
        "Alice Ardelean",
        "loss",
        "73240bea13ed5e71",
        "38405"
      ]
    ],
    "feed": [
      [
        "84128",
        "2022-08-23",
        "Denise Gomes",
        "loss",
        "Dana White's Contender Series 51"
      ]
    ]
  },
  "charlie-campbell": {
    "fid": "212",
    "greco": "b39f7a6c2be17ee8",
    "official": "https://www.ufc.com/athlete/charlie-campbell",
    "b": [
      [
        "2023-09-16",
        "Alex Reyes",
        "win",
        "58b2fdad7af9be02",
        "60051"
      ],
      [
        "2024-04-06",
        "Trevor Peek",
        "win",
        "47f8812a335b6ce9",
        "61253"
      ],
      [
        "2025-09-27",
        "Tom Nolan",
        "loss",
        "8abad36b4c5e4070",
        "38213"
      ]
    ],
    "feed": [
      [
        "88248",
        "2022-08-02",
        "Chris Duncan",
        "loss",
        "Dana White's Contender Series 48"
      ]
    ]
  }
};
test('wave18 distinct approved full UFC careers retain all exact original numeric IDs and independently pinned complete source proofs',()=>{
 assert.equal(roster.status,'approved');assert.equal(roster.approvedFighters.length,783);
 assert.equal(review.nonproduction,true);assert.equal(review.certificationGranted,false);
 assert.deepEqual(Object.keys(review.fighters),Object.keys(cases));
 for(const [slug,x] of Object.entries(cases)){
  assert.ok(roster.approvedFighters.includes(slug),slug);
  const p=registry.fighters[slug];
  assert.equal(p.sourceCoverageAttested,true,slug);
  assert.equal(p.scope,'complete_official_ufc_career',slug);
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
  assert.deepEqual(p.verifiedNumericFighterIds,[x.fid],slug);
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+x.greco,slug);
  assert.equal(p.officialFighterUrl,x.official,slug);
  assert.equal(p.sourceSnapshot.sourceCommit,review.pinnedSource.sourceCommit,slug);
  assert.equal(p.officialUfcCareerBoutCount,3,slug);
  assert.deepEqual(p.bouts.map(z=>[z.date,z.opponent,z.result,z.fightUrl.slice(-16),z.nativeBoutId]),x.b,slug);
  assert.equal(new Set(p.bouts.map(z=>z.fightUrl)).size,3,slug);
  assert.equal(new Set(p.bouts.map(z=>z.nativeBoutId)).size,3,slug);
  assert.ok(p.bouts.every(z=>z.nativeFighterId===x.fid),slug);
 }
});
test('all source-proven DWCS appearances excluded by exact numeric ID without deleting source records',()=>{
 for(const [slug,x] of Object.entries(cases)){
   const p=registry.fighters[slug];
   assert.deepEqual((p.sourceVerifiedExcludedFeederBouts||[]).map(z=>z.nativeBoutId),x.feed.map(z=>z[0]),slug);
   for(const [bid,date,opponent,result] of x.feed){
    const items=feed.bouts.filter(y=>y.boutId===bid&&y.fighterSlug===slug);
    assert.equal(items.length,1,bid);assert.equal(items[0].date,date);
    assert.equal(items[0].opponent,opponent);assert.equal(items[0].result,result);
    assert.equal(items[0].sourceUrl,x.official);assert.ok(!p.bouts.some(z=>z.nativeBoutId===bid));
   }
 }
});
test('Charlie historical alias is one UFC result and mirrors certified opposing Alex Reyes loss',()=>{
 if(!cases['charlie-campbell'])return;
 const c=registry.fighters['charlie-campbell'],a=registry.fighters['alex-reyes'];
 const win=c.bouts.filter(b=>b.nativeBoutId==='60051');
 assert.equal(win.length,1);assert.equal(win[0].result,'win');assert.equal(a.bouts.find(z=>z.nativeBoutId==='60051')?.result,'loss');
 assert.equal(a.bouts.find(z=>z.nativeBoutId==='60051')?.fightUrl,win[0].fightUrl);
});
