import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('data/ufc-36-month-roster-approval.json');
const reg=read('data/ufc-independent-full-career-verification.json');
const src=read('data/ufc-unified-wave22-gandra-buchecha-source-review-20261114.json');
const native=read('data/ufcalendar-rich-progress.json');
const ledger=read('data/ufc-feeder-bout-evidence.json');
const cases={
  "ryan-gandra": {
    "name": "Ryan Gandra",
    "nativeName": "Ryan Gandra",
    "fid": "478",
    "stats": "e463ce0a2ca474f4",
    "official": "https://www.ufc.com/athlete/ryan-gandra",
    "b": [
      [
        "2026-02-28",
        "Jose Daniel Medina",
        "win",
        "45ec0c5f19c9adbe",
        "60679",
        "2026-02-28",
        "229"
      ],
      [
        "2026-07-11",
        "Zach Reese",
        "win",
        "1162a74e3604c488",
        "66462",
        "2026-07-11",
        "233"
      ],
      [
        "2026-09-19",
        "Ozzy Diaz",
        "win",
        "51789f77811b1817",
        "83416",
        "2026-09-19",
        "550"
      ]
    ],
    "feed": [
      "84057"
    ]
  },
  "marcus-almeida": {
    "name": "Marcus Buchecha",
    "nativeName": "Marcus Almeida",
    "fid": "7324",
    "stats": "095854a135e6db55",
    "official": "https://www.ufc.com/athlete/marcus-buchecha",
    "b": [
      [
        "2025-07-26",
        "Martin Buday",
        "loss",
        "0a598768f5c8d540",
        "60828",
        "2025-07-26",
        "1032"
      ],
      [
        "2025-12-14",
        "Kennedy Nzechukwu",
        "draw",
        "47149f3187661509",
        "60651",
        "2025-12-13",
        "344"
      ],
      [
        "2026-04-25",
        "Ryan Spann",
        "loss",
        "7e551ddb1494a45f",
        "66081",
        "2026-04-25",
        "556"
      ]
    ],
    "feed": []
  }
};
test('two complete three-bout UFC careers preserve exact Greco, native fighter IDs, both corners, dates, winners and official draw',()=>{
 assert.equal(roster.status,'approved');assert.equal(roster.approvedFighters.length,783);
 assert.equal(new Set(roster.approvedFighters).size,783);
 assert.equal(src.nonproduction,true);assert.equal(src.certificationGranted,false);
 assert.deepEqual(Object.keys(src.fighters),Object.keys(cases));
 for(const [slug,c] of Object.entries(cases)){
  const e=reg.fighters[slug],s=src.fighters[slug];
  assert.ok(roster.approvedFighters.includes(slug));assert.equal(e.sourceCoverageAttested,true);
  assert.equal(e.scope,'complete_official_ufc_career');
  assert.equal(e.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(e.verifiedNumericFighterIds[0],c.fid);assert.equal(e.verifiedNumericFighterIds.length,1);
  assert.equal(e.officialFighterUrl,c.official);assert.equal(e.fighterName,c.name);
  assert.equal(e.fighterUrl,'https://ufcstats.com/fighter-details/'+c.stats);
  assert.equal(e.sourceSnapshot.sourceCommit,src.pinnedSource.sourceCommit);
  assert.equal(e.officialUfcCareerBoutCount,3);assert.equal(e.bouts.length,3);
  assert.equal(new Set(e.bouts.map(x=>x.nativeBoutId)).size,3);
  assert.equal(new Set(e.bouts.map(x=>x.fightUrl)).size,3);
  for(const [date,opponent,result,sourceId,boutId,sourceDate,oppId] of c.b){
   const b=e.bouts.find(x=>x.nativeBoutId===boutId),proof=s.bouts.find(x=>x.nativeBoutId===boutId);
   assert.deepEqual(b,{date,opponent,result,fightUrl:'https://ufcstats.com/fight-details/'+sourceId,nativeBoutId:boutId,nativeFighterId:c.fid});
   assert.equal(proof.originalOpponentNumericId,oppId);assert.equal(proof.sourceEventDate,sourceDate);
   const n=native.bouts[boutId];assert.equal(n?.org,'ufc');assert.equal(n.status,'completed');
   assert.equal(n.eventDate,date);assert.ok(Math.abs(Date.parse(sourceDate)-Date.parse(date))<=86400000);
   const own=[n.a,n.b].find(x=>x?.id===c.fid),other=[n.a,n.b].find(x=>x?.id!==c.fid);
   assert.equal(own?.slug,slug);assert.equal(own?.name,c.nativeName);
   assert.equal(other?.id,oppId);assert.equal(other?.name,opponent);
   const outcome=n.result?.method==='draw'&&!n.result?.winnerId?'draw':n.result?.winnerId===c.fid?'win':'loss';
   assert.equal(outcome,result);
  }
 }
});
test('Ryan documented DWCS feeder excluded exactly once; Marcus Buchecha alias, opposite corners, and draw protected',()=>{
 for(const [slug,c] of Object.entries(cases)){
  assert.deepEqual((reg.fighters[slug].sourceVerifiedExcludedFeederBouts||[]).map(x=>x.nativeBoutId),c.feed);
  for(const id of c.feed){
   const matches=ledger.bouts.filter(x=>x.fighterSlug===slug&&x.boutId===id);
   assert.equal(matches.length,1);assert.equal(matches[0].sourceUrl,c.official);
   assert.ok(!reg.fighters[slug].bouts.some(x=>x.nativeBoutId===id));
  }
 }
 const marcus=reg.fighters['marcus-almeida'];
 assert.deepEqual(marcus.sourceVerifiedNativeNameAliases,['Marcus Almeida']);
 assert.equal(marcus.disambiguation.verifiedUfcStatsFighterId,'095854a135e6db55');
 assert.equal(marcus.disambiguation.verifiedNumericNativeFighterId,'7324');
 assert.equal(marcus.fighterName,'Marcus Buchecha');
 assert.equal(marcus.bouts.find(x=>x.nativeBoutId==='60651').result,'draw');
 assert.equal(native.bouts['60651'].result.winnerId,null);
 assert.equal(native.bouts['60651'].result.method,'draw');
 assert.equal(src.fighters['marcus-almeida'].bouts.find(x=>x.nativeBoutId==='60651').sourceEventDate,'2025-12-13');
 assert.deepEqual(reg.fighters['ryan-gandra'].bouts.map(x=>x.result),['win','win','win']);
});
