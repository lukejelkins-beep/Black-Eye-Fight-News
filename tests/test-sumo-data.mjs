import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBanzukeRank, ordinalRank, careerPoints, careerGraphs } from '../assets/sumo-career.mjs';
import {
  bashoLabel, divisionOf, recordSummary, rankTable, leadingRikishi,
  dailyResults, currentDay, matchResult, techniqueDistribution, searchRikishi,
  banzukeFor, validMatchSamples, trackedBanzukeCohort, currentBashoMatchSample,
  originCountry, banzukeMovement, dayMatchups, verifiedHeadToHead, verifiedHighestRank, confirmedCareerHigh, announcedTorikumiMatches, verifiedDayMatchups, rankOrderedMatchups, lastCompletedBashoDay, publishedCurrentWeight
} from '../assets/sumo-data.mjs';

import { highestRecordedDivision } from '../assets/sumo-daily.mjs';
import { lookupKimarite, kimariteModalMarkup, setKimariteMediaManifest } from '../assets/sumo-kimarite-gallery.mjs';

test('technique popup ends directly after English translation for both picture and GIF examples',()=>{
  setKimariteMediaManifest({schemaVersion:1,clips:{
    yorikiri:{
      gif:'assets/sumo-kimarite/yorikiri.gif',
      clip:'assets/sumo-kimarite/yorikiri.mp4',
      rights:'NHK permission confirmed by BEFN owner',credit:'NHK WORLD-JAPAN'
    }
  }});
  for(const name of ['Yorikiri','Uwatenage']){
    const item=lookupKimarite(name),html=kimariteModalMarkup(item);
    assert.ok(item&&html.includes('class="sumo-km-modal-visual"'));
    assert.ok(html.includes('id="sumo-km-modal-title"'));
    assert.ok(html.includes(item.japanese));
    assert.ok(html.includes('<p class="sumo-km-modal-meaning">'+item.english+'</p>'));
    assert.match(html,/<p class="sumo-km-modal-meaning">[^<]+<\/p><\/div><\/section><\/div>$/);
    assert.doesNotMatch(html,/sumo-km-clip-panel|sumo-km-original-clip|sumo-km-modal-links|sumo-km-modal-pending/);
    assert.ok(html.includes('data-km-close'),'Existing close control retained');
  }
  assert.match(kimariteModalMarkup(lookupKimarite('Yorikiri')),/sumo-km-modal-gif/);
  assert.match(kimariteModalMarkup(lookupKimarite('Uwatenage')),/sumo-km-modal-still/);
});



test('career H2H prefers Makuuchi record even when older Makushita data exists',()=>{
  const result=highestRecordedDivision({
    winsByDivision:{Makushita:30,Juryo:50,Makuuchi:175},
    lossByDivision:{Makushita:19,Juryo:20,Makuuchi:63}
  });
  assert.deepEqual(result,{division:'Makuuchi',wins:175,losses:63,record:'175–63',percentage:'73.5%'});
});
test('career H2H chooses highest available division below Makuuchi',()=>{
  assert.equal(highestRecordedDivision({
    winsByDivision:{Makushita:70,Juryo:23},
    lossByDivision:{Makushita:29,Juryo:10}
  })?.division,'Juryo');
  assert.equal(highestRecordedDivision({
    winsByDivision:{Makushita:30,Sandanme:56},
    lossByDivision:{Makushita:19,Sandanme:18}
  })?.division,'Makushita');
  assert.equal(highestRecordedDivision({
    winsByDivision:{Sandanme:34,Jonidan:18},
    lossByDivision:{Sandanme:15,Jonidan:6}
  })?.division,'Sandanme');
});
test('career H2H never infers a division record from rank or missing values',()=>{
  assert.equal(highestRecordedDivision({highestRank:'Yokozuna 1 East',winsByDivision:{Makushita:12},lossByDivision:{}}),null);
  assert.equal(highestRecordedDivision({winsByDivision:{Makuuchi:0,Juryo:10},lossByDivision:{Makuuchi:0,Juryo:2}})?.division,'Juryo');
  assert.equal(highestRecordedDivision({winsByDivision:{Makuuchi:12},lossByDivision:{Makuuchi:null}}),null);
});
test('dedicated H2H selects highest sourced division without altering daily matchup division labels',()=>{
  const source=readFileSync(new URL('../assets/sumo.js',import.meta.url),'utf8');
  assert.match(source,/function comparisonGrid\(first,second,division=null\)/);
  assert.match(source,/highestRecordedDivision\(stats\)/);
  assert.match(source,/comparisonGrid\(first,second\)\+.*h2hKimaritePanel/s);
  assert.match(source,/comparisonGrid\(first,second,match\.division\|\|STATE\.matchupDivision\)/);
});

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
    assert.equal(rec.sourceUrl,'https://www.sumo.or.jp/EnSumoDataRikishi/profile/'+nsk+'/');
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

test('country flags are based on identifiable birthplace, not inferred nationality',()=>{
  assert.equal(originCountry('Mongolia, Ulaanbaatar').flag,'🇲🇳');
  assert.equal(originCountry('Ukraine, Vinnytsia Oblast').flag,'🇺🇦');
  assert.equal(originCountry('Ishikawa-ken, Tsubata').flag,'🇯🇵');
  assert.equal(originCountry('Tokyo-to, Edogawa-ku').flag,'🇯🇵');
  assert.equal(originCountry('Kazakhstan, Almaty').flag,'🇰🇿');
  assert.equal(originCountry('China, Inner Mongolia').flag,'🇨🇳');
  assert.equal(originCountry('Mars, Olympus Mons'),null);
  assert.equal(originCountry(null),null);
});
test('movement uses rank positions, not imprecise rankValue subtraction',()=>{
  const previous={
    Makuuchi:{east:[{rikishiID:10,rank:'Maegashira 1 East',rankValue:501,side:'East'}],west:[{rikishiID:11,rank:'Maegashira 1 West',rankValue:501,side:'West'}]},
    Juryo:{east:[{rikishiID:12,rank:'Juryo 1 East',rankValue:601,side:'East'}],west:[{rikishiID:13,rank:'Juryo 1 West',rankValue:601,side:'West'}]},
    Makushita:{east:[{rikishiID:14,rank:'Makushita 1 East',rankValue:701,side:'East'}],west:[{rikishiID:15,rank:'Makushita 1 West',rankValue:701,side:'West'}]}
  };
  const current={
    ...previous,
    Makuuchi:{east:[{rikishiID:11,rank:'Maegashira 1 East',rankValue:501,side:'East'}],west:[{rikishiID:10,rank:'Maegashira 1 West',rankValue:501,side:'West'}]}
  };
  assert.equal(banzukeMovement(11,current,previous).status,'up');
  assert.equal(banzukeMovement(11,current,previous).places,1);
  assert.equal(banzukeMovement(10,current,previous).status,'down');
  assert.equal(banzukeMovement(10,current,previous).places,1);
  assert.equal(banzukeMovement(14,current,previous).status,'same');
  assert.equal(banzukeMovement(10,current,{}).status,'unavailable');
});
test('only a separately published torikumi makes a future pairing official',()=>{
  const b={
    east:[{rikishiID:10,shikonaEn:'A',rankValue:100,side:'East',
      record:[{result:'win',opponentID:11,opponentShikonaEn:'B',kimarite:'yorikiri'},
        {result:'',opponentID:11,opponentShikonaEn:'B'}]}],
    west:[{rikishiID:11,shikonaEn:'B',rankValue:100,side:'West',
      record:[{result:'loss',opponentID:10,opponentShikonaEn:'A',kimarite:'yorikiri'},
        {result:'',opponentID:10,opponentShikonaEn:'A'}]}]
  };
  const official={
    date:'202611',
    torikumi:[{bashoId:'202611',division:'Makuuchi',day:2,matchNo:1,
      eastId:10,westId:11,eastShikona:'A',westShikona:'B',winnerId:0,kimarite:''}]
  };
  assert.equal(dayMatchups(b,1).length,1);
  assert.equal(dayMatchups(b,1)[0].winnerId,10);
  assert.equal(dayMatchups(b,2).length,0,'Unplayed banzuke opponent ID alone is not an announced fight');
  assert.equal(lastCompletedBashoDay(b),1);
  const options={bashoId:'202611',division:'Makuuchi',day:2};
  const scheduled=announcedTorikumiMatches(official,options);
  assert.equal(scheduled.length,1);
  assert.equal(scheduled[0].finished,false);
  assert.equal(scheduled[0].winnerId,null);
  assert.equal(verifiedDayMatchups(b,official,options).length,1);
  assert.equal(verifiedDayMatchups(b,null,options).length,0);
  assert.equal(announcedTorikumiMatches(official,{...options,bashoId:'202609'}).length,0);
  assert.equal(announcedTorikumiMatches(official,{...options,day:9}).length,0);
});
test('career-high and pair H2H are withheld without explicit trusted values',()=>{
  assert.equal(verifiedHighestRank({currentRank:'Yokozuna 1 East'}),null);
  assert.equal(verifiedHighestRank({highestRank:'Ozeki 1 East'}),'Ozeki 1 East');
  assert.deepEqual(verifiedHeadToHead({rikishiId:10,opponentId:11,rikishiWins:3,opponentWins:2},10,11),
    {wins:3,losses:2,total:5,source:'sumo-api head-to-head'});
  assert.equal(verifiedHeadToHead({rikishiId:12,opponentId:11,rikishiWins:3,opponentWins:2},10,11),null);
  assert.equal(verifiedHeadToHead({rikishiId:10,opponentId:11,matches:[]},10,11),null);
});
test('all 190 current source origins have a valid country flag',()=>{
  const roster=JSON.parse(readFileSync(new URL('../data/sumo/rikishi-index.json',import.meta.url),'utf8'));
  const unknown=roster.rikishi.filter(w=>!originCountry(w.birthplace));
  assert.deepEqual(unknown.map(x=>x.shikonaEn),[]);
});

test('a verified current or prior Yokozuna is a provable highest rank, but others are not inferred',()=>{
  assert.deepEqual(confirmedCareerHigh({currentRank:'Yokozuna 1 East'}),
    {rank:'Yokozuna',evidence:'current-or-prior-verified-yokozuna'});
  assert.deepEqual(confirmedCareerHigh({currentRank:'Maegashira 3 West',previousRank:'Yokozuna 1 East'}),
    {rank:'Yokozuna',evidence:'current-or-prior-verified-yokozuna'});
  assert.equal(confirmedCareerHigh({currentRank:'Ozeki 1 West',previousRank:'Ozeki 1 East'}),null);
  assert.deepEqual(confirmedCareerHigh({currentRank:'Juryo 5 East',apiDetail:{highestRank:'Ozeki 1 West'}}),
    {rank:'Ozeki 1 West',evidence:'explicit-source'});
});

test('Ura career graphs show dated historical weights and all 69 published banzuke positions',()=>{
  const cached=JSON.parse(readFileSync(new URL('../data/sumo/career-history.json',import.meta.url),'utf8'));
  const ura={sourceId:28,officialNskId:3616,currentRank:'Maegashira 2 East',weightKg:138};
  const data=careerPoints(ura,cached,'202611','202609','Maegashira 9 East');
  assert.equal(data.ranks.length,69);
  assert.deepEqual(data.weight.map(p=>p.kg),[113,136,148,143,142,139]);
  assert.deepEqual(data.weight.map(p=>p.basho),['201503','202103','202205','202305','202405','202505']);
  assert.equal(data.currentListedWeightKg,138);
  assert.ok(!data.weight.some(p=>p.basho==='202611'), 'undated JSA November listing must not be plotted');
  assert.equal(data.ranks[0].basho,'201505');
  assert.equal(data.ranks[0].rank,'Jonokuchi 9 West');
  assert.equal(data.ranks.find(p=>p.basho==='201911')?.rank,'Jonidan 106 West');
  assert.equal(data.ranks.find(p=>p.basho==='202401')?.rank,'Komusubi 1 West');
  assert.equal(data.ranks.at(-1).rank,'Maegashira 2 East');
  assert.ok(!data.ranks.some(p=>p.basho==='202005'),'Cancelled May 2020 tournament cannot be invented');
  assert.equal(new Set(data.ranks.map(p=>p.basho)).size,data.ranks.length);
  const markup=careerGraphs(ura,cached,'202611','202609','Maegashira 9 East');
  assert.match(markup,/Weight history/);
  assert.match(markup,/Career rank movement/);
  assert.match(markup,/113 kg/);
  assert.match(markup,/138 kg/);
  assert.match(markup,/Historical observations remain subject to independent verification/);
  assert.match(markup,/JSA currently listed: 138 kg \(undated\)/);
  assert.match(markup,/Highest rank: Komusubi 1 West/);
});
test('rank score preserves tier, number and East-West distinction',()=>{
  assert.deepEqual(parseBanzukeRank('Jonidan 106 West'),{tier:8,place:106,side:'West'});
  assert.equal(parseBanzukeRank('Maegashira 0 East'),null);
  assert.equal(ordinalRank('Unknown 2 West'),null);
  assert.ok(ordinalRank('Komusubi 1 West')<ordinalRank('Maegashira 1 East'));
  assert.ok(ordinalRank('Maegashira 2 East')<ordinalRank('Maegashira 9 East'));
  assert.ok(ordinalRank('Maegashira 2 East')<ordinalRank('Maegashira 2 West'));
});
test('other rikishi charts never inherit Ura history or invent weights',()=>{
  const cached=JSON.parse(readFileSync(new URL('../data/sumo/career-history.json',import.meta.url),'utf8'));
  const other={sourceId:3001,officialNskId:4001,currentRank:'Juryo 3 East',weightKg:150};
  const series=careerPoints(other,cached,'202611','202609','Juryo 7 West');
  assert.equal(series.entry,null);
  assert.deepEqual(series.weight.map(p=>p.kg),[]);
  assert.equal(series.currentListedWeightKg,150);
  assert.deepEqual(series.ranks.map(p=>p.rank),['Juryo 7 West','Juryo 3 East']);
  assert.match(careerGraphs(other,cached,'202611','202609','Juryo 7 West'),/No dated historical weigh-ins are available yet/);
  const wrongId={sourceId:28,officialNskId:9999,currentRank:'Maegashira 2 East',weightKg:138};
  assert.equal(careerPoints(wrongId,cached,'202611','202609',null).ranks.length,1);
});
test('Sumo preview profiles load source-linked career cache and accessible charts',()=>{
  const html=readFileSync(new URL('../sumo.html',import.meta.url),'utf8');
  const script=readFileSync(new URL('../assets/sumo.js',import.meta.url),'utf8');
  assert.match(html,/assets\/sumo\.css\?v=20261115-career-h2h2/);
  assert.match(script,/data\/sumo\/career-history\.json/);
  assert.match(script,/careerGraphs\(w,STATE\.careerHistory/);
  assert.doesNotMatch(script,/fetch\(\s*['"]https:\/\/www\.sumo-api\.com/);
});

test('the cached upcoming tournament list must contain verified torikumi identities',()=>{
  const details=JSON.parse(readFileSync(new URL('../data/sumo/preview-details.json',import.meta.url),'utf8'));
  assert.match(details.bashoId,/^20\d{4}$/);
  // The schedule for the next day is published late, and between bashos there is none.
  // That is a normal state, not a broken dataset; it must never block a deploy.
  if(details.announcedDay==null){
    assert.ok(['next-day-torikumi-not-yet-published',undefined].includes(details.dailyStatus),'unexpected daily status '+details.dailyStatus);
    for(const division of ['Makuuchi','Juryo','Makushita'])
      assert.notEqual(details.torikumi?.[division]?.status,'available',division+' marked available with no announced day');
    return;
  }
  assert.ok(Number.isInteger(details.announcedDay)&&details.announcedDay>=1&&details.announcedDay<=15);
  for(const division of ['Makuuchi','Juryo','Makushita']){
    const source=details.torikumi?.[division];
    // Makuuchi is released first; lower divisions can lag. Unavailable is a valid, labelled
    // state for them and must never block a deploy. Makuuchi is always required.
    if(division!=='Makuuchi'&&source?.status==='unavailable'&&!source.data){
      assert.ok(source.reason,division+' unavailable without a reason');
      continue;
    }
    assert.equal(source?.status,'available',division+' torikumi missing');
    assert.ok(Array.isArray(source.data?.torikumi),division+' torikumi not an array');
    const options={division,bashoId:details.bashoId,day:details.announcedDay};
    const entries=announcedTorikumiMatches(source.data,options);
    assert.ok(entries.length>0,division+' did not confirm any announced matches');
    assert.ok(entries.length<=source.data.torikumi.length,division+' generated imaginary matches');
    assert.equal(new Set(entries.map(e=>e.key)).size,entries.length);
    for(const fight of entries){
      assert.equal(fight.sourceType,'announced-torikumi');
      assert.ok(fight.rikishiId>0&&fight.opponentId>0);
    }
  }
});

test('Sumo preview all-190 career dates stay source-labelled and uncertified',()=>{
  const data=JSON.parse(readFileSync(new URL('../data/sumo/career-history.json',import.meta.url),'utf8'));
  const ids=Object.keys(data.bySourceId||{});
  assert.equal(data.schemaVersion,1);
  assert.equal(data.cohortSize,190);
  assert.equal(ids.length,190);
  assert.equal(data.certified,false);
  assert.equal(data.productionPublished,false);
  assert.equal(data.independentAdditionalDatedWeightPoints>=300,true);
  const idsUnique=new Set(ids);
  assert.equal(idsUnique.size,190);
  let plotted=0;
  for(const id of ids){
    const p=data.bySourceId[id];
    assert.equal(Number(p.sumoApiId),Number(id));
    assert.ok(Number.isSafeInteger(Number(p.officialNskId))&&Number(p.officialNskId)>0);
    assert.equal(p.certified,false);
    assert.ok(p.rank.length>0);
    const dates=new Set();
    for(const m of p.weight){
      assert.match(m.basho,/^(18|19|20)\d{2}(01|03|05|07|09|11)$/);
      assert.ok(Number.isFinite(m.kg)&&m.kg>=45&&m.kg<=400);
      assert.equal(m.independentlyCertified,false);
      assert.match(m.source,/^https:\/\/(sumodb\.sumogames\.de|www\.sumo-api\.com)\//);
      assert.ok(!dates.has(m.basho),id+' duplicates date '+m.basho);
      dates.add(m.basho);plotted++;
    }
    if(p.currentListedWeight){
      assert.equal(p.currentListedWeight.datedMeasurement,false);
      assert.ok(!p.weight.some(m=>m.source===p.currentListedWeight.source),
        'undated JSA current-listing source cannot masquerade as a measured point');
    }
  }
  assert.equal(plotted,data.datedWeightPoints);
});

test('current measurement cards use JSA publication separately from source API measurements',()=>{
 const wrestler={sourceId:9104,officialNskId:4357,weightKg:172};
 const history={bySourceId:{9104:{sumoApiId:9104,officialNskId:4357,
   currentListedWeight:{kg:173,heightCm:197,datedMeasurement:false,
    source:'https://www.sumo.or.jp/EnSumoDataRikishi/profile/4357/'}}}};
 const current=publishedCurrentWeight(wrestler,history);
 assert.equal(current.kg,173);
 assert.equal(current.source,'JSA current listing');
 assert.equal(current.underReview,true);
 assert.equal(current.apiKg,172);
 assert.equal(current.datedWeighIn,false);
 assert.equal(current.heightCm,197);
 assert.equal(current.heightSource,'JSA current listing');
 assert.equal(current.heightUnderReview,false);
 const rounded=publishedCurrentWeight({...wrestler,weightKg:172.6},history);
 assert.equal(rounded.underReview,false,'rounded source value is compatible');
 const unknown=publishedCurrentWeight({...wrestler,officialNskId:1},history);
 assert.equal(unknown.source,'Sumo API roster listing');
 assert.equal(unknown.kg,172,'mismatched identity must not import official data');
 assert.equal(unknown.heightSource,'Sumo API roster listing');
});
test('published measurement values feed profile facts while provenance stays in research data',()=>{
  const js=readFileSync(new URL('../assets/sumo.js',import.meta.url),'utf8');
  const charts=readFileSync(new URL('../assets/sumo-editorial-charts.mjs',import.meta.url),'utf8');
  assert.match(js,/publishedCurrentWeight\(w,STATE\.careerHistory\)/);
  assert.match(js,/fact\('Weight · undated',current\.mass/);
  assert.match(charts,/datedWeightObservations\(entry\)/);
  assert.doesNotMatch(js,/Weight source\/date\/precision review unresolved/);
  assert.doesNotMatch(js,/sectionHead\('sources'/);
  assert.doesNotMatch(charts,/sumo-career-summary/);
});
test('differing official JSA height remains labelled and reviewable; cannot generate an historical weigh-in',()=>{
 const w={sourceId:8860,officialNskId:4310,heightCm:190.1,weightKg:161.6};
 const doc={bySourceId:{8860:{sumoApiId:8860,officialNskId:4310,
  currentListedWeight:{kg:162,heightCm:192,datedMeasurement:false,
    source:'https://www.sumo.or.jp/EnSumoDataRikishi/profile/4310/'}}}};
 const listed=publishedCurrentWeight(w,doc);
 assert.equal(listed.heightCm,192);
 assert.equal(listed.heightUnderReview,true);
 assert.equal(listed.apiHeightCm,190.1);
 assert.equal(listed.underReview,false);
 assert.equal(listed.datedWeighIn,false);
 const wrong={bySourceId:{8860:{...doc.bySourceId[8860],officialNskId:1111}}};
 assert.equal(publishedCurrentWeight(w,wrong).heightSource,'Sumo API roster listing');
});

test('descending banzuke presentation orders head-to-heads Yokozuna first without touching source order',()=>{
  const banzuke={
    east:[
      {rikishiID:1,rank:'Yokozuna 1 East',rankValue:1,side:'East'},
      {rikishiID:3,rank:'Ozeki 1 East',rankValue:2,side:'East'},
      {rikishiID:5,rank:'Sekiwake 1 East',rankValue:3,side:'East'},
      {rikishiID:7,rank:'Maegashira 8 East',rankValue:108,side:'East'}
    ],
    west:[
      {rikishiID:2,rank:'Yokozuna 1 West',rankValue:1,side:'West'},
      {rikishiID:4,rank:'Ozeki 1 West',rankValue:2,side:'West'},
      {rikishiID:6,rank:'Sekiwake 1 West',rankValue:3,side:'West'},
      {rikishiID:8,rank:'Maegashira 8 West',rankValue:108,side:'West'}
    ]
  };
  // Simulates API torikumi arriving from low ranks to high ranks.
  const matchups=[
    {key:'m8',rikishiId:7,opponentId:8,matchNo:1,finished:false},
    {key:'s1',rikishiId:5,opponentId:6,matchNo:2,finished:true},
    {key:'o1',rikishiId:3,opponentId:4,matchNo:3,finished:false},
    {key:'y1',rikishiId:1,opponentId:2,matchNo:4,finished:true}
  ];
  const order=rankOrderedMatchups(banzuke,matchups);
  assert.deepEqual(order.map(m=>m.key),['y1','o1','s1','m8']);
  assert.deepEqual(matchups.map(m=>m.key),['m8','s1','o1','y1'],'Original source order is unchanged');
  assert.equal(order.filter(x=>x.finished).length,2,'Both completed and scheduled results are retained');
  assert.deepEqual(rankOrderedMatchups(banzuke,[]),[]);
  assert.deepEqual(rankOrderedMatchups(banzuke,null),[]);
});
test('top five exists for each cached top-three division with sourced last bout details',()=>{
  const roster=JSON.parse(readFileSync(new URL('../data/sumo/rikishi-index.json',import.meta.url),'utf8'));
  const source=JSON.parse(readFileSync(new URL('../data/sumo/preview-details.json',import.meta.url),'utf8'));
  const tracked=new Set(roster.rikishi.map(x=>x.sourceId));
  for(const division of ['Makuuchi','Juryo','Makushita']){
    const banzuke=source.banzuke[division]?.data;
    assert.ok(banzuke,division+' banzuke is cached');
    const leaders=leadingRikishi(banzuke,5);
    assert.equal(leaders.length,5,division+' shows five leaders');
    for(const leader of leaders){
      assert.ok(tracked.has(Number(leader.rikishiID)),division+' leader belongs to the approved 190');
      const latest=currentBashoMatchSample(leader,source.bashoId)[0];
      if(latest){
        assert.ok(['win','loss'].includes(latest.outcome));
        assert.ok(Number.isInteger(latest.day)&&latest.day>=1&&latest.day<=15);
        assert.ok(typeof latest.opponent==='string'&&latest.opponent.length>0);
      }
    }
  }
});

test('Results and Matchups use one compact bout row with source-backed winner and technique links',()=>{
  const js=readFileSync(new URL('../assets/sumo.js',import.meta.url),'utf8');
  const style=readFileSync(new URL('../assets/sumo-editorial.css',import.meta.url),'utf8');
  const start=js.indexOf('function boutRowMarkup(match) {');
  const end=js.indexOf('function renderBasho() {',start);
  assert.ok(start>=0&&end>start,'A dedicated compact bout-row renderer exists');
  const renderer=js.slice(start,end);
  assert.match(renderer,/portraitFor\(w,'md',name\)/);
  assert.match(renderer,/bout-photo/);
  assert.match(renderer,/bout-foot/);
  assert.match(renderer,/techniqueMarkup\(match\.kimarite,method\)/);
  assert.match(renderer,/headToHeadUrl\(match\.rikishiId,match\.opponentId\)/);
  assert.match(renderer,/winnerIsLeft/);
  assert.match(renderer,/winnerIsRight/);
  assert.match(renderer,/winner\?e\(winner\)\+' won':'Result recorded'/);
  assert.match(renderer,/bout-compare/,'Matchup rows keep the comparison behind a toggle');
  assert.match(style,/Compact bout rows/);
  assert.match(js,/boutSections\(pairings,compactBoutRow\)/,'Results tab uses headline cards then compact rows');
  assert.match(js,/boutSections\(pairing,dailyMatchupRow\)/,'Matchups page uses headline cards then compact rows');
  assert.match(js,/function headlineBout\(/,'Top bouts render as large headline cards');
});
