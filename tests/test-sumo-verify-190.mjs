import test from 'node:test';
import assert from 'node:assert/strict';
import {newCache,STAGES} from '../scripts/sumo-backfill-190.mjs';
import {auditRikishi,crossCheckOfficial} from '../scripts/sumo-verify-190.mjs';
import {unrankedDebutEvidence,terminalHistoryEvidence} from '../scripts/sumo-backfill-190.mjs';
import {readFileSync} from 'node:fs';

const w={sourceId:28,officialNskId:3616,sumoDbId:12226,shikonaEn:'Ura',currentRank:'Maegashira 2 East'};
function complete(){
 const d=newCache(w);
 for(const stage of STAGES){d.stages[stage].complete=true;d.stages[stage].total=0;}
 d.data.profile={id:28,nskId:3616,shikonaEn:'Ura',currentRank:w.currentRank};
 d.data.stats={rikishi_id:28,totalWins:1,totalLosses:0,totalMatches:1};
 d.data.measurements=[{id:'202611-28',rikishiId:28,bashoId:'202611',height:173,weight:138}];
 d.data.ranks=[{id:'202611-28',rikishiId:28,bashoId:'202611',rank:w.currentRank}];
 d.data.shikonas=[{id:'201503-28',rikishiId:28,bashoId:'201503',shikonaEn:'Ura'}];
 d.data.matches=[{bashoId:'202611',day:1,matchNo:12,eastId:28,westId:10,winnerId:28}];
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

test('Kirishima historic Banzuke-gai is valid nonranked status, not a fake rank',()=>{
  const d=complete();
  d.data.stats.basho=1;
  d.data.ranks=[
    {id:'201503-28',rikishiId:28,bashoId:'201503',rank:'Banzuke-gai'},
    {id:'201505-28',rikishiId:28,bashoId:'201505',rank:'Mae-zumo'},
    {id:'201507-28',rikishiId:28,bashoId:'201507',rank:'Jonokuchi 9 East'}];
  d.stages.ranks.total=3;
  const report=auditRikishi(w,d);
  assert.equal(report.readyForExternalCrosscheck,true);
  assert.equal(report.counts.formalRanks,1);
  assert.ok(!report.errors.includes('malformed-rank-value'));
  assert.ok(!report.errors.includes('rank-history-basho-count-mismatch'));
});

test('complete source histories report exact match-ledger W-L reconciliation without certification',()=>{
  const d=complete();
  const out=auditRikishi(w,d);
  assert.equal(out.boutLedger.regularRows,1);
  assert.equal(out.boutLedger.wins,1);
  assert.equal(out.boutLedger.losses,0);
  assert.equal(out.boutLedger.winDifference,0);
  assert.equal(out.boutLedger.lossDifference,0);
  assert.equal(out.boutLedger.missingWinner,0);
  assert.equal(out.careerCertified,false);
});
test('out-of-sync API totals preserve real bout records and highlight a one-loss difference',()=>{
  const d=complete();
  d.data.matches.push({bashoId:'202611',day:2,matchNo:11,eastId:28,westId:9,winnerId:9});
  d.stages.matches.total=2;
  const result=auditRikishi(w,d);
  assert.ok(result.errors.includes('career-regular-bout-count-mismatch'));
  assert.equal(result.boutLedger.regularRows,2);
  assert.equal(result.boutLedger.winDifference,0);
  assert.equal(result.boutLedger.lossDifference,1);
  assert.equal(result.boutLedger.totalDifference,1);
  assert.equal(result.readyForExternalCrosscheck,false);
  assert.equal(result.careerCertified,false);
});
test('a finished match ledger without identifiable winners never counts as verified',()=>{
  const d=complete();
  delete d.data.matches[0].winnerId;
  const out=auditRikishi(w,d);
  assert.ok(out.errors.includes('match-winner-missing'));
  assert.equal(out.boutLedger.missingWinner,1);
  assert.equal(out.readyForExternalCrosscheck,false);
});

test('documented Makushita debut is a sourced unranked tournament, never a fabricated position',()=>{
 const d=JSON.parse(readFileSync(new URL('../data/sumo/backfill/v1/rikishi/9050.json',import.meta.url),'utf8'));
 const w=JSON.parse(readFileSync(new URL('../data/sumo/rikishi-index.json',import.meta.url),'utf8')).rikishi.find(x=>x.sourceId===9050);
 d.stages.ranks.complete=true;
 d.stages.ranks.unrankedDebut=unrankedDebutEvidence(d);
 const result=auditRikishi(w,d);
 assert.equal(result.readyForExternalCrosscheck,true);
 assert.ok(result.warnings.includes('documented-unranked-debut-basho'));
 assert.equal(result.errors.length,0);
 delete d.stages.ranks.unrankedDebut;
 assert.ok(auditRikishi(w,d).errors.includes('rank-history-basho-count-mismatch'));
});
test('strict W-L and debut evidence can close terminal-null bout page without certification',()=>{
 const d=JSON.parse(readFileSync(new URL('../data/sumo/backfill/v1/rikishi/113.json',import.meta.url),'utf8'));
 const w=JSON.parse(readFileSync(new URL('../data/sumo/rikishi-index.json',import.meta.url),'utf8')).rikishi.find(x=>x.sourceId===113);
 d.stages.matches.complete=true;
 d.stages.matches.terminalEmptyPage=terminalHistoryEvidence(d);
 const result=auditRikishi(w,d);
 assert.equal(result.readyForExternalCrosscheck,true);
 assert.equal(d.certification,'not-started');
 assert.equal(result.errors.length,0);
});

test('Obara source-complete total cannot conceal a one-win/one-loss ledger conflict',()=>{
 const raw=JSON.parse(readFileSync(new URL('../data/sumo/backfill/v1/rikishi/242.json',import.meta.url),'utf8'));
 const w=JSON.parse(readFileSync(new URL('../data/sumo/rikishi-index.json',import.meta.url),'utf8')).rikishi.find(x=>x.sourceId===242);
 const v=auditRikishi(w,raw);
 assert.equal(v.boutLedger.totalDifference,0);
 assert.equal(v.boutLedger.winDifference,1);
 assert.equal(v.boutLedger.lossDifference,-1);
 assert.equal(v.readyForExternalCrosscheck,false);
 assert.ok(v.errors.includes('career-win-count-mismatch'));
 assert.ok(v.errors.includes('career-loss-count-mismatch'));
 assert.equal(v.careerCertified,false);
});
