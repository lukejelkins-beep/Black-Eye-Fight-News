import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('data/ufc-36-month-roster-approval.json');
const registry=read('data/ufc-independent-full-career-verification.json');
const review=read('data/ufc-unified-wave20-taveras-walker-musayev-source-review-20261114.json');
const native=read('data/ufcalendar-rich-progress.json');
const feeder=read('data/ufc-feeder-bout-evidence.json');
const checks=[
  {
    "slug": "ramon-taveras",
    "fid": "60",
    "bouts": [
      {
        "date": "2024-01-20",
        "opponent": "Serhiy Sidey",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/43d90683078fcee5",
        "nativeBoutId": "59871"
      },
      {
        "date": "2024-12-14",
        "opponent": "Davey Grant",
        "result": "loss",
        "fightUrl": "https://ufcstats.com/fight-details/b40e4deb48658851",
        "nativeBoutId": "60379"
      },
      {
        "date": "2025-09-27",
        "opponent": "Jack Jenkins",
        "result": "loss",
        "fightUrl": "https://ufcstats.com/fight-details/38248c5d13f273e6",
        "nativeBoutId": "38211"
      }
    ],
    "feederIds": [
      "88267",
      "84097"
    ]
  },
  {
    "slug": "brogan-walker",
    "fid": "134",
    "bouts": [
      {
        "date": "2022-08-06",
        "opponent": "Juliana Miller",
        "result": "loss",
        "fightUrl": "https://ufcstats.com/fight-details/2b11aa4b90b1dd41",
        "nativeBoutId": "59550"
      },
      {
        "date": "2023-04-22",
        "opponent": "Iasmin Lucindo",
        "result": "loss",
        "fightUrl": "https://ufcstats.com/fight-details/20c0f50c11509301",
        "nativeBoutId": "61275"
      },
      {
        "date": "2025-10-04",
        "opponent": "Veronica Hardy",
        "result": "loss",
        "fightUrl": "https://ufcstats.com/fight-details/98883348ddb3be33",
        "nativeBoutId": "60751"
      }
    ],
    "feederIds": []
  },
  {
    "slug": "tofiq-musayev",
    "fid": "519",
    "bouts": [
      {
        "date": "2025-06-21",
        "opponent": "Myktybek Orolbai",
        "result": "loss",
        "fightUrl": "https://ufcstats.com/fight-details/36ec204f47e4d613",
        "nativeBoutId": "60274"
      },
      {
        "date": "2026-03-28",
        "opponent": "Ignacio Bahamondes",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/fa96d6252579b51e",
        "nativeBoutId": "60629"
      },
      {
        "date": "2026-08-01",
        "opponent": "Ludovit Klein",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/fbd99ae7e1ff993a",
        "nativeBoutId": "82714"
      }
    ],
    "feederIds": []
  }
];
test('wave20 complete three-career UFC sources exactly reconcile nine historical Greco fight IDs and original numeric paired corners',()=>{
 assert.equal(roster.approvedFighters.length,783);
 assert.equal(review.nonproduction,true);
 assert.equal(review.certificationGranted,false);
 assert.deepEqual(Object.keys(review.fighters),checks.map(x=>x.slug));
 for(const c of checks){
  assert.ok(roster.approvedFighters.includes(c.slug),c.slug);
  const p=registry.fighters[c.slug];
  assert.equal(p.sourceCoverageAttested,true,c.slug);
  assert.equal(p.scope,'complete_official_ufc_career',c.slug);
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck',c.slug);
  assert.equal(p.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da',c.slug);
  assert.deepEqual(p.verifiedNumericFighterIds,[c.fid],c.slug);
  assert.equal(p.officialUfcCareerBoutCount,3,c.slug);
  assert.equal(p.bouts.length,3,c.slug);
  assert.equal(new Set(p.bouts.map(x=>x.nativeBoutId)).size,3,c.slug);
  for(const b of c.bouts){
   const x=p.bouts.find(y=>y.nativeBoutId===b.nativeBoutId);
   assert.deepEqual(x,{date:b.date,opponent:b.opponent,result:b.result,fightUrl:b.fightUrl,nativeBoutId:b.nativeBoutId,nativeFighterId:c.fid},c.slug);
   const n=native.bouts[b.nativeBoutId];
   assert.equal(n?.org,'ufc');assert.equal(n?.status,'completed');
   assert.ok(Math.abs(Date.parse(n.eventDate)-Date.parse(b.date))<=86400000);
   const own=[n.a,n.b].find(y=>y?.id===c.fid),other=[n.a,n.b].find(y=>y?.id!==c.fid);
   assert.ok(own&&other);assert.equal(other.name,b.opponent);
   assert.equal(n.result?.winnerId===c.fid?'win':'loss',b.result);
  }
 }
});
test('Taveras two DWCS cases and Sidey reciprocal native bout, official TUF final and Rizin separation',()=>{
 const t=registry.fighters['ramon-taveras'],sidey=registry.fighters['serhiy-sidey'];
 assert.deepEqual(t.sourceVerifiedExcludedFeederBouts.map(x=>x.nativeBoutId),['88267','84097']);
 for(const id of ['88267','84097']){
  assert.equal(feeder.bouts.filter(x=>x.fighterSlug==='ramon-taveras'&&x.boutId===id).length,1);
  assert.ok(!t.bouts.some(x=>x.nativeBoutId===id));
 }
 assert.equal(t.bouts[0].nativeBoutId,'59871');
 assert.equal(t.bouts[0].result,'win');
 assert.equal(sidey.bouts.find(x=>x.nativeBoutId==='59871')?.result,'loss');
 assert.equal(native.bouts['88267'].result.winnerId,'2867');
 assert.equal(native.bouts['59871'].result.winnerId,'60');
 assert.equal(native.bouts['66105'].status,'cancelled');
 const b=registry.fighters['brogan-walker'];
 assert.deepEqual(b.bouts.map(x=>x.result),['loss','loss','loss']);
 assert.equal(b.bouts[0].nativeBoutId,'59550');
 assert.ok(!b.bouts.some(x=>['Hannah Guy','Laura Gallardo'].includes(x.opponent)));
 assert.deepEqual(registry.fighters['tofiq-musayev'].bouts.map(x=>x.result),['loss','win','win']);
});
