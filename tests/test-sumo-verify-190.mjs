import test from 'node:test';
import assert from 'node:assert/strict';
import {newCache,STAGES} from '../scripts/sumo-backfill-190.mjs';
import {auditRikishi,crossCheckOfficial} from '../scripts/sumo-verify-190.mjs';

const w={sourceId:28,officialNskId:3616,sumoDbId:12226,shikonaEn:'Ura',currentRank:'Maegashira 2 East'};
function complete(){
 const d=newCache(w);
 for(const stage of STAGES){d.stages[stage].complete=true;d.stages[stage].total=0;}
 d.data.profile={id:28,nskId:3616,shikonaEn:'Ura',currentRank:w.currentRank};
 d.data.stats={rikishi_id:28,totalWins:1,totalLosses:0,totalMatches:1};
 d.data.measurements=[{id:'202611-28',rikishiId:28,bashoId:'202611',height:173,weight:138}];
 d.data.ranks=[{id:'202611-28',rikishiId:28,bashoId:'202611',rank:w.currentRank}];
 d.data.shikonas=[{id:'201503-28',rikishiId:28,bashoId:'201503',shikonaEn:'Ura'}];
 d.data.matches=[{bashoId:'202611',day:1,matchNo:12,eastId:28,westId:10}];
 for(const stage of ['measurements','ranks','shikonas','matches'])d.stages[stage].total=1;
 return d;
}
test('collected, coherent Sumo history is ready only for external validation, never certified',()=>{
 const r=auditRikishi(w,complete());
 assert.equal(r.status,'source-collected-needs-independent-verification');
 assert.equal(r.readyForExternalCrosscheck,true);
 assert.deepEqual(r.errors,[]);
 assert.equal(r.stagesCompleted,6);
});
test('missing histories are not mistaken for complete profiles',()=>{
 const r=auditRikishi(w,newCache(w));
 assert.equal(r.status,'still-collecting');
 assert.equal(r.readyForExternalCrosscheck,false);
 assert.equal(auditRikishi(w,null).status,'not-attempted');
});
test('wrong official rikishi and conflicting historical records are rejected',()=>{
 const d=complete();
 d.data.profile.nskId=9999;
 d.data.measurements[0].rikishiId=1000;
 d.data.ranks.push({...d.data.ranks[0]});
 const r=auditRikishi(w,d);
 assert.equal(r.status,'source-integrity-exception');
 assert.ok(r.errors.includes('profile-official-identity'));
 assert.ok(r.errors.includes('measurements-wrong-rikishi-id'));
 assert.ok(r.errors.includes('ranks-duplicate-record'));
 assert.ok(r.errors.includes('ranks-pagination-count-mismatch'));
});
test('current profile rank drift is a warning, not fabricated failure or certification',()=>{
 const d=complete();
 d.data.profile.currentRank='Maegashira 1 East';
 const r=auditRikishi(w,d);
 assert.ok(r.warnings.includes('current-banzuke-snapshot-drift'));
 assert.equal(r.readyForExternalCrosscheck,true);
});

test('a capped first page of 200 bouts is not a complete 763-bout career',()=>{
  const d=complete();
  d.data.stats.totalMatches=763;
  const result=auditRikishi(w,d);
  assert.equal(result.readyForExternalCrosscheck,false);
  assert.ok(result.errors.includes('match-history-shortfall'));
});
test('source Mae-zumo is an authentic unranked debut status, not a malformed banzuke',()=>{
  const d=complete();
  d.data.ranks=[{id:'201503-28',rikishiId:28,bashoId:'201503',rank:'Mae-zumo'}];
  const result=auditRikishi(w,d);
  assert.equal(result.readyForExternalCrosscheck,true);
  assert.ok(!result.errors.includes('malformed-rank-value'));
});

test('independently checks JSA identity and physical measurements without certifying career',()=>{
  const d=complete();
  const evidence={sumoApiId:28,officialNskId:3616,
    officialProfileUrl:'https://www.sumo.or.jp/EnSumoDataRikishi/profile/3616/',
    officialAsOf:'2026-11 day 7',stable:'Kise',currentRank:w.currentRank,
    heightCm:173,weightKg:138,record:{wins:432,losses:330,absences:96}};
  d.data.profile.heya='Kise';d.data.profile.height=173;d.data.profile.weight=138;
  d.data.stats.totalWins=432;d.data.stats.totalLosses=331;d.data.stats.totalAbsences=96;
  const verified=crossCheckOfficial(w,d,evidence);
  assert.equal(verified.identityVerified,true);
  assert.equal(verified.measurementsVerified,true);
  assert.equal(verified.careerTotalsMatchAtSourceSnapshots,false);
  assert.match(verified.note,/result-cutoff dates/);
  assert.equal(crossCheckOfficial(w,d,{...evidence,officialNskId:9999}).identityVerified,false);
});

test('full history includes extra Mae-zumo and day-16 tie-break bouts without inflating official career totals',()=>{
  const doc=complete();
  doc.data.stats.basho=1;
  doc.data.ranks.push({id:'201503-28',bashoId:'201503',rikishiId:28,rank:'Mae-zumo'});
  doc.stages.ranks.total=2;
  doc.data.matches.push(
    {bashoId:'201503',division:'Mae-zumo',day:2,matchNo:3,eastId:28,westId:7},
    {bashoId:'202601',division:'Makushita',day:16,matchNo:2,eastId:28,westId:8});
  doc.stages.matches.total=3;
  const out=auditRikishi(w,doc);
  assert.equal(out.readyForExternalCrosscheck,true);
  assert.equal(out.counts.matches,3);
  assert.equal(out.counts.regularMatches,1);
  assert.equal(out.counts.specialMatches,2);
  assert.equal(out.counts.formalRanks,1);
});
test('formal banzuke count must reconcile to career basho count',()=>{
  const doc=complete();doc.data.stats.basho=5;
  const out=auditRikishi(w,doc);
  assert.equal(out.readyForExternalCrosscheck,false);
  assert.ok(out.errors.includes('rank-history-basho-count-mismatch'));
});
