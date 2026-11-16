import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesRevisedOfficialCareer,evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const profile={name:'Example Athlete',ufcTimeline:{complete:false}};
const saved=[
 {date:'2026-02-10',opponent:'Opp A',promotion:'ufc',result:'win',source:'history'},
 {date:'2026-05-10',opponent:'Opp B',promotion:'ufc',result:'draw',source:'history'},
 {date:'2026-07-10',opponent:'Opp A',promotion:'ufc',result:'no_contest',source:'history'}
];
const source={sourceCoverageAttested:true,
 verificationMethod:'full_official_ufc_fight_listing_crosscheck',
 verifiedAt:'2026-11-17',fighterName:'Example Athlete',
 officialFighterUrl:'https://www.ufc.com/athlete/example-athlete',
 bouts:[
  {date:'2026-02-10',opponent:'Opp A',result:'win'},
  {date:'2026-05-11',opponent:'Opp B',result:'draw'},
  {date:'2026-07-10',opponent:'Opp A',result:'no_contest'}
 ]};
const verify=(history=saved,evidence=source)=>evaluateCareerEvidence(
 profile,history,'2026-07-10','2026-11-17',evidence,{},'2026-11-14').independentlyVerified;
test('UFC athlete attestations pass with no original numeric IDs or round metrics',()=>{
 assert.equal(matchesRevisedOfficialCareer(profile,saved,source,'2026-11-17','2026-11-14'),true);
 assert.equal(verify(),true);
});
test('draws, no-contests and rematches survive while missing/duplicated/corrupt bouts fail',()=>{
 assert.equal(verify(saved.map(x=>({...x,boutId:null}))),true);
 for(const change of [
  rows=>rows.slice(1),rows=>[...rows,rows[0]],
  rows=>rows.map((x,i)=>i===1?{...x,result:'win'}:x),
  rows=>rows.map((x,i)=>i===2?{...x,opponent:'Opp C'}:x),
  rows=>rows.map((x,i)=>i===0?{...x,date:'2026-02-13'}:x)
 ])assert.equal(verify(change(saved)),false);
});
test('semantic pathway fails closed on stale, incomplete, unverified or off-site sources',()=>{
 for(const change of [
  x=>({...x,sourceCoverageAttested:false}),
  x=>({...x,bouts:x.bouts.slice(1)}),
  x=>({...x,bouts:[x.bouts[0],x.bouts[0],x.bouts[2]]}),
  x=>({...x,verifiedAt:'2026-11-13'}),
  x=>({...x,fighterName:'Different person'}),
  x=>({...x,officialFighterUrl:'https://example.test/fighter'}),
  x=>({...x,bouts:x.bouts.map((b,i)=>i===2?{...b,result:'loss'}:b)})
 ])assert.equal(verify(saved,change(source)),false);
});
