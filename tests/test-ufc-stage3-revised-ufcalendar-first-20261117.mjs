import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesRevisedOfficialCareer,evaluateCareerEvidence,sharedOfficialUfcIdentitySlugs} from '../scripts/ufc-36-month-stage3-progress.mjs';
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

test('UFCalendar-first cannot override unresolved native fighter identity collisions',()=>{
 const clean={...profile,ufcTimeline:{...profile.ufcTimeline,conflictingNativeFightIds:0}};
 const conflicted={...clean,ufcTimeline:{...clean.ufcTimeline,conflictingNativeFightIds:2}};
 const aliasConflict={...clean,ufcHistoryIdConflicts:[{reason:'two athletes share source identity'}]};
 const args=p=>evaluateCareerEvidence(p,saved,'2026-07-10','2026-11-17',
   {...source,certificationStandard:'ufcalendar_first'}, {},'2026-11-14').independentlyVerified;
 assert.equal(args(clean),true);
 assert.equal(args(conflicted),false);
 assert.equal(args(aliasConflict),false);
});

test('semantic attestation rejects non-UFC, cancelled and unverified feeder rows',()=>{
 const change=(index,patch)=>saved.map((row,i)=>i===index?{...row,...patch}:row);
 assert.equal(verify(change(0,{promotion:'pfl'})),false);
 assert.equal(verify(change(0,{status:'cancelled'})),false);
 assert.equal(verify(change(0,{event:'Road to UFC qualifiers'})),false);
 const official={...source,bouts:source.bouts.map((b,i)=>i===0?
   {...b,event:'Road to UFC qualifiers'}:b)};
 assert.equal(verify(change(0,{event:'Road to UFC qualifiers'}),official),false);
 const attested={...official,bouts:official.bouts.map((b,i)=>i===0?
   {...b,independentlyOfficial:true,officialUfcSourceUrl:'https://www.ufc.com/news/official-finale'}:b)};
 assert.equal(verify(change(0,{event:'Road to UFC qualifiers'}),attested),true);
});

test('full-cohort official URL identity collisions block both aliases, not just the newer proof',()=>{
 const registry={
  'hyunsung-park':{officialFighterUrl:'https://www.ufc.com/athlete/hyunsung-park'},
  'park-hyun-sung':{officialFighterUrl:'https://www.ufc.com/athlete/hyunsung-park/'},
  'carlos-hernandez':{officialFighterUrl:'https://www.ufc.com/athlete/carlos-hernandez'},
  'carlos-hernandez-7':{officialFighterUrl:'https://www.ufc.com/athlete/carlos-hernandez'},
  'unrelated':{officialFighterUrl:'https://www.ufc.com/athlete/unrelated'}
 };
 const roster=Object.keys(registry);
 assert.deepEqual([...sharedOfficialUfcIdentitySlugs(roster,registry)].sort(),
  ['carlos-hernandez','carlos-hernandez-7','hyunsung-park','park-hyun-sung'].sort());
 assert.equal(sharedOfficialUfcIdentitySlugs(['unrelated'],registry).size,0);
 assert.equal(sharedOfficialUfcIdentitySlugs(['hyunsung-park','unrelated'],registry).size,0);
});

test('Paul Craig cached 21 UFC contests match attested complete career, including Bellato NC and Rua draw',()=>{
 const research=JSON.parse(readFileSync(new URL('../data/ufcalendar-fighter-research.json',import.meta.url)));
 const registry=JSON.parse(readFileSync(new URL('../data/ufc-independent-full-career-verification.json',import.meta.url)));
 const athlete=research.profiles['paul-craig'];
 const attestation=registry.fighters['paul-craig'];
 const officialRows=athlete.recentHistory.filter(row=>row.promotion==='ufc');
 assert.equal(officialRows.length,21);
 assert.equal(attestation.bouts.length,21);
 assert.equal(officialRows.filter(row=>row.result==='no_contest').length,1);
 assert.equal(officialRows.filter(row=>row.result==='draw').length,1);
 assert.equal(matchesRevisedOfficialCareer(athlete,officialRows,attestation,'2026-11-17','2026-11-14'),true);
 for(const omitted of [0,1,12,20]){
  assert.equal(matchesRevisedOfficialCareer(athlete,
   officialRows.filter((_,i)=>i!==omitted),attestation,'2026-11-17','2026-11-14'),false);
 }
 assert.equal(matchesRevisedOfficialCareer(athlete,
  [...officialRows,athlete.recentHistory.find(row=>row.opponent==='Luis Henrique da Silva')],
  attestation,'2026-11-17','2026-11-14'),false);
});
