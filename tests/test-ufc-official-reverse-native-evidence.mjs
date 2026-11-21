import test from 'node:test';
import assert from 'node:assert/strict';
import {auditOfficialReverseEvidence} from '../scripts/audit-ufc-official-reverse-native-evidence.mjs';
const pilot='bruno-gustavo-da-silva', opponent='david-dvorak';
const approved=[pilot,opponent,...Array.from({length:781},(_,i)=>'other-'+i)];
const approval={schema:1,scope:'ufc-36-month-roster',status:'approved',rosterAsOf:'2026-11-14',approvedFighters:approved};
const source={scope:'ufc-official-career-bout-inventory',rosterAsOf:'2026-11-14',
 fighters:{[pilot]:{fighterName:'Bruno Gustavo da Silva',sourceUrl:'https://www.ufc.com/athlete/bruno-silva',
  bouts:[{date:'2020-03-14',opponent:'David Dvorak',result:'loss'}]}}};
const reverse={profiles:{[pilot]:{name:'Bruno Gustavo da Silva',recentHistory:[]},
 [opponent]:{name:'David Dvorak',recentHistory:[{date:'2020-03-14',opponent:'Bruno Silva',
  promotion:'ufc',result:'win',boutId:'701'}]}}};
const native={bouts:{'701':{org:'ufc',event:'UFC Brasilia',eventDate:'2020-03-14',
 a:{name:'Bruno Silva',id:'87'},b:{name:'David Dvorak',id:'22'},
 status:'completed',result:{winnerId:'22'}}}};
test('recover candidate only: reciprocal UFC opponent archive plus native date/corner/outcome',()=>{
 const r=auditOfficialReverseEvidence(source,reverse,native,approval);
 assert.equal(r.summary.missingOfficialRows,1);
 assert.equal(r.summary.missingRowsWithArchivedCandidates,1);
 assert.equal(r.summary.independentlyCertifiedFullCareers,0);
 assert.equal(r.missing[0].candidates[0].nativeFightId,'701');
 assert.deepEqual(r.missing[0].candidates[0].foundVia,
  ['reciprocal_opponent_history','indexed_native_corner_and_event']);
 assert.equal(r.missing[0].candidates[0].indexedFightAgrees,true);
 assert.equal(r.missing[0].candidates[0].verifiedResultAlsoMatches,true);
});
test('wrong winner, feeder, or wrong date never establishes native full result match',()=>{
 const badWinner={bouts:{'701':{...native.bouts['701'],result:{winnerId:'87'}}}};
 const a=auditOfficialReverseEvidence(source,reverse,badWinner,approval);
 assert.equal(a.missing[0].candidates[0].verifiedResultAlsoMatches,false);
 const feeder={bouts:{'701':{...native.bouts['701'],event:'Road to UFC'}}};
 const b=auditOfficialReverseEvidence(source,reverse,feeder,approval);
 assert.equal(b.missing[0].candidates[0].indexedFightAgrees,false);
 const wrongDay={bouts:{'701':{...native.bouts['701'],eventDate:'2020-04-14'}}};
 const c=auditOfficialReverseEvidence(source,reverse,wrongDay,approval);
 assert.equal(c.missing[0].candidates[0].indexedFightAgrees,false);
});
test('same-named Bruno Silva is never auto-assigned, and invalid roster refuses audit',()=>{
 const b=auditOfficialReverseEvidence(source,reverse,{bouts:{}},approval);
 assert.equal(b.summary.independentlyCertifiedFullCareers,0);
 assert.match(b.reviewNote,/Ambiguous Bruno Silva homonym/);
 assert.throws(()=>auditOfficialReverseEvidence(source,reverse,native,
  {...approval,approvedFighters:approved.slice(1)}),/Approved same-snapshot/);
});
test('2025 Park name-order is a known matched source fight only for source-correlated ID 83254',()=>{
 const inv={...source,fighters:{[pilot]:{...source.fighters[pilot],
  bouts:[{date:'2025-10-18',opponent:'HyunSung Park',result:'win'}]}}};
 const r=auditOfficialReverseEvidence(inv,{profiles:{[pilot]:{recentHistory:[{
   date:'2025-10-18',opponent:'Park Hyun-sung',promotion:'ufc',result:'win',boutId:'83254'}]}}},{bouts:{}},approval);
 assert.equal(r.summary.alreadyLinkedOfficialRows,1);
 assert.equal(r.summary.missingOfficialRows,0);
});
