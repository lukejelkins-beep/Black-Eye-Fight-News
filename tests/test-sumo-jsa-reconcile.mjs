import test from 'node:test';
import assert from 'node:assert/strict';
import {compareOfficialSpotcheck} from '../scripts/sumo-jsa-reconcile.mjs';
const official={sumoApiId:28,officialNskId:3616,name:'Ura',officialAsOf:'2026-11 day 7',officialProfileUrl:'https://www.sumo.or.jp/EnSumoDataRikishi/profile/3616/',currentRank:'Maegashira 2 East',stable:'Kise',heightCm:173,weightKg:138,record:{wins:432,losses:330,absences:96}};
const api={rikishiId:28,data:{profile:{id:28,nskId:3616,shikonaEn:'Ura',currentRank:'Maegashira 2 East',heya:'Kise',height:173,weight:138},stats:{totalWins:432,totalLosses:331,totalAbsences:96}}};
test('JSA basic fields reconcile with preserved as-of discrepancy',()=>{
  const c=compareOfficialSpotcheck(official,api);
  assert.equal(c.fieldCounts.matched,9);
  assert.equal(c.fieldCounts.discrepant,1);
  assert.deepEqual(c.fields.find(x=>x.field==='careerLosses'),{field:'careerLosses',official:330,api:331,state:'discrepancy'});
  assert.equal(c.status,'requires-reconciliation');
  assert.equal(c.careerCertified,false);
});
test('basic-field agreement is never full career certification',()=>{
  const copy=structuredClone(api);
  copy.data.stats.totalLosses=330;
  const c=compareOfficialSpotcheck(official,copy);
  assert.equal(c.status,'public-fields-agree');
  assert.equal(c.fieldCounts.matched,10);
  assert.equal(c.careerCertified,false);
});
test('missing cache evidence is not asserted as agreement',()=>{
  const c=compareOfficialSpotcheck(official,null);
  assert.equal(c.status,'incomplete-evidence');
  assert.equal(c.fieldCounts.matched,0);
  assert.equal(c.fieldCounts.discrepant,0);
});
test('spotcheck requires a source-specific official ID',()=>{
  assert.throws(()=>compareOfficialSpotcheck({...official,officialNskId:null},api),/missing valid source identity/);
  assert.throws(()=>compareOfficialSpotcheck({...official,sumoApiId:-1},api),/missing valid source identity/);
});

test('pending JSA Day 7 source cutoffs explain one-loss differences without changing records',()=>{
 const officialSource={...official};
 const source=structuredClone(api);
 source.data.matches=[{bashoId:'202611',day:7,eastId:28,westId:20,winnerId:20}];
 const cutoff={sumoApiId:28,officialNskId:3616,sourceUrl:official.officialProfileUrl,bashoId:'202611',
   officialTournamentCompletedThroughDay:6,officialDay7ResultStatus:'not yet recorded',
   apiCompletedDay:7,apiDay7Outcome:'loss',expectedDelta:{wins:0,losses:1}};
 const comparison=compareOfficialSpotcheck(officialSource,source,cutoff);
 assert.equal(comparison.status,'explained-source-cutoff');
 assert.equal(comparison.cutoffAlignment.aligned,true);
 assert.equal(comparison.fieldCounts.discrepant,1);
 assert.equal(comparison.careerCertified,false);
 assert.equal(source.data.stats.totalLosses,331);
 assert.equal(officialSource.record.losses,330);
});
test('claimed cutoff explanation cannot conceal another mismatch or wrong match outcome',()=>{
 const copy=structuredClone(api);
 copy.data.matches=[{bashoId:'202611',day:7,eastId:28,westId:20,winnerId:28}];
 const e={sumoApiId:28,officialNskId:3616,sourceUrl:official.officialProfileUrl,bashoId:'202611',
   officialTournamentCompletedThroughDay:6,officialDay7ResultStatus:'not yet recorded',
   apiCompletedDay:7,apiDay7Outcome:'loss',expectedDelta:{wins:0,losses:1}};
 const v=compareOfficialSpotcheck(official,copy,e);
 assert.equal(v.status,'requires-reconciliation');
 assert.equal(v.cutoffAlignment.aligned,false);
});
