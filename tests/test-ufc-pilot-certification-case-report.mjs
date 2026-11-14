import test from 'node:test';
import assert from 'node:assert/strict';
import {comparePilot,buildPilotReport} from '../scripts/ufc-pilot-certification-case-report.mjs';
test('exact source match permits UTC one-day shift but never asserts career completeness',()=>{
 const out=comparePilot({bouts:[{date:'2025-05-17',opponent:'HyunSung Park',result:'loss'}]},
 {recentHistory:[{date:'2025-05-18',opponent:'Hyun Sung Park',result:'loss',promotion:'ufc',boutId:'1'}]});
 assert.equal(out.matchedCount,1);
 assert.equal(out.missingCount,0);
});
test('UFC-labelled feeder extra remains reviewable and excluded from verified official count',()=>{
 const out=comparePilot({bouts:[{date:'2023-12-09',opponent:'Shannon Ross',result:'win'}]},
 {recentHistory:[{date:'2023-12-09',opponent:'Shannon Ross',result:'win',promotion:'ufc',boutId:'2'},
 {date:'2022-06-10',opponent:'Someone',result:'win',promotion:'ufc',boutId:'3'}]},
 {'3':{event:'Road to UFC: Quarterfinals'}});
 assert.equal(out.matchedCount,1);
 assert.equal(out.extraCount,1);
 assert.equal(out.extra[0].scope,'feeder_excluded_from_ufc_career');
});
test('matching all minimum biography rows cannot certify a full career',()=>{
 const slugs=Array.from({length:780},(_,i)=>'other-'+i)
  .concat(['bruno-gustavo-da-silva','carlos-hernandez-7','park-hyun-sung']);
 const source={rosterAsOf:'2026-11-14',fighters:Object.fromEntries(slugs.slice(-3).map(slug=>
  [slug,{sourceUrl:'https://www.ufc.com/athlete/test',fighterName:slug,
   bouts:[{date:'2025-01-01',opponent:'Other',result:'win'}]}]))};
 const profiles=Object.fromEntries(slugs.slice(-3).map(slug=>
  [slug,{recentHistory:[{date:'2025-01-01',opponent:'Other',result:'win',promotion:'ufc',boutId:'9'}]}]));
 const report=buildPilotReport({status:'approved',rosterAsOf:'2026-11-14',approvedFighters:slugs},
  source,{profiles},{bouts:{}});
 assert.equal(report.summary.matchedSaved,3);
 assert.equal(report.summary.newlyCertified,0);
 assert.match(report.status,/not_full_career_certification/);
});

test('UFC-official Korean surname order alias matches exact opponent and result, not homonyms',()=>{
 const saved={recentHistory:[{date:'2025-10-18',opponent:'Park Hyun-sung',result:'win',promotion:'ufc',boutId:'83254'}]};
 const exact=comparePilot({bouts:[{date:'2025-10-18',opponent:'HyunSung Park',result:'win'}]},saved);
 assert.equal(exact.matchedCount,1);
 assert.equal(exact.missingCount,0);
 assert.equal(exact.extraCount,0);
 const incorrect=comparePilot({bouts:[{date:'2025-10-18',opponent:'HyunSung Park',result:'loss'}]},saved);
 assert.equal(incorrect.missingCount,1,'Opposite outcome cannot be matched by name alias');
 const homonym=comparePilot({bouts:[{date:'2025-10-18',opponent:'HyunSung Pak',result:'win'}]},saved);
 assert.equal(homonym.missingCount,1,'Different surname cannot be silently matched');
});

test('only exact UFC Vancouver bout permits Bruno Gustavo da Silva abbreviation',()=>{
 const source={bouts:[{date:'2025-10-18',opponent:'Bruno Silva',result:'loss'}]};
 const row=(id)=>({date:'2025-10-18',opponent:'Bruno Gustavo da Silva',result:'loss',
  promotion:'ufc',boutId:String(id)});
 const verified=comparePilot(source,{recentHistory:[row('83254')]});
 assert.equal(verified.matchedCount,1);
 assert.equal(verified.extraCount,0);
 const unrelated=comparePilot(source,{recentHistory:[row('99999')]});
 assert.equal(unrelated.missingCount,1,'Different native ID must not inherit potentially homonymous alias');
 assert.equal(unrelated.extraCount,1);
});

test('Park same dated official fight under 38150 and 83254 is a native identity exception',()=>{
 const source={bouts:[{date:'2025-10-18',opponent:'Bruno Silva',result:'loss'}]};
 const profile={recentHistory:[
  {date:'2025-10-18',opponent:'Bruno Silva',result:'loss',promotion:'ufc',boutId:'38150'},
  {date:'2025-10-18',opponent:'Bruno Gustavo da Silva',result:'loss',promotion:'ufc',boutId:'83254'}
 ]};
 const result=comparePilot(source,profile,{'83254':{event:'UFC Vancouver: De Ridder vs Hernandez'}});
 assert.equal(result.matchedCount,1);
 assert.equal(result.missingCount,0);
 assert.equal(result.extraCount,1);
 assert.equal(result.extra[0].scope,'duplicate_native_fight_identity_review');
 assert.equal(result.extra[0].nativeBoutId,'83254');
 assert.equal(result.extra[0].matchedAlternateNativeBoutId,'38150');
});

test('missing official bout reports cached native ID with contradictory result but does not match',()=>{
 const official={bouts:[{date:'2026-06-06',opponent:'Edgar Chairez',result:'loss'}]};
 const saved={recentHistory:[{date:'2026-06-06',opponent:'Edgar Chairez',result:'win',
  promotion:'ufc',boutId:'cached-7'}]};
 const out=comparePilot(official,saved);
 assert.equal(out.matchedCount,0);
 assert.equal(out.missingCount,1);
 assert.deepEqual(out.missing[0].savedCandidates,[{
  nativeBoutId:'cached-7',savedDate:'2026-06-06',savedResult:'win',
  reviewReason:'result_conflict'
 }]);
});
