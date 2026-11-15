import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('data/ufc-36-month-roster-approval.json');
const registry=read('data/ufc-independent-full-career-verification.json');
const review=read('data/ufc-unified-wave19-loder-bleda-sidey-official-source-review-20261114.json');
const native=read('data/ufcalendar-rich-progress.json');
const feeders=read('data/ufc-feeder-bout-evidence.json');
const cases=[
  {
    "slug": "ryan-loder",
    "fid": "370",
    "bouts": [
      {
        "date": "2024-08-24",
        "opponent": "Robert Valentin",
        "result": "win",
        "sourceFightUrl": "https://ufcstats.com/fight-details/5c5523a6bf83e44f",
        "nativeBoutId": "60229"
      },
      {
        "date": "2025-05-03",
        "opponent": "Azamat Bekoev",
        "result": "loss",
        "sourceFightUrl": "https://ufcstats.com/fight-details/77ed474dfc5359ea",
        "nativeBoutId": "60798"
      },
      {
        "date": "2025-11-22",
        "opponent": "Ismail Naurdiev",
        "result": "loss",
        "sourceFightUrl": "https://ufcstats.com/fight-details/335064c3380e2f10",
        "nativeBoutId": "60415"
      }
    ],
    "feeder": null
  },
  {
    "slug": "tereza-bleda",
    "fid": "309",
    "bouts": [
      {
        "date": "2022-11-19",
        "opponent": "Natalia Silva",
        "result": "loss",
        "sourceFightUrl": "https://ufcstats.com/fight-details/33719a2d9c69ed17",
        "nativeBoutId": "59789"
      },
      {
        "date": "2023-06-17",
        "opponent": "Gabriella Fernandes",
        "result": "win",
        "sourceFightUrl": "https://ufcstats.com/fight-details/9cfb84817a43b63c",
        "nativeBoutId": "60175"
      },
      {
        "date": "2025-12-13",
        "opponent": "Jamey-Lyn Horth",
        "result": "loss",
        "sourceFightUrl": "https://ufcstats.com/fight-details/71170fb7ade3e1f4",
        "nativeBoutId": "60658"
      }
    ],
    "feeder": "84051"
  },
  {
    "slug": "serhiy-sidey",
    "fid": "2867",
    "bouts": [
      {
        "date": "2024-01-20",
        "opponent": "Ramon Taveras",
        "result": "loss",
        "sourceFightUrl": "https://ufcstats.com/fight-details/43d90683078fcee5",
        "nativeBoutId": "59871"
      },
      {
        "date": "2024-11-02",
        "opponent": "Garrett Armfield",
        "result": "win",
        "sourceFightUrl": "https://ufcstats.com/fight-details/f93b074dfd47b4b4",
        "nativeBoutId": "61138"
      },
      {
        "date": "2025-05-03",
        "opponent": "Cameron Smotherman",
        "result": "win",
        "sourceFightUrl": "https://ufcstats.com/fight-details/6ccd10adc968e1f0",
        "nativeBoutId": "60795"
      }
    ],
    "feeder": "88267"
  }
];
test('nine complete UFC historical bouts across Loder Bleda Sidey pass exact official-to-native fighter, opponent, winner and dated fight provenance',()=>{
 assert.equal(roster.approvedFighters.length,783);
 assert.equal(review.nonproduction,true);assert.equal(review.certificationGranted,false);
 assert.deepEqual(Object.keys(review.fighters),cases.map(x=>x.slug));
 for(const x of cases){
  assert.ok(roster.approvedFighters.includes(x.slug));
  const p=registry.fighters[x.slug];
  assert.equal(p.sourceCoverageAttested,true,x.slug);
  assert.equal(p.scope,'complete_official_ufc_career',x.slug);
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck',x.slug);
  assert.equal(p.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da',x.slug);
  assert.deepEqual(p.verifiedNumericFighterIds,[x.fid],x.slug);
  assert.equal(p.officialUfcCareerBoutCount,3,x.slug);
  assert.equal(p.bouts.length,3,x.slug);
  assert.equal(new Set(p.bouts.map(y=>y.nativeBoutId)).size,3,x.slug);
  for(const b of x.bouts){
   const proof=p.bouts.find(y=>y.nativeBoutId===b.nativeBoutId);
   assert.deepEqual(proof,{date:b.date,opponent:b.opponent,result:b.result,fightUrl:b.sourceFightUrl,nativeBoutId:b.nativeBoutId,nativeFighterId:x.fid},x.slug);
   const card=native.bouts[b.nativeBoutId];
   assert.equal(card?.org,'ufc',x.slug);assert.equal(card?.status,'completed',x.slug);
   assert.ok(Math.abs(Date.parse(card.eventDate)-Date.parse(b.date))<=86400000,x.slug);
   const own=[card.a,card.b].find(y=>y?.id===x.fid);
   const other=[card.a,card.b].find(y=>y?.id!==x.fid);
   assert.ok(own&&other,x.slug);
   assert.equal(other.name,b.opponent,x.slug);
   assert.equal(card.result?.winnerId===x.fid?'win':'loss',b.result,x.slug);
  }
 }
});
test('TUF 32 official final counted once while exhibitions are not invented; DWCS and same-opponent source conflicts excluded',()=>{
 const l=registry.fighters['ryan-loder'];
 assert.equal(l.bouts[0].nativeBoutId,'60229');
 assert.equal(l.bouts[0].opponent,'Robert Valentin');
 assert.deepEqual(l.bouts.map(x=>x.result),['win','loss','loss']);
 assert.ok(!l.bouts.some(x=>['Tom Theocharis','Omran Chaaban'].includes(x.opponent)));
 for(const [slug,id] of [['tereza-bleda','84051'],['serhiy-sidey','88267']]){
  const p=registry.fighters[slug];
  assert.deepEqual(p.sourceVerifiedExcludedFeederBouts.map(x=>x.nativeBoutId),[id],slug);
  assert.equal(feeders.bouts.filter(x=>x.fighterSlug===slug&&x.boutId===id).length,1);
  assert.ok(!p.bouts.some(x=>x.nativeBoutId===id));
 }
 const s=registry.fighters['serhiy-sidey'];
 assert.equal(s.bouts.find(x=>x.opponent==='Ramon Taveras').result,'loss');
 assert.equal(native.bouts['88267'].result.winnerId,'2867');
 assert.equal(native.bouts['59871'].result.winnerId,'60');
 assert.deepEqual(registry.fighters['tereza-bleda'].bouts.map(x=>x.result),['loss','win','loss']);
});
