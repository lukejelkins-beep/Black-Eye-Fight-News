import test from 'node:test';
import assert from 'node:assert/strict';
import {checkChronology,sourceBoutKey} from '../scripts/sumo-audit-h2h-chronology.mjs';

const bout=(winner,kimarite)=>({bashoId:'202611',day:3,matchNo:7,division:'Makuuchi',
  eastId:11,westId:22,winnerId:winner,
  opponentId:22,outcome:'win',kimarite,
  resultKind:kimarite===null?'technique-not-recorded':/^fusen/i.test(kimarite)?'forfeit':'kimarite',
  sourceMatchKey:'202611:3:7:11:22',officialCorrection:null});
const fighter=(id,other,meeting)=>({sourceId:id,certification:'not-started',
  status:'source-regular-bouts-reconciled-external-verification-pending',
  boutHistory:{regularBouts:1},
  headToHead:[{opponentId:other,wins:id===meeting.winnerId?1:0,
    losses:id===meeting.winnerId?0:1,regularBouts:1,
    meetings:[{...meeting,opponentId:other,outcome:id===meeting.winnerId?'win':'loss'}],
    playoffsAndTrialBouts:[],techniqueKnown:meeting.resultKind==='kimarite'?1:0,
    forfeitCount:meeting.resultKind==='forfeit'?1:0,
    techniqueMissing:meeting.resultKind==='technique-not-recorded'?1:0}]});
test('every historical meeting preserves winner, tournament day and winning technique',()=>{
  const x=bout(11,'yorikiri');
  const r=checkChronology([fighter(11,22,x),fighter(22,11,x)],[11,22]);
  assert.equal(r.uniqueSourceRegularBouts,1);
  assert.equal(r.sourceRegularBoutAppearances,2);
  assert.equal(r.techniqueCoverage.uniqueRows.known,1);
  assert.equal(r.counterpartConflicts,0);
  assert.equal(r.counterpartGaps,0);
  assert.equal(r.certified,0);
});
test('forfeits and missing kimarite are distinct from technical finishes',()=>{
  for(const [tech,key] of [['fusen','forfeits'],[null,'missing']]){
    const x=bout(11,tech),r=checkChronology([fighter(11,22,x),fighter(22,11,x)],[11,22]);
    assert.equal(r.techniqueCoverage.uniqueRows[key],1);
    assert.equal(r.techniqueCoverage.uniqueRows.known,0);
  }
});
test('cross-fighter winner/technique disagreement is exposed for reconciliation',()=>{
  const a=bout(11,'yorikiri'),b=bout(22,'oshidashi');
  const r=checkChronology([fighter(11,22,a),fighter(22,11,b)],[11,22]);
  assert.equal(r.counterpartConflicts,1);
  assert.equal(r.integrityStatus,'needs-pair-reconciliation');
});
test('a missing counterpart or incomplete H2H cannot be called certified',()=>{
  const x=bout(11,'oshidashi');
  const p=fighter(11,22,x),q=fighter(22,11,x);
  q.headToHead[0].meetings=[];
  assert.throws(()=>checkChronology([p,q],[11,22]),/Missing or invalid opponent chronology/);
  const r=checkChronology([p,{...q,headToHead:[],boutHistory:{regularBouts:0}}],[11,22]);
  assert.equal(r.counterpartGaps,1);
  assert.equal(r.certified,0);
});
test('malformed H2H source identity/date cannot pass the chronology audit',()=>{
  assert.throws(()=>sourceBoutKey({...bout(11,'oshidashi'),bashoId:'202612'}),/Invalid career H2H bout identity/);
  assert.throws(()=>sourceBoutKey({...bout(11,'oshidashi'),day:16}),/Invalid career H2H bout identity/);
});
