import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json');
const evidence=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const cache=read('ufcalendar-rich-progress.json');
const census=read('ufc-36-month-candidates.json');
const cases=[
 {slug:'alice-ardelean',name:'Alice Ardelean',id:'45',sourceId:'87f8699fdcc2c404',
  official:'https://www.ufc.com/athlete/alice-ardelean',
  bouts:[
   ['61090','2024-07-27','Shauna Bannon','loss','dff2ef8fdde8c502'],
   ['65943','2024-10-19','Melissa Martinez','loss','4277b02a4dadac40'],
   ['38405','2025-05-31','Rayanne dos Santos','win','73240bea13ed5e71'],
   ['60428','2025-11-01','Montserrat Conejo Ruiz','win','32927d50acedb507'],
   ['66124','2026-05-16','Polyana Viana','win','b98ead4eff6bf872']]},
 {slug:'kaan-ofli',name:'Kaan Ofli',id:'171',sourceId:'7facc9c45d792985',
  official:'https://www.ufc.com/athlete/kaan-ofli',
  bouts:[
   ['60230','2024-08-24','Mairon Santos','loss','bad06a5380d762b8'],
   ['38557','2025-02-01','Muhammad Naimov','loss','940f586104bf8bc8'],
   ['65891','2025-10-11','Ricardo Ramos','win','2aef1a91d26dde42'],
   ['65856','2026-01-31','Yizha','win','4c1e7e1765a5438a'],
   ['82670','2026-06-27','Javier Reyes','win','1a7119f3996b5635']]}
];
test('wave39 two nonduplicated full careers reproduce ten source-matched UFC native fights with measured rounds',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(new Set(cases.map(x=>x.slug)).size,2);
 const encountered=new Set();
 for(const c of cases){
  assert.ok(approval.approvedFighters.includes(c.slug));
  const e=evidence[c.slug],p=profiles[c.slug];
  assert.equal(e?.sourceCoverageAttested,true);
  assert.equal(e.scope,'complete_official_ufc_career');
  assert.equal(e.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(e.fighterName,c.name);
  assert.equal(e.officialFighterUrl,c.official);
  assert.equal(e.fighterUrl,'https://ufcstats.com/fighter-details/'+c.sourceId);
  assert.equal(e.sourceSnapshot?.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.deepEqual(e.verifiedNumericFighterIds,[c.id]);
  assert.equal(e.officialUfcCareerBoutCount,5);
  assert.equal(e.bouts.length,5);
  assert.equal(new Set(e.bouts.map(x=>x.nativeBoutId)).size,5);
  assert.equal(new Set(e.bouts.map(x=>x.fightUrl)).size,5);
  assert.deepEqual(e.sourceVerifiedExcludedFeederBouts,[]);
  const hist=p.recentHistory.filter(x=>x.promotion==='ufc'&&x.date<=census.asOf);
  assert.equal(hist.length,5);
  for(const [nativeBoutId,date,opponent,result,fightId] of c.bouts){
   const row=e.bouts.find(x=>x.nativeBoutId===nativeBoutId);
   assert.deepEqual(row,{date,opponent,result,fightUrl:'https://ufcstats.com/fight-details/'+fightId,nativeBoutId,nativeFighterId:c.id});
   assert.ok(!encountered.has(nativeBoutId),'double counted UFC bout in new wave');
   encountered.add(nativeBoutId);
   assert.ok(hist.some(x=>x.boutId===nativeBoutId&&x.result===result));
   const b=cache.bouts[nativeBoutId];
   assert.equal(b?.org,'ufc');
   assert.equal(b?.status,'completed');
   assert.ok(!/contender series|road to ufc|\\bdwcs\\b/i.test(b.event));
   assert.ok(Math.abs(Date.parse(date)-Date.parse(b.eventDate))<=86400000);
   assert.ok(Number(cache.roundDone[nativeBoutId])>0);
   const own=b.a?.id===c.id?b.a:b.b?.id===c.id?b.b:null;
   assert.equal(own?.slug,c.slug);
   const other=own===b.a?b.b:b.a;
   assert.equal(other?.name,opponent);
   assert.equal(b.result?.winnerId===own.id?'win':b.result?.winnerId===other.id?'loss':null,result);
  }
  const last=census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight;
  assert.equal(evaluateCareerEvidence(p,hist,last,approval.rosterAsOf,e,cache.bouts).independentlyVerified,true);
 }
});
test('Alice May 2025 original UFC event was retitled after cancelled main event, but native source fight remains one',()=>{
 const native=cache.bouts['38405'];
 assert.equal(native.event,'UFC Fight Night: Gamrot vs Klein');
 assert.equal(native.eventDate,'2025-06-01');
 const e=evidence['alice-ardelean'];
 assert.ok(e.independentSourceCrosschecks.includes('https://www.ufc.com/news/official-judges-scorecards-ufc-fight-night-blanchfield-vs-barber-apex-ufc-tonight'));
 assert.ok(e.bouts.some(x=>x.nativeBoutId==='38405'&&x.date==='2025-05-31'&&x.result==='win'));
});
test('Kaan TUF 32 televised finale counts once as official UFC while house exhibitions do not',()=>{
 const e=evidence['kaan-ofli'];
 assert.equal(e.bouts[0].nativeBoutId,'60230');
 assert.equal(cache.bouts['60230']?.event,'UFC Fight Night: Cannonier vs Borralho');
 assert.ok(e.independentSourceCrosschecks.includes('https://www.ufc.com/news/official-judges-scorecards-ufc-fight-night-cannonier-vs-borralho-vegas-96'));
 assert.equal(e.bouts.length,5);
});
test('new wave strict source gate fails closed on missing or altered bout and fighter identity',()=>{
 for(const c of cases){
  const e=evidence[c.slug],p=profiles[c.slug];
  const hist=p.recentHistory.filter(x=>x.promotion==='ufc'&&x.date<=census.asOf);
  const last=census.fighters.find(x=>x.slug===c.slug)?.lastUfcFight;
  const gate=x=>evaluateCareerEvidence(p,hist,last,approval.rosterAsOf,x,cache.bouts).independentlyVerified;
  assert.equal(gate({...e,bouts:e.bouts.slice(1)}),false);
  assert.equal(gate({...e,verifiedNumericFighterIds:['999999999999']}),false);
  assert.equal(gate({...e,bouts:e.bouts.map((x,i)=>i===0?{...x,result:x.result==='win'?'loss':'win'}:x)}),false);
 }
});
