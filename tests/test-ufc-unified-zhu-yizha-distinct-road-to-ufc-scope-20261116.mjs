import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';

// Research-only candidate proofs. Full 783-person strict Stage3 CI must succeed
// at the exact current commit before either candidate may be counted.
const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json');
const evidence=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const rich=read('ufcalendar-rich-progress.json');
const expected={
 'zhu-kangjie':{
  name:'Zhu Kangjie',numeric:'59',ufcStats:'6f4ec5aa3eced219',
  official:'https://www.ufc.com/athlete/zhu-kangjie',
  bouts:[['66458','2026-05-30','Rodrigo Vera','loss','34d5ec676fb5bce3','2988','1e75e6c9de99fa76']],
  excluded:['Xie Bin','Shin Haraguchi','Tatsuya Ando'],count:1
 },
 'yizha':{
  name:'Yizha',numeric:'281',ufcStats:'3f11fd1751fa83b1',
  official:'https://www.ufc.com/athlete/yi-zha',
  bouts:[
   ['65856','2026-01-31','Kaan Ofli','loss','4c1e7e1765a5438a','171','30ad2050273d016a'],
   ['65920','2025-08-23','Westin Wilson','win','f0b7caa90faf47e5','268','754968e325d6f60d'],
   ['61112','2024-09-07','Gabriel Santos','loss','6e9876d2be2bbd02','2768','ee0b69e307c857e5'],
   ['59749','2023-02-04','JeongYeong Lee','loss','765482eb58e8db48','2785','d26394fc0e8e880a']
  ],
  excluded:['Kaiwen','SangWon Kim','Wuziazibieke Jiahefu','Koyomi Matsushima','Keisuke Sasu'],count:4
 }
};
const history=s=>profiles[s].recentHistory.filter(x=>x.promotion==='ufc'&&x.source==='native'&&
 rich.bouts[x.boutId]?.org==='ufc'&&rich.bouts[x.boutId]?.status==='completed'&&
 !/contender series|road to ufc/i.test(rich.bouts[x.boutId].event||''));
const gate=(s,p,b=rich.bouts)=>evaluateCareerEvidence(profiles[s],history(s),
 history(s).map(h=>h.date).sort().at(-1),'2026-11-15',p,b,approval.rosterAsOf).independentlyVerified;

test('frozen 783 UFC cohort and two previously deferred source identities',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(new Set(approval.approvedFighters).size,783);
 for(const slug of Object.keys(expected))assert.ok(approval.approvedFighters.includes(slug));
 assert.equal(Object.keys(expected).length,2);
});
for(const [slug,c] of Object.entries(expected)){
 test('complete pinned source, two numeric corners, dates/outcomes and positive measured rounds: '+slug,()=>{
  const p=evidence[slug],h=history(slug);
  assert.equal(p.sourceCoverageAttested,true);
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.verifiedAt,'2026-11-16');
  assert.equal(p.fighterName,c.name);
  assert.equal(p.officialFighterUrl,c.official);
  assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/'+c.ufcStats);
  assert.deepEqual(p.verifiedNumericFighterIds,[c.numeric]);
  assert.equal(p.sourceSnapshot.sourceCommit,'96adace863c0a793579cc06d27d468797545607f');
  assert.equal(p.sourceSnapshot.fightResultsBlobSha,'80258ab3d9f413cad9be13fde64beb66dd0bcfa6');
  assert.equal(p.sourceSnapshot.fighterDetailsBlobSha,'7141332f0b319edbc10d006b229050ee947e7336');
  assert.equal(p.sourceSnapshot.eventDetailsBlobSha,'24238cb71d7bec6522a77f285b530274b3c897b9');
  assert.equal(p.officialUfcCareerBoutCount,c.count);
  assert.equal(p.bouts.length,c.count);
  assert.equal(h.length,c.count);
  assert.equal(new Set(p.bouts.map(b=>b.nativeBoutId)).size,c.count);
  assert.equal(new Set(p.bouts.map(b=>b.fightUrl)).size,c.count);
  for(const [id,day,opponent,result,fightId,opponentId,eventId] of c.bouts){
   const row=p.bouts.find(x=>x.nativeBoutId===id);
   const original=rich.bouts[id];
   assert.ok(row&&original,id);
   assert.equal(row.date,day);
   assert.equal(row.opponent,opponent);
   assert.equal(row.result,result);
   assert.equal(row.fightUrl,'https://ufcstats.com/fight-details/'+fightId);
   assert.equal(row.pinnedSourceEventDate,day);
   assert.equal(row.independentEventUrl,'https://ufcstats.com/event-details/'+eventId);
   assert.equal(row.nativeFighterId,c.numeric);
   assert.equal(row.originalOpponentNumericId,opponentId);
   assert.equal(original.org,'ufc');
   assert.equal(original.status,'completed');
   assert.equal(original.a.id===c.numeric?original.b.id:original.b.id===c.numeric?original.a.id:null,opponentId);
   assert.ok(Number(rich.roundDone[id])>0,'positive original saved measured rounds required: '+id);
   assert.equal(h.filter(x=>x.boutId===id&&x.result===result).length,1,id);
   assert.ok(Math.abs(Date.parse(original.eventDate)-Date.parse(day))<=86400000,'only one-day proven UTC shift');
  }
  assert.equal(gate(slug,p),true);
 });
 test('independent exclusions are real feeder bouts, never relabelled UFC or injected as saved native bouts: '+slug,()=>{
  const p=evidence[slug];
  assert.deepEqual(p.sourceVerifiedExcludedFeederBouts.map(x=>x.opponent),c.excluded);
  assert.ok(p.sourceVerifiedExcludedFeederBouts.every(x=>/Road to UFC/i.test(x.promotion)));
  assert.ok(p.sourceVerifiedExcludedFeederBouts.every(x=>!p.bouts.some(b=>b.opponent===x.opponent)));
  assert.ok(p.bouts.every(x=>!/(Road to UFC|DWCS)/i.test(rich.bouts[x.nativeBoutId].event)));
  assert.equal(gate(slug,p),true);
 });
 test('absent, duplicate, inverted, imaginary identity and extra feeder certificate all fail closed: '+slug,()=>{
  const p=evidence[slug];
  assert.equal(gate(slug,p),true);
  const missing=structuredClone(p);missing.bouts.pop();assert.equal(gate(slug,missing),false);
  const flipped=structuredClone(p);flipped.bouts[0].result=p.bouts[0].result==='win'?'loss':'win';
  assert.equal(gate(slug,flipped),false);
  const invented=structuredClone(p);invented.verifiedNumericFighterIds=['999999'];assert.equal(gate(slug,invented),false);
  const added=structuredClone(p);added.bouts.push({...added.bouts[0],nativeBoutId:'999999',fightUrl:'https://ufcstats.com/fight-details/0000000000000000'});
  assert.equal(gate(slug,added),false);
  const wrongCorner=structuredClone(p);wrongCorner.bouts[0].nativeFighterId='999999';
  assert.equal(gate(slug,wrongCorner),false);
  if(p.bouts.length>1){
   const dup=structuredClone(p);dup.bouts[1].nativeBoutId=dup.bouts[0].nativeBoutId;assert.equal(gate(slug,dup),false);
  }
 });
}
test('Yizha 2023 Road-to-UFC Season 1 final counts only because official UFC Fight Night event actually hosted the contest',()=>{
 const row=evidence.yizha.bouts.find(x=>x.nativeBoutId==='59749');
 assert.equal(row.pinnedSourceEventDate,'2023-02-04');
 assert.equal(history('yizha').find(x=>x.boutId==='59749').date,'2023-02-05');
 assert.equal(rich.bouts['59749'].event,'UFC Fight Night: Lewis vs Spivac');
 assert.equal(evidence.yizha.independentSourceCrosschecks.includes('https://www.ufc.com/event/ufc-fight-night-february-04-2023'),true);
 assert.ok(!evidence.yizha.bouts.some(x=>x.opponent==='Kaiwen'));
});
test('Zhu same-day cancelled Ramon Taveras fight is never counted as Octagon result',()=>{
 assert.equal(rich.bouts['66105'].status,'cancelled');
 assert.equal(evidence['zhu-kangjie'].excludedCancelledUfcBouts[0].nativeBoutId,'66105');
 assert.ok(!evidence['zhu-kangjie'].bouts.some(x=>x.nativeBoutId==='66105'));
 assert.equal(evidence['zhu-kangjie'].bouts.length,1);
});
