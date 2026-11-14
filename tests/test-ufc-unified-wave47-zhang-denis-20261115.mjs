import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json');
const census=read('ufc-36-month-candidates.json');
const cache=read('ufcalendar-rich-progress.json');
const profiles=read('ufcalendar-fighter-research.json').profiles;
const register=read('ufc-independent-full-career-verification.json').fighters;
const source=read('ufc-unified-wave47-zhang-denis-source-review-20261115.json');
const cases=[
  {
    "slug": "zhang-mingyang",
    "name": "Zhang Mingyang",
    "nativeId": "53",
    "statsId": "8a65fd9ba31fd3f7",
    "official": "https://www.ufc.com/athlete/zhang-mingyang",
    "bouts": [
      [
        "2024-02-17",
        "Brendson Ribeiro",
        "win",
        "aeb3e4d9710207a4",
        "59896",
        "263"
      ],
      [
        "2024-11-23",
        "Ozzy Diaz",
        "win",
        "56d2c00dfd391fcf",
        "38590",
        "550"
      ],
      [
        "2025-04-26",
        "Anthony Smith",
        "win",
        "a526a72ade275f46",
        "60875",
        "714"
      ],
      [
        "2025-08-23",
        "Johnny Walker",
        "loss",
        "2eecf0c36192e40c",
        "65911",
        "7170"
      ],
      [
        "2026-05-30",
        "Alonzo Menifield",
        "loss",
        "a23d84f15207e459",
        "66102",
        "54"
      ]
    ],
    "note": "UFC.com preview confirms his 2022 Road to UFC bout was a non-tournament prior appearance; full Octagon debut was 2024-02-17, so 2022 appearance is not a sixth official UFC Octagon bout."
  },
  {
    "slug": "denis-tiuliulin",
    "name": "Denis Tiuliulin",
    "nativeId": "1195",
    "statsId": "0112352cb32f5026",
    "official": "https://www.ufc.com/athlete/denis-tiuliulin",
    "bouts": [
      [
        "2022-03-26",
        "Aliaskhab Khizriev",
        "loss",
        "6ed495c177d69a3a",
        "61440",
        "1194"
      ],
      [
        "2022-09-10",
        "Jamie Pickett",
        "win",
        "77acb96700e89c92",
        "59833",
        "1129"
      ],
      [
        "2023-02-04",
        "JunYong Park",
        "loss",
        "983fab4080743ed0",
        "59752",
        "439"
      ],
      [
        "2023-08-19",
        "Gregory Rodrigues",
        "loss",
        "f995ed679ef8bdf4",
        "61159",
        "395"
      ],
      [
        "2023-11-18",
        "Christian Leroy Duncan",
        "loss",
        "16109688429c09de",
        "59981",
        "426"
      ],
      [
        "2024-08-03",
        "Sedriques Dumas",
        "loss",
        "e6851877e33d343f",
        "61103",
        "223"
      ]
    ],
    "note": "Official UFC local card date Feb 4, 2023; native UFCalendar UTC snapshot Feb 5, 2023, a single-day date shift, not a second contest."
  }
];
const history=c=>profiles[c.slug].recentHistory.filter(h=>h.promotion==='ufc'&&h.boutId&&h.date<=census.asOf);
const gate=(c,p)=>evaluateCareerEvidence(profiles[c.slug],history(c),census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight,approval.rosterAsOf,p,cache.bouts).independentlyVerified;
test('wave47 eleven complete independently sourced UFC fights have exact unchanged native corner IDs, results and measured rounds',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(source.certificationGranted,false);
 assert.equal(new Set(cases.flatMap(c=>c.bouts.map(b=>b[4]))).size,11);
 for(const c of cases){
  assert.ok(approval.approvedFighters.includes(c.slug));
  const p=register[c.slug],s=source.fighters[c.slug],h=history(c);
  assert.equal(p.sourceCoverageAttested,true);
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.officialUfcCareerBoutCount,c.bouts.length);
  assert.equal(p.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da');
  assert.equal(p.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+c.statsId);
  assert.equal(p.officialFighterUrl,c.official);
  assert.deepEqual(p.verifiedNumericFighterIds,[c.nativeId]);
  assert.equal(h.length,c.bouts.length);
  assert.equal(p.bouts.length,c.bouts.length);
  assert.equal(s.bouts.length,c.bouts.length);
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
   assert.ok(h.some(x=>x.boutId===id&&x.result===result&&Math.abs(Date.parse(x.date)-Date.parse(date))<=86400000));
  }
  assert.equal(gate(c,p),true);
 }
});
test('wave47 excludes Zhang non-tournament 2022 Road to UFC and preserves Denis February event-local/UTC offset',()=>{
 const z=cases.find(c=>c.slug==='zhang-mingyang'),d=cases.find(c=>c.slug==='denis-tiuliulin');
 assert.equal(history(z).length,5);
 assert.equal(register[z.slug].earliestOfficialUfcBout,'2024-02-17');
 assert.equal(register[z.slug].bouts.length,5);
 assert.equal(register[z.slug].bouts.some(b=>b.date.startsWith('2022')),false);
 assert.equal(history(d).length,6);
 assert.equal(register[d.slug].bouts.length,6);
 assert.equal(register[d.slug].bouts.find(b=>b.nativeBoutId==='59752').date,'2023-02-04');
 assert.equal(cache.bouts['59752'].eventDate,'2023-02-05');
 assert.equal(gate(d,register[d.slug]),true);
});
test('wave47 strict Stage3 fails closed when a bout is removed, corner identity changes or outcome is inverted',()=>{
 for(const c of cases){
  const p=register[c.slug];
  assert.equal(gate(c,{...p,bouts:p.bouts.slice(1)}),false);
  assert.equal(gate(c,{...p,verifiedNumericFighterIds:['999999']}),false);
  assert.equal(gate(c,{...p,bouts:p.bouts.map((b,i)=>i===0?{...b,result:b.result==='win'?'loss':'win'}:b)}),false);
 }
});
