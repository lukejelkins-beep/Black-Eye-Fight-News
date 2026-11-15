import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json'),census=read('ufc-36-month-candidates.json'),cache=read('ufcalendar-rich-progress.json'),profiles=read('ufcalendar-fighter-research.json').profiles,register=read('ufc-independent-full-career-verification.json').fighters,source=read('ufc-unified-wave51-lee-prepolec-valentin-source-review-20261115.json');
const cases=[
  {
    "slug": "jeongyeong-lee",
    "name": "JeongYeong Lee",
    "nativeId": "2785",
    "statsId": "d008d785f6347dc2",
    "official": "https://www.ufc.com/athlete/jeongyeong-lee",
    "note": "The official 2023-02-04 Road to UFC Season 1 featherweight title final vs Yizha is a completed Octagon bout. The June/October 2022 RTU qualifiers are not Octagon results. Native source's 2023-02-05 final and 2025-05-11 Santos entries are UTC day shifts of the official local results. Full UFC narrative overrides misleading graphical wins on 2024/25/26 losses.",
    "bouts": [
      [
        "2023-02-04",
        "Yizha",
        "win",
        "765482eb58e8db48",
        "59749",
        "281"
      ],
      [
        "2024-02-03",
        "Blake Bilder",
        "win",
        "e1930496b33fa636",
        "59860",
        "2779"
      ],
      [
        "2024-07-20",
        "Hyder Amil",
        "loss",
        "6e6567a98ea78891",
        "65928",
        "119"
      ],
      [
        "2025-05-10",
        "Daniel Santos",
        "loss",
        "0e0a4282cd6c86d7",
        "60898",
        "30"
      ],
      [
        "2026-10-31",
        "Julian Erosa",
        "loss",
        "52d61656f77f6650",
        "93266",
        "522"
      ]
    ]
  },
  {
    "slug": "kyle-prepolec",
    "name": "Kyle Prepolec",
    "nativeId": "156",
    "statsId": "873626e5547b5235",
    "official": "https://www.ufc.com/athlete/kyle-prepolec",
    "note": "Official UFC.com narrative explicitly covers first UFC tenure in 2019 and second UFC tenure after return in 2025: five actual Octagon losses across both stints. Non-UFC fights during hiatus are excluded. UFC.com's current Octagon Debut date is inconsistent with its own May 2019 dated debut biography; historical source and native IDs resolve it.",
    "bouts": [
      [
        "2019-05-04",
        "Nordine Taleb",
        "loss",
        "003c84fc7c3fa028",
        "62166",
        "2242"
      ],
      [
        "2019-09-14",
        "Austin Hubbard",
        "loss",
        "acf658afda38d8af",
        "65635",
        "269"
      ],
      [
        "2025-05-10",
        "Benoit Saint Denis",
        "loss",
        "c7190cd03e53fb61",
        "60892",
        "254"
      ],
      [
        "2025-10-18",
        "Drew Dober",
        "loss",
        "ecdbb3a5216b815e",
        "38148",
        "148"
      ],
      [
        "2026-08-01",
        "Mateusz Rębecki",
        "loss",
        "5425c577ed4f50b3",
        "83051",
        "16"
      ]
    ]
  },
  {
    "slug": "robert-valentin",
    "name": "Robert Valentin",
    "nativeId": "563",
    "statsId": "0cd0456d6029cec2",
    "official": "https://www.ufc.com/athlete/robert-valentin-frey",
    "note": "UFC.com full narrative confirms five official fights: televised TUF 32 finale against Ryan Loder is counted, TUF house quarterfinal and semifinal exhibitions are excluded. 2025-07-19 Gautier official local date differs from 2025-07-20 native UTC. Native source spelling Dusko Todorovic corresponds to official Duško Todorović.",
    "bouts": [
      [
        "2024-08-24",
        "Ryan Loder",
        "loss",
        "5c5523a6bf83e44f",
        "60229",
        "370"
      ],
      [
        "2025-04-05",
        "Torrez Finney",
        "loss",
        "d1368ca941c1fefc",
        "60301",
        "320"
      ],
      [
        "2025-07-19",
        "Ateba Gautier",
        "loss",
        "72e477b41f44e358",
        "60811",
        "11"
      ],
      [
        "2026-04-18",
        "Julien Leblanc",
        "win",
        "9fab4b0ad082f670",
        "66095",
        "567"
      ],
      [
        "2026-08-01",
        "Dusko Todorovic",
        "win",
        "f425b7a527dd53aa",
        "66467",
        "226"
      ]
    ]
  }
];
const history=c=>profiles[c.slug].recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&h.date<=census.asOf);
const gate=(c,p)=>evaluateCareerEvidence(profiles[c.slug],history(c),census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight,approval.rosterAsOf,p,cache.bouts).independentlyVerified;
test('wave51 approved cohort strict source/native/corner/date/round attestation of fifteen unique complete UFC bouts',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(source.certificationGranted,false);
 assert.equal(new Set(cases.flatMap(c=>c.bouts.map(b=>b[4]))).size,15);
 for(const c of cases){
  assert.ok(approval.approvedFighters.includes(c.slug),'frozen cohort must contain '+c.slug);
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
   const b=cache.bouts[id];assert.equal(b.org,'ufc');assert.equal(b.status,'completed');
   assert.ok(Math.abs(Date.parse(b.eventDate)-Date.parse(date))<=86400000);
   assert.ok(Number(cache.roundDone[id])>0);
   const own=b.a.id===c.nativeId?b.a:b.b.id===c.nativeId?b.b:null,other=own===b.a?b.b:b.a;
   assert.equal(own.slug,c.slug);assert.equal(other.id,otherId);assert.equal(other.name,opponent);
   assert.equal(b.result.winnerId===own.id?'win':b.result.winnerId===other.id?'loss':null,result);
   assert.ok(history(c).some(h=>h.boutId===id&&h.result===result&&Math.abs(Date.parse(h.date)-Date.parse(date))<=86400000));
  }
  assert.equal(gate(c,p),true);
 }
});
test('wave51 honours certified RTU and TUF finales and original local/UTC dates',()=>{
 const y=register['jeongyeong-lee'],k=register['kyle-prepolec'],v=register['robert-valentin'];
 assert.equal(y.bouts[0].nativeBoutId,'59749');
 assert.equal(y.bouts[0].date,'2023-02-04');
 assert.equal(cache.bouts['59749'].eventDate,'2023-02-05');
 assert.equal(v.bouts[0].nativeBoutId,'60229');
 assert.equal(v.bouts[0].opponent,'Ryan Loder');
 assert.equal(k.bouts[0].date,'2019-05-04');
 assert.equal(k.bouts[2].date,'2025-05-10');
 assert.equal(k.bouts.length,5);
 assert.deepEqual(v.bouts.map(b=>b.result),['loss','loss','loss','win','win']);
});
test('wave51 fails closed if one fight disappears or numeric fighter identity/outcome is altered',()=>{
 for(const c of cases){
  const p=register[c.slug];
  assert.equal(gate(c,{...p,bouts:p.bouts.slice(1)}),false);
  assert.equal(gate(c,{...p,verifiedNumericFighterIds:['999999']}),false);
  assert.equal(gate(c,{...p,bouts:p.bouts.map((b,i)=>i===0?{...b,result:b.result==='win'?'loss':'win'}:b)}),false);
 }
});
