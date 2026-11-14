import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('data/ufc-36-month-roster-approval.json');
const register=read('data/ufc-independent-full-career-verification.json');
const fixture=read('data/ufc-unified-wave21-riley-luna-rahiki-source-review-20261114.json');
const native=read('data/ufcalendar-rich-progress.json');
const feeders=read('data/ufc-feeder-bout-evidence.json');
const expected={
  "luke-riley": {
    "fid": "377",
    "statsId": "b1de86d835638319",
    "official": "https://www.ufc.com/athlete/luke-riley",
    "b": [
      {
        "date": "2025-11-22",
        "opponent": "Bogdan Grad",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/5e6a74db89f5410c",
        "nativeBoutId": "60410",
        "nativeFighterId": "377"
      },
      {
        "date": "2026-03-21",
        "opponent": "Michael Aswell Jr.",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/fa534aaa5b997a69",
        "nativeBoutId": "60560",
        "nativeFighterId": "377"
      },
      {
        "date": "2026-07-11",
        "opponent": "Kai Kamaka III",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/930317fde9dbc55e",
        "nativeBoutId": "66445",
        "nativeFighterId": "377"
      }
    ],
    "feed": []
  },
  "santiago-luna": {
    "fid": "228",
    "statsId": "faf317c665546a36",
    "official": "https://www.ufc.com/athlete/santiago-luna",
    "b": [
      {
        "date": "2025-09-13",
        "opponent": "Quang Le",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/8a884a7930d75ca9",
        "nativeBoutId": "38225",
        "nativeFighterId": "228"
      },
      {
        "date": "2026-02-28",
        "opponent": "Angel Pacheco",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/3b76a00f5d0400eb",
        "nativeBoutId": "60678",
        "nativeFighterId": "228"
      },
      {
        "date": "2026-06-06",
        "opponent": "Bryce Mitchell",
        "result": "loss",
        "fightUrl": "https://ufcstats.com/fight-details/c47796e11a801e12",
        "nativeBoutId": "66470",
        "nativeFighterId": "228"
      }
    ],
    "feed": []
  },
  "marwan-rahiki": {
    "fid": "540",
    "statsId": "6eedb757f13b9978",
    "official": "https://www.ufc.com/athlete/marwan-rahiki",
    "b": [
      {
        "date": "2026-03-14",
        "opponent": "Harry Hardwick",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/e0acd0cf4930671b",
        "nativeBoutId": "60714",
        "nativeFighterId": "540"
      },
      {
        "date": "2026-05-02",
        "opponent": "Ollie Schmid",
        "result": "win",
        "fightUrl": "https://ufcstats.com/fight-details/cfc884a249141cba",
        "nativeBoutId": "66066",
        "nativeFighterId": "540"
      },
      {
        "date": "2026-09-12",
        "opponent": "Tommy McMillen",
        "result": "loss",
        "fightUrl": "https://ufcstats.com/fight-details/1fca7dfa9e1e15cb",
        "nativeBoutId": "83442",
        "nativeFighterId": "540"
      }
    ],
    "feed": [
      "84105"
    ]
  }
};
test('wave21 source-backed nine complete official UFC bouts, approved identities, official results and exact original native opposing corners',()=>{
 assert.equal(roster.status,'approved');assert.equal(roster.approvedFighters.length,783);
 assert.equal(new Set(roster.approvedFighters).size,783);
 assert.equal(fixture.nonproduction,true);assert.equal(fixture.certificationGranted,false);
 assert.deepEqual(Object.keys(fixture.fighters),Object.keys(expected));
 for(const [slug,x] of Object.entries(expected)){
  assert.ok(roster.approvedFighters.includes(slug),slug);
  const p=register.fighters[slug],s=fixture.fighters[slug];assert.ok(p?.sourceCoverageAttested,slug);
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.officialFighterUrl,x.official);
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+x.statsId);
  assert.deepEqual(p.verifiedNumericFighterIds,[x.fid]);
  assert.equal(p.sourceSnapshot.sourceCommit,fixture.pinnedSource.sourceCommit);
  assert.equal(p.officialUfcCareerBoutCount,3);assert.equal(p.bouts.length,3);
  assert.deepEqual(p.bouts,x.b);
  assert.equal(new Set(p.bouts.map(b=>b.nativeBoutId)).size,3);
  assert.equal(new Set(p.bouts.map(b=>b.fightUrl)).size,3);
  assert.deepEqual(s.bouts.map(b=>({date:b.date,opponent:b.opponent,result:b.result,fightUrl:b.fightUrl,nativeBoutId:b.nativeBoutId,nativeFighterId:b.nativeFighterId})),x.b);
  for(const b of x.b){
   const n=native.bouts[b.nativeBoutId];assert.equal(n?.org,'ufc',slug);assert.equal(n.status,'completed',slug);
   assert.equal(n.eventDate,b.date,slug);
   const own=[n.a,n.b].find(c=>c?.id===x.fid),other=[n.a,n.b].find(c=>c?.id!==x.fid);
   assert.equal(own?.slug,slug);assert.equal(other?.name,b.opponent,slug);
   assert.equal(n.result?.winnerId===x.fid?'win':'loss',b.result,slug);
  }
 }
});
test('Rahiki 2025 DWCS exact native bout excluded; Luna source alias duplicate not double counted; opposing McMillen reciprocal result preserved',()=>{
 for(const [slug,x] of Object.entries(expected)){
  const p=register.fighters[slug];assert.deepEqual((p.sourceVerifiedExcludedFeederBouts||[]).map(b=>b.nativeBoutId),x.feed);
  for(const id of x.feed){
   assert.equal(feeders.bouts.filter(b=>b.fighterSlug===slug&&b.boutId===id).length,1);
   assert.equal(feeders.bouts.find(b=>b.fighterSlug===slug&&b.boutId===id).sourceUrl,x.official);
   assert.ok(!p.bouts.some(b=>b.nativeBoutId===id));
  }
 }
 const luna=fixture.fighters['santiago-luna'];
 assert.equal(luna.rawGrecoRows,4);assert.equal(luna.distinctGrecoFightUrls,3);
 assert.equal(register.fighters['santiago-luna'].bouts.filter(b=>b.nativeBoutId==='38225').length,1);
 assert.equal(register.fighters['santiago-luna'].bouts.find(b=>b.nativeBoutId==='66470').result,'loss');
 const marwan=register.fighters['marwan-rahiki'];const tommy=register.fighters['tommy-mcmillen'];
 assert.equal(marwan.bouts.find(b=>b.nativeBoutId==='83442').result,'loss');
 assert.equal(tommy.bouts.find(b=>b.nativeBoutId==='83442').result,'win');
 assert.equal(tommy.bouts.find(b=>b.nativeBoutId==='83442').fightUrl,marwan.bouts.find(b=>b.nativeBoutId==='83442').fightUrl);
});
