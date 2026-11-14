import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('data/ufc-36-month-roster-approval.json');
const data=read('data/ufc-independent-full-career-verification.json');
const source=read('data/ufc-unified-seven-career-source-review-20261114.json');
const feeder=read('data/ufc-feeder-bout-evidence.json');
const known={
  "islam-dulatov": {
    "id": "2869",
    "b": [
      [
        "60812",
        "Adam Fugitt",
        "win"
      ]
    ],
    "excluded": [
      "84055"
    ]
  },
  "mark-choinski": {
    "id": "2857",
    "b": [
      [
        "60873",
        "MarQuel Mederos",
        "loss"
      ]
    ],
    "excluded": []
  },
  "max-gimenis": {
    "id": "422",
    "b": [
      [
        "65907",
        "Josh Hokit",
        "loss"
      ]
    ],
    "excluded": []
  },
  "michelle-montague": {
    "id": "218",
    "b": [
      [
        "38218",
        "Luana Carolina",
        "win"
      ],
      [
        "66084",
        "Mayra Bueno Silva",
        "win"
      ]
    ],
    "excluded": []
  },
  "jakub-wiklacz": {
    "id": "205",
    "b": [
      [
        "60745",
        "Patchy Mix",
        "win"
      ],
      [
        "60736",
        "Muin Gafurov",
        "win"
      ]
    ],
    "excluded": []
  },
  "austin-vanderford": {
    "id": "184",
    "b": [
      [
        "38537",
        "Nikolay Veretennikov",
        "win"
      ],
      [
        "60750",
        "Ramiz Brahimaj",
        "loss"
      ]
    ],
    "excluded": [
      "83854"
    ]
  },
  "josias-musasa": {
    "id": "209",
    "b": [
      [
        "60363",
        "Carlos Vera",
        "loss"
      ],
      [
        "38217",
        "Colby Thicknesse",
        "loss"
      ]
    ],
    "excluded": [
      "88275"
    ]
  }
};
test('seven distinct complete official UFC careers preserve native identity, source bouts and 783 approved roster',()=>{
 assert.equal(roster.status,'approved');assert.equal(roster.approvedFighters.length,783);
 assert.equal(new Set(roster.approvedFighters).size,783);
 assert.equal(source.nonproduction,true);assert.equal(source.certificationGranted,false);
 assert.equal(source.rosterSize,783);assert.deepEqual(Object.keys(source.fighters),Object.keys(known));
 let count=0;
 for(const [slug,expected] of Object.entries(known)){
  assert.ok(roster.approvedFighters.includes(slug),slug);
  const proof=data.fighters[slug],review=source.fighters[slug];
  assert.ok(proof?.sourceCoverageAttested,slug);
  assert.equal(proof.scope,'complete_official_ufc_career',slug);
  assert.equal(proof.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
  assert.equal(proof.sourceSnapshot.sourceCommit,source.pinnedSource.sourceCommit,slug);
  assert.equal(proof.officialFighterUrl,review.officialFighterUrl,slug);
  assert.equal(proof.fighterUrl,review.pinnedGrecoFighterUrl,slug);
  assert.equal(proof.officialUfcCareerBoutCount,expected.b.length,slug);
  assert.deepEqual(proof.verifiedNumericFighterIds,[expected.id],slug);
  assert.deepEqual(proof.bouts.map(b=>[b.nativeBoutId,b.opponent,b.result]),expected.b,slug);
  assert.equal(new Set(proof.bouts.map(b=>b.nativeBoutId)).size,expected.b.length,slug);
  assert.equal(new Set(proof.bouts.map(b=>b.fightUrl)).size,expected.b.length,slug);
  for(const bout of proof.bouts){
   assert.equal(bout.nativeFighterId,expected.id,slug);
   assert.match(bout.fightUrl,new RegExp('^https://ufcstats[.]com/fight-details/[a-f0-9]{16}$','i'),slug);
   assert.equal(review.bouts.filter(x=>x.date===bout.date&&x.opponent===bout.opponent&&x.result===bout.result&&x.fightUrl===bout.fightUrl).length,1,slug);
  }
  count+=proof.bouts.length;
 }
 assert.equal(count,11);
});
test('all individually UFC.com-attested DWCS bouts are excluded and retained in exact native feeder ledger',()=>{
 for(const [slug,expected] of Object.entries(known)){
  const proof=data.fighters[slug];const actual=proof.sourceVerifiedExcludedFeederBouts||[];
  assert.deepEqual(actual.map(x=>x.nativeBoutId),expected.excluded,slug);
  for(const id of expected.excluded){
   assert.ok(!proof.bouts.some(b=>b.nativeBoutId===id),slug);
   const items=feeder.bouts.filter(x=>x.fighterSlug===slug&&String(x.boutId)===id);
   assert.equal(items.length,1,slug+':'+id);
   assert.equal(items[0].sourceUrl,proof.officialFighterUrl,slug);
  }
 }
});
