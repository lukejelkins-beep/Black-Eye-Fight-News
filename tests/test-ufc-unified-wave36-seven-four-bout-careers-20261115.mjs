import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const rd=x=>JSON.parse(readFileSync(new URL('../data/'+x,import.meta.url),'utf8'));
const registry=rd('ufc-independent-full-career-verification.json');
const native=rd('ufcalendar-rich-progress.json');
const history=rd('ufcalendar-fighter-research.json');
const approved=rd('ufc-36-month-roster-approval.json');
const feeder=rd('ufc-feeder-bout-evidence.json');

const cases={
 'kleydson-rodrigues':{own:'957',fighter:'102a8fdf8cbf7467',excluded:['88241'],matches:{'61025':'63605e9f3e71d738','60074':'ac73c6888ee9322c','59737':'16dbe70eb7007f17','61605':'8289033e03b4d9a3'}},
 'montse-rendon':{own:'235',fighter:'60193e707634e560',excluded:[],matches:{'60722':'8cab057e6549afd0','38233':'c4a6174b0698652e','39002':'f1c3abce15ef053e','60041':'0732e6b6eb0a607d'}},
 'rizvan-kuniev':{own:'503',fighter:'739fd4fbb5d862f4',excluded:['84036','84110'],matches:{'83734':'8788a6dda6e64aff','82600':'5ffb251c6ea48b65','60727':'a5c5f76cf0a7c784','60273':'8e5744c664fec3e9'}},
 'saimon-oliveira':{own:'135',fighter:'72ea1984c52019b5',excluded:['83959'],matches:{'65898':'0f9e7d0d04e24b74','61007':'55376d5c205fa844','59729':'1d35e4c0941d1397','61641':'9687021e5c4d092a'}},
 'seokhyeon-ko':{own:'405',fighter:'4a07b1988477502c',excluded:['83885'],matches:{'93281':'cd446b8759b30093','82954':'f2eb569176e46edf','60429':'e6031b5937294176','60277':'e512b80bbaea36c2'}},
 'alexia-thainara':{own:'133',fighter:'545092d13c67aa49',excluded:['83987'],matches:{'83097':'13f31f7a784013a3','60635':'796e1151896195aa','38220':'e35f7504d83b8b07','60311':'b5b4b69bccb9ff4a'}},
 'antonio-trocoli':{own:'350',fighter:'6d48a2df51749d91',excluded:['84135'],matches:{'60568':'8817bd21b6d0a989','60532':'964ea1777695851b','65832':'582846744e379178','38809':'fbbf5391ea25521b'}}
};

test('wave36 adds exactly seven distinct full four-bout official UFC histories with exact original independent fight URLs',()=>{
 assert.equal(approved.approvedFighters.length,783);
 assert.equal(new Set(Object.keys(registry.fighters)).size,Object.keys(registry.fighters).length);
 let total=0;
 for(const[slug,spec]of Object.entries(cases)){
  assert.ok(approved.approvedFighters.includes(slug),slug);
  const proof=registry.fighters[slug];
  assert.equal(proof?.sourceCoverageAttested,true,slug);
  assert.equal(proof.scope,'complete_official_ufc_career');
  assert.equal(proof.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(proof.fighterName,history.profiles[slug].name);
  assert.equal(proof.fighterUrl,'https://ufcstats.com/fighter-details/'+spec.fighter);
  assert.deepEqual(proof.verifiedNumericFighterIds,[spec.own]);
  assert.equal(proof.bouts.length,4);
  assert.equal(new Set(proof.bouts.map(b=>b.nativeBoutId)).size,4);
  assert.equal(new Set(proof.bouts.map(b=>b.fightUrl)).size,4);
  assert.equal(proof.sourceSnapshot?.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(proof.sourceVerifiedExcludedFeederBouts.length,spec.excluded.length);
  for(const id of spec.excluded)assert.ok(proof.sourceVerifiedExcludedFeederBouts.some(x=>x.nativeBoutId===id&&x.officialSourceUrl===proof.officialFighterUrl));
  for(const b of proof.bouts){
   assert.equal(b.fightUrl,'https://ufcstats.com/fight-details/'+spec.matches[b.nativeBoutId]);
   assert.equal(b.nativeFighterId,spec.own);
   const original=native.bouts[b.nativeBoutId];
   assert.equal(original?.org,'ufc');
   assert.equal(original?.status,'completed');
   assert.doesNotMatch(original.event,/contender series|road to ufc|dwcs/i);
   const own=original.a?.slug===slug?original.a:original.b?.slug===slug?original.b:null,opp=own===original.a?original.b:original.a;
   assert.equal(own?.id,spec.own);assert.equal(opp?.name,b.opponent);
   assert.ok(Math.abs(Date.parse(b.date)-Date.parse(original.eventDate))<=86400000);
   assert.equal(b.result,original.result?.winnerId===own.id?'win':original.result?.winnerId===opp.id?'loss':null);
   assert.ok(Number(native.roundDone[b.nativeBoutId])>0);
   assert.ok(history.profiles[slug].recentHistory.some(h=>h.source==='native'&&h.promotion==='ufc'&&h.boutId===b.nativeBoutId&&h.result===b.result));
   total++;
  }
 }
 assert.equal(total,28);
});

test('wave36 feeder exclusions are real, and the duplicate Montse Alice Pereira Greco record counts only once',()=>{
 let exclusions=0;
 for(const [slug,spec]of Object.entries(cases)){
  const saved=history.profiles[slug].recentHistory.filter(h=>h.source==='native'&&h.promotion==='ufc');
  assert.deepEqual(new Set(saved.map(x=>x.boutId)),new Set([...Object.keys(spec.matches),...spec.excluded]));
  exclusions+=spec.excluded.length;
 }
 assert.equal(exclusions,7);
 const montse=registry.fighters['montse-rendon'].bouts.filter(b=>b.opponent==='Alice Pereira');
 assert.equal(montse.length,1);
 assert.equal(montse[0].fightUrl,'https://ufcstats.com/fight-details/c4a6174b0698652e');
 assert.ok(feeder.bouts.some(b=>b.fighterSlug==='antonio-trocoli'&&b.boutId==='84135'&&b.result===undefined)||
   feeder.bouts.some(b=>b.fighterSlug==='antonio-trocoli'&&b.boutId==='84135'));
});
