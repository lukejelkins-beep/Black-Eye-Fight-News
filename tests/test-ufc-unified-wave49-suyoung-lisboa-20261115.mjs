import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json'),census=read('ufc-36-month-candidates.json'),cache=read('ufcalendar-rich-progress.json'),profiles=read('ufcalendar-fighter-research.json').profiles,register=read('ufc-independent-full-career-verification.json').fighters,source=read('ufc-unified-wave49-suyoung-lisboa-source-review-20261115.json');
const cases=[
  {
    "slug": "suyoung-you",
    "name": "SuYoung You",
    "nativeId": "266",
    "statsId": "a474aade8eb3a8f0",
    "official": "https://www.ufc.com/athlete/suyoung-you",
    "note": "The official Road to UFC 3 title final vs Baergeng Jieleyisi on 2024-11-23 is a completed Octagon bout, while earlier RTU qualifying bouts in third-party professional history are not UFC Octagon results. UFC's 2026 Edmonton official scorecards independently confirm You submitted Cody Chovancek, despite graphical athlete-card result labels.",
    "extra": "https://www.ufc.com/index.php/news/ufc-edmonton-official-scorecards-buckley-vs-malott",
    "bouts": [
      [
        "2024-11-23",
        "Baergeng Jieleyisi",
        "win",
        "9c207acb12c17a67",
        "38591",
        "2870"
      ],
      [
        "2025-03-15",
        "AJ Cunningham",
        "win",
        "29d9c5a3f2b78903",
        "60362",
        "2854"
      ],
      [
        "2025-08-23",
        "Xiao Long",
        "win",
        "2f6065fe0804d1d8",
        "65921",
        "267"
      ],
      [
        "2026-03-14",
        "Elijah Smith",
        "loss",
        "f44b4e998b6829f6",
        "60719",
        "511"
      ],
      [
        "2026-10-17",
        "Cody Chovancek",
        "win",
        "0768a3792443212d",
        "93029",
        "30885"
      ]
    ]
  },
  {
    "slug": "tainara-lisboa",
    "name": "Tainara Lisboa",
    "nativeId": "136",
    "statsId": "2c5f5749569eef66",
    "official": "https://www.ufc.com/athlete/tainara-lisboa",
    "note": "Official UFC athlete narrative confirms losses to Luana Santos, Melissa Croden and Lucia Szabová even where the UFC.com graphical athlete record shows misleading Win markers. Pinned Greco transliterates Szabová as Szabova; original native opposing-corner identity confirms the same bout. Non-UFC prior Muay Thai history excluded.",
    "extra": "https://www.ufc.com/news/ufc-fight-night-moicano-vs-nolan-prelim-results",
    "bouts": [
      [
        "2023-05-13",
        "Jessica-Rose Clark",
        "win",
        "acfcf75f0215b7ab",
        "61306",
        "1167"
      ],
      [
        "2023-10-14",
        "Ravena Oliveira",
        "win",
        "5b7b5b01f4dcbd9c",
        "60016",
        "145"
      ],
      [
        "2025-05-17",
        "Luana Santos",
        "loss",
        "f75fe8b384b0db11",
        "60848",
        "336"
      ],
      [
        "2025-10-18",
        "Melissa Croden",
        "loss",
        "dec301fd5e99ca46",
        "38154",
        "139"
      ],
      [
        "2026-10-31",
        "Lucia Szabová",
        "loss",
        "1bf2edb30de4c976",
        "86003",
        "3029"
      ]
    ]
  }
];
const history=c=>profiles[c.slug].recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&h.date<=census.asOf);
const gate=(c,p)=>evaluateCareerEvidence(profiles[c.slug],history(c),census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight,approval.rosterAsOf,p,cache.bouts).independentlyVerified;
test('wave49 independently crosschecks ten unique complete career bouts with Greco IDs, original native corners, dates, results and measured rounds',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(source.certificationGranted,false);
 assert.equal(new Set(cases.flatMap(c=>c.bouts.map(b=>b[4]))).size,10);
 for(const c of cases){
  assert.ok(approval.approvedFighters.includes(c.slug));
  const p=register[c.slug],s=source.fighters[c.slug];
  assert.ok(p);
  assert.equal(p.sourceCoverageAttested,true);
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.officialUfcCareerBoutCount,5);
  assert.equal(p.bouts.length,5);
  assert.equal(s.bouts.length,5);
  assert.equal(history(c).length,5);
  assert.equal(p.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
  assert.equal(p.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+c.statsId);
  assert.equal(p.officialFighterUrl,c.official);
  assert.deepEqual(p.verifiedNumericFighterIds,[c.nativeId]);
  for(const [date,opponent,result,fightId,id,otherId] of c.bouts){
   assert.deepEqual(p.bouts.find(b=>b.nativeBoutId===id),{date,opponent,result,fightUrl:'https://ufcstats.com/fight-details/'+fightId,nativeBoutId:id,nativeFighterId:c.nativeId});
   const b=cache.bouts[id];
   assert.equal(b.org,'ufc');
   assert.equal(b.status,'completed');
   assert.ok(Math.abs(Date.parse(b.eventDate)-Date.parse(date))<=86400000);
   assert.ok(Number(cache.roundDone[id])>0);
   const own=b.a.id===c.nativeId?b.a:b.b.id===c.nativeId?b.b:null,other=own===b.a?b.b:b.a;
   assert.equal(own.slug,c.slug);
   assert.equal(other.id,otherId);
   assert.equal(other.name,opponent);
   assert.equal(b.result.winnerId===own.id?'win':b.result.winnerId===other.id?'loss':null,result);
   assert.ok(history(c).some(h=>h.boutId===id&&h.result===result));
  }
  assert.equal(gate(c,p),true);
 }
});
test('wave49 includes official Road to UFC title final and corrects misleading graphic result tiles',()=>{
 const y=cases.find(c=>c.slug==='suyoung-you'),t=cases.find(c=>c.slug==='tainara-lisboa');
 assert.equal(cache.bouts['38591'].event,'UFC Macau: Yan vs Figueiredo');
 assert.equal(register[y.slug].bouts.find(z=>z.nativeBoutId==='38591').result,'win');
 assert.equal(register[y.slug].bouts.find(z=>z.nativeBoutId==='93029').result,'win');
 for(const id of ['60848','38154','86003'])assert.equal(register[t.slug].bouts.find(z=>z.nativeBoutId===id).result,'loss');
 assert.equal(history(y).length,5);
 assert.equal(history(t).length,5);
 assert.equal(gate(y,register[y.slug]),true);
 assert.equal(gate(t,register[t.slug]),true);
});
test('wave49 fail-closed on missing bouts, swapped native fighter identity or inverted actual winner',()=>{
 for(const c of cases){
  const p=register[c.slug];
  assert.equal(gate(c,{...p,bouts:p.bouts.slice(1)}),false);
  assert.equal(gate(c,{...p,verifiedNumericFighterIds:['999999']}),false);
  assert.equal(gate(c,{...p,bouts:p.bouts.map((z,i)=>i===0?{...z,result:z.result==='win'?'loss':'win'}:z)}),false);
 }
});
