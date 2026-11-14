import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bashoLabel, divisionOf, recordSummary, rankTable, leadingRikishi,
  dailyResults, currentDay, matchResult, techniqueDistribution, searchRikishi,
  banzukeFor, validMatchSamples, trackedBanzukeCohort, currentBashoMatchSample
} from '../assets/sumo-data.mjs';

const entries = {
  east:[{rikishiID:10,shikonaEn:'East One',rank:'Maegashira 1 East',rankValue:101,side:'East',
    record:[{result:'win',opponentID:11,opponentShikonaEn:'West One',kimarite:'oshidashi'},{result:'absent'}]}],
  west:[{rikishiID:11,shikonaEn:'West One',rank:'Maegashira 1 West',rankValue:101,side:'West',
    record:[{result:'loss',opponentID:10,opponentShikonaEn:'East One',kimarite:'oshidashi'},{result:'pending'}]}]
};
test('top-three eligibility preserves sanyaku and excludes lower divisions',()=>{
  assert.equal(divisionOf('Yokozuna 1 East'),'Makuuchi');
  assert.equal(divisionOf('Ozeki 1 West'),'Makuuchi');
  assert.equal(divisionOf('Komusubi 1 East'),'Makuuchi');
  assert.equal(divisionOf('Maegashira 3 East'),'Makuuchi');
  assert.equal(divisionOf('Juryo 2 West'),'Juryo');
  assert.equal(divisionOf('Makushita 60 East'),'Makushita');
  assert.equal(divisionOf('Sandanme 3 West'),'Sandanme');
  assert.equal(divisionOf('Jonidan 1 East'),'Jonidan');
});
test('recognises actual basho month and gracefully rejects invalid dates',()=>{
  assert.equal(bashoLabel('202611'),'November 2026');
  assert.equal(bashoLabel('202612'),'202612');
});
test('keeps absences and pending bouts distinct from official losses',()=>{
  assert.deepEqual(recordSummary([{result:'win'},{result:'loss'},{result:'absent'},{result:'pending'}]),{win:1,loss:1,absence:1,noBout:0,pending:1,completed:2});
});
test('deduplicates symmetric torikumi bouts and counts winners from winner ID',()=>{
  assert.equal(rankTable(entries).length,2);
  assert.equal(leadingRikishi(entries)[0].rikishiID,10);
  assert.equal(currentDay(entries),2);
  const results=dailyResults(entries,1);
  assert.equal(results.length,1);
  assert.equal(results[0].winnerId,10);
  assert.equal(results[0].kimarite,'oshidashi');
  assert.equal(dailyResults(entries,16).length,0);
});
test('treats winnerId as source of truth regardless of east or west side',()=>{
  const m={bashoId:'202611',day:7,eastId:10,westId:11,eastShikona:'A',westShikona:'B',winnerId:11,kimarite:'uwatenage'};
  assert.equal(matchResult(m,11).outcome,'win');
  assert.equal(matchResult(m,10).outcome,'loss');
  assert.equal(matchResult(m,12),null);
});
test('all-rikishi current-basho results include opponents and preserve Makushita seven-bout sequencing',()=>{
  const maku=currentBashoMatchSample(entries.east[0],'202611');
  assert.equal(maku.length,1);
  assert.equal(maku[0].opponent,'West One');
  assert.equal(maku[0].outcome,'win');
  assert.equal(maku[0].day,1);
  assert.equal(maku[0].sourceScope,'current-basho-banzuke');

  const lower={...entries.east[0],rank:'Makushita 1 East'};
  const makushita=currentBashoMatchSample(lower,'202611');
  assert.equal(makushita.length,1);
  assert.equal(makushita[0].day,1);
  assert.equal(makushita[0].boutSequence,1);
  const rest=recordSummary([{result:'win'},{result:'absent'},{result:'loss'},{result:'absent'}],'Makushita');
  assert.equal(rest.win,1);
  assert.equal(rest.loss,1);
  assert.equal(rest.absence,null);
  assert.equal(rest.noBout,2);
  const sequence=currentBashoMatchSample({...lower,record:[{result:'absent'},{result:'loss',opponentID:9},{result:'absent'},{result:'win',opponentID:11}]},'202611');
  assert.deepEqual(sequence.map(x=>[x.day,x.boutSequence,x.outcome]),[[4,2,'win'],[2,1,'loss']]);
  assert.deepEqual(currentBashoMatchSample(null,'202611'),[]);
});

test('technique distributions exclude forfeit wins and record the correct sample denominator',()=>{
  const data=[
    {winnerId:10,kimarite:'yorikiri'},
    {winnerId:10,kimarite:'yorikiri'},
    {winnerId:10,kimarite:'fusen'},
    {winnerId:11,kimarite:'uwatenage'},
    {winnerId:10,kimarite:'oshidashi'}
  ];
  const dist=techniqueDistribution(data,10);
  assert.equal(dist.sampleWins,3);
  assert.equal(dist.techniques[0].technique,'yorikiri');
  assert.equal(dist.techniques[0].percentage,66.7);
});
test('filters supported divisions, including East/West rank labels',()=>{
  const items=[{shikonaEn:'A',heya:'Test',currentRank:'Makushita 4 East'},{shikonaEn:'B',heya:'Other',currentRank:'Juryo 4 West'}];
  assert.equal(searchRikishi(items,{division:'Makushita'}).length,1);
  assert.equal(searchRikishi(items,{query:'test'}).length,1);
});
test('rejects an unavailable match sample rather than manufacturing a career',()=>{
  assert.deepEqual(validMatchSamples({matches:{status:'unavailable'}},10),[]);
  assert.equal(banzukeFor(entries,11)?.rank,'Maegashira 1 West');
});
test('authoritative roster comes from the three current banzuke lists and fails on any missing identity',()=>{
  const source=Array.from({length:6},(_,i)=>({sourceId:i+1,shikonaEn:'Name '+(i+1),currentRank:'Juryo 9 East'}));
  const bz={
    Makuuchi:{east:[{rikishiID:1,shikonaEn:'Name 1',rank:'Yokozuna 1 East'}],
      west:[{rikishiID:2,shikonaEn:'Name 2',rank:'Maegashira 1 West'}]},
    Juryo:{east:[{rikishiID:3,shikonaEn:'Name 3',rank:'Juryo 1 East'}],
      west:[{rikishiID:4,shikonaEn:'Name 4',rank:'Juryo 1 West'}]},
    Makushita:{east:[{rikishiID:5,shikonaEn:'Name 5',rank:'Makushita 1 East'}],
      west:[{rikishiID:6,shikonaEn:'Name 6',rank:'Makushita 1 West'}]}
  };
  const cohort=trackedBanzukeCohort(source,bz);
  assert.equal(cohort.count,6);
  assert.deepEqual(cohort.divisionCounts,{Makuuchi:2,Juryo:2,Makushita:2});
  assert.equal(cohort.rikishi[0].currentRank,'Yokozuna 1 East');
  assert.equal(cohort.rikishi[0].sourceReportedRank,'Juryo 9 East');
  assert.throws(()=>trackedBanzukeCohort(source.slice(0,-1),bz),/Unreconciled banzuke/);
  assert.throws(()=>trackedBanzukeCohort(source,{...bz,Makushita:undefined}),/Incomplete current banzuke/);
  const duplicate={...bz,Makushita:{...bz.Makushita,east:[{rikishiID:1,shikonaEn:'Name 1',rank:'Makushita 1 East'}]}};
  assert.throws(()=>trackedBanzukeCohort(source,duplicate),/duplicate banzuke identity/);
});

test('live API snapshot contains exactly the current top three divisions',()=>{
  const roster=JSON.parse(readFileSync(new URL('../data/sumo/rikishi-index.json',import.meta.url),'utf8'));
  const details=JSON.parse(readFileSync(new URL('../data/sumo/preview-details.json',import.meta.url),'utf8'));
  assert.deepEqual(roster.trackedDivisions,['Makuuchi','Juryo','Makushita']);
  assert.equal(roster.count,roster.rikishi.length);
  assert.equal(roster.count,Object.values(roster.divisionCounts).reduce((a,b)=>a+b,0));
  assert.equal(new Set(roster.rikishi.map(w=>w.sourceId)).size,roster.count);
  for(const w of roster.rikishi) assert.ok(roster.trackedDivisions.includes(divisionOf(w.currentRank)),w.shikonaEn);
  const expectedSourceIds=new Set();
  for(const d of roster.trackedDivisions){
    const b=details.banzuke[d];
    assert.equal(b.status,'available',d+' banzuke not available');
    assert.equal((b.data.east?.length||0)+(b.data.west?.length||0),roster.divisionCounts[d]);
    if(d==='Makushita')for(const entry of [...b.data.east,...b.data.west]){
      const stat=recordSummary(entry.record,'Makushita');
      assert.equal(stat.absence,null,'lower-division rest day cannot be a certified absence');
      assert.equal(stat.win+stat.loss+stat.noBout+stat.pending,entry.record.length);
    }
    for(const entry of [...b.data.east,...b.data.west]){
      assert.ok(!expectedSourceIds.has(entry.rikishiID),'Banzuke duplicate '+entry.rikishiID);
      expectedSourceIds.add(entry.rikishiID);
      assert.equal(roster.rikishi.find(w=>w.sourceId===entry.rikishiID)?.currentRank,entry.rank);
    }
  }
  assert.deepEqual([...expectedSourceIds].sort((a,b)=>a-b),roster.rikishi.map(w=>w.sourceId).sort((a,b)=>a-b));
  assert.equal(roster.sourceRosterCount>=roster.count,true);
  assert.equal(roster.preview,true);
  assert.equal(details.preview,true);
  assert.equal(details.bashoId,'202611');
});
test('JSA style evidence is explicit, source-linked and never applied to another rikishi',()=>{
  const roster=JSON.parse(readFileSync(new URL('../data/sumo/rikishi-index.json',import.meta.url),'utf8'));
  const style=JSON.parse(readFileSync(new URL('../data/sumo/official-style-evidence.json',import.meta.url),'utf8'));
  assert.equal(style.schemaVersion,1);
  assert.deepEqual(Object.keys(style.byNskId).sort(),['2892','3761','4227']);
  for(const [nsk,rec] of Object.entries(style.byNskId)){
    const wrestler=roster.rikishi.find(x=>x.officialNskId===Number(nsk));
    assert.ok(wrestler,'Official style lacks matching roster identity');
    assert.equal(rec.sumoApiId,wrestler.sourceId);
    assert.match(rec.sourceUrl,new RegExp('^https://www[.]sumo[.]or[.]jp/EnSumoDataRikishi/profile/'+nsk+'/
  const html=readFileSync(new URL('../sumo.html',import.meta.url),'utf8');
  const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const js=readFileSync(new URL('../assets/sumo.js',import.meta.url),'utf8');
  assert.match(html,/name="robots" content="noindex,nofollow"/);
  assert.match(html,/assets\/sumo\.js/);
  assert.match(index,/href="sumo\.html" data-nav="sumo"/);
  assert.match(index,/befn-sumo-link/);
  assert.match(js,/data\/sumo\/rikishi-index\.json/);
  assert.doesNotMatch(js,/fetch\(\s*['"]https:\/\/www\.sumo-api\.com/);
});
));
    assert.ok(rec.signature.every(v=>/^[a-z-]{2,40}$/.test(v)));
  }
  assert.deepEqual(style.byNskId['4227'].signature,['tsuki','oshi','migi-yotsu','yori']);
});

test('Sumo preview is non-deploying and links correctly to dedicated UI',()=>{
  const html=readFileSync(new URL('../sumo.html',import.meta.url),'utf8');
  const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const js=readFileSync(new URL('../assets/sumo.js',import.meta.url),'utf8');
  assert.match(html,/name="robots" content="noindex,nofollow"/);
  assert.match(html,/assets\/sumo\.js/);
  assert.match(index,/href="sumo\.html" data-nav="sumo"/);
  assert.match(index,/befn-sumo-link/);
  assert.match(js,/data\/sumo\/rikishi-index\.json/);
  assert.doesNotMatch(js,/fetch\(\s*['"]https:\/\/www\.sumo-api\.com/);
});
