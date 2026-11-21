import test from 'node:test';
import assert from 'node:assert/strict';
import {STAGES,newCache,endpoint,combinePage,fillStage,stageStatus,nextStage,chooseWork,unrankedDebutEvidence,terminalHistoryEvidence} from '../scripts/sumo-backfill-190.mjs';

const sample={sourceId:28,officialNskId:3616,sumoDbId:12226,shikonaEn:'Ura'};
test('free Sumo API history endpoints use explicit source ID and stable pagination',()=>{
  assert.equal(STAGES.length,6);
  assert.equal(endpoint(28,'profile'),'https://www.sumo-api.com/api/rikishi/28');
  assert.equal(endpoint(28,'profile').includes('?'),false);
  assert.match(endpoint(28,'measurements',200),/measurements\?rikishiId=28&limit=200&skip=200/);
  assert.match(endpoint(28,'ranks',0),/ranks\?rikishiId=28/);
  assert.match(endpoint(28,'shikonas',0),/shikonas\?rikishiId=28/);
  assert.match(endpoint(28,'matches',200),/matches\?limit=200&skip=200/);
  assert.throws(()=>endpoint(0,'ranks'),/Invalid rikishi/);
});
test('no result is marked collected until every stage and page is complete',async()=>{
  const cache=newCache(sample);
  assert.equal(stageStatus(cache),'partial');
  await fillStage(cache,'profile',async()=>({id:28,nskId:3616,shikonaEn:'Ura',rankHistory:[],measurementHistory:[]}));
  await fillStage(cache,'stats',async()=>({rikishi_id:28,totalMatches:100,totalWins:80}));
  combinePage(cache,'measurements',{rikishi_id:28,measurements:[{id:'202103-28',rikishiId:28,bashoId:'202103',weight:136,height:175}],total:1,has_more:false},28);
  combinePage(cache,'ranks',{rikishi_id:28,ranks:[{id:'202611-28',rikishiId:28,rank:'Maegashira 2 East',bashoId:'202611'}],total:1,has_more:false},28);
  combinePage(cache,'shikonas',{rikishi_id:28,shikonas:[],total:0,has_more:false},28);
  combinePage(cache,'matches',{rikishi_id:28,matches:[{id:'fight1',winnerId:28},{id:'fight2',winnerId:1}],total:3,has_more:true},28);
  assert.equal(cache.stages.matches.complete,false);
  assert.equal(cache.stages.matches.skip,2);
  assert.equal(stageStatus(cache),'partial');
  combinePage(cache,'matches',{rikishi_id:28,matches:[{id:'fight3',winnerId:28}],total:3,has_more:false},28);
  assert.equal(stageStatus(cache),'collected-not-certified');
  assert.equal(cache.certification,'not-started');
  assert.equal(cache.data.matches.length,3);
});
test('untrustworthy/mismatched source pages never pass completion',()=>{
  const doc=newCache(sample);
  assert.throws(()=>combinePage(doc,'ranks',{ranks:[],total:10,has_more:false},28),/Truncated/);
  assert.throws(()=>combinePage(doc,'ranks',{rikishi_id:27,ranks:[],total:0,has_more:false},28),/Mismatched/);
  assert.throws(()=>combinePage(doc,'measurements',{measurements:[{rikishiId:99}],total:1,has_more:false},28),/Cross-wrestler/);
  assert.throws(()=>combinePage(doc,'matches',{matches:[]},28),/Missing pagination/);
});
test('invalid official identity blocks a profile from being accepted',async()=>{
  const doc=newCache(sample);
  await assert.rejects(()=>fillStage(doc,'profile',async()=>({id:28,nskId:9999})),/JSA identity mismatch/);
  assert.equal(doc.stages.profile.complete,false);
  const another=newCache(sample);another.stages.stats.attempts=3;
  assert.equal(stageStatus(another),'partial','other stages stay eligible after one endpoint fails');
  assert.equal(nextStage(another),'profile');
  for(const name of STAGES)another.stages[name].attempts=3;
  assert.equal(nextStage(another),null);
  assert.equal(stageStatus(another),'exception');
});

test('rejects duplicate source records atomically and never advances page offset',()=>{
  const doc=newCache(sample);
  assert.throws(()=>combinePage(doc,'ranks',{
    rikishi_id:28,ranks:[
      {id:'202611-28',rikishiId:28,bashoId:'202611',rank:'Maegashira 2 East'},
      {id:'202611-28',rikishiId:28,bashoId:'202611',rank:'Maegashira 2 East'}
    ],total:2,has_more:false
  },28),/Duplicate\/missing/);
  assert.equal(doc.data.ranks.length,0);
  assert.equal(doc.stages.ranks.skip,0);
  assert.equal(doc.stages.ranks.complete,false);
});
test('failing source stage cannot hide other six-stage collection opportunities',()=>{
  const doc=newCache(sample);
  doc.stages.profile.attempts=3;
  assert.equal(nextStage(doc),'stats');
  assert.equal(stageStatus(doc),'partial');
  doc.stages.stats.complete=true;
  assert.equal(nextStage(doc),'measurements');
});

test('real provider shape: historical changes arrive as raw arrays',()=>{
  const d=newCache(sample);
  combinePage(d,'measurements',[
    {id:'202103-28',rikishiId:28,bashoId:'202103',height:173,weight:136},
    {id:'202611-28',rikishiId:28,bashoId:'202611',height:173,weight:138}
  ],28);
  combinePage(d,'ranks',[{id:'202611-28',rikishiId:28,bashoId:'202611',rank:'Maegashira 2 East'}],28);
  combinePage(d,'shikonas',[{id:'201503-28',rikishiId:28,bashoId:'201503',shikonaEn:'Ura'}],28);
  assert.deepEqual(d.data.measurements.map(x=>x.weight),[136,138]);
  assert.equal(d.stages.measurements.complete,true);
  assert.equal(d.stages.ranks.complete,true);
  assert.equal(d.stages.shikonas.complete,true);
  assert.equal(d.stages.measurements.responseShape,'direct-array');
});
test('real provider shape: fighter match pages contain records, not matches',()=>{
  const d=newCache(sample);
  combinePage(d,'matches',{limit:2,skip:0,total:3,records:[
    {bashoId:'202611',day:1,eastId:28,westId:10,matchNo:5},
    {bashoId:'202611',day:2,eastId:28,westId:12,matchNo:6}
  ]},28);
  assert.equal(d.stages.matches.complete,false);
  assert.equal(d.stages.matches.skip,2);
  combinePage(d,'matches',{limit:2,skip:2,total:3,records:[
    {bashoId:'202611',day:3,eastId:28,westId:11,matchNo:7}
  ]},28);
  assert.equal(d.stages.matches.complete,true);
  assert.equal(d.data.matches.length,3);
});
test('provider ignoring the historical array skip cannot advance the cursor',()=>{
  const d=newCache(sample);
  d.stages.ranks.skip=200;
  d.data.ranks=Array.from({length:200},(_,i)=>({id:'old'+i,rikishiId:28}));
  assert.throws(()=>combinePage(d,'ranks',d.data.ranks.slice(),28),/Repeated/);
  assert.equal(d.stages.ranks.skip,200);
});

test('one coordinated quick/history scheduler selects only missing stages',()=>{
  const ura={...sample};
  const asan={sourceId:2,officialNskId:3682,shikonaEn:'Asanoyama'};
  const docs=new Map([[28,newCache(ura)],[2,newCache(asan)]]);
  assert.equal(chooseWork([ura,asan],docs,'quick').stage,'profile');
  for(const s of ['profile','stats','measurements','ranks'])docs.get(28).stages[s].complete=true;
  assert.equal(chooseWork([ura,asan],docs,'quick').stage,'shikonas');
  assert.equal(chooseWork([ura,asan],docs,'history').w.sourceId,28);
  docs.get(28).stages.shikonas.complete=true;
  docs.get(28).stages.matches.skip=400;
  docs.get(2).stages.profile.complete=true;
  docs.get(2).stages.stats.complete=true;
  assert.equal(chooseWork([ura,asan],docs,'history').w.sourceId,28,
    'resume partially fetched bout pages rather than starting another career');
  docs.get(28).stages.matches.complete=true;
  assert.equal(chooseWork([ura,asan],docs,'history').w.sourceId,2,
    'completed histories never request duplicate pages');
});
test('one failing endpoint does not block another fighter or stage',()=>{
  const ura={...sample},next={sourceId:2,officialNskId:3682,shikonaEn:'Asanoyama'};
  const docs=new Map([[28,newCache(ura)],[2,newCache(next)]]);
  const attempted=new Set(['28:profile']);
  assert.equal(chooseWork([ura,next],docs,'quick',attempted).w.sourceId,2);
  docs.get(28).stages.profile.attempts=3;
  assert.equal(chooseWork([ura,next],docs,'quick').w.sourceId,2,
    'another wrestler still progresses when Ura has a blocked source stage');
  for(const s of STAGES.filter(x=>x!=='matches'))docs.get(2).stages[s].complete=true;
  assert.equal(chooseWork([ura,next],docs,'quick').stage,'stats',
    'remaining Ura stages are still eligible after his profile request fails');
});
test('when the quick stage is done it never needs a repeat API request',()=>{
  const docs=new Map([[28,newCache(sample)]]);
  for(const s of STAGES.filter(x=>x!=='matches'))docs.get(28).stages[s].complete=true;
  assert.equal(chooseWork([sample],docs,'quick'),null);
  docs.get(28).stages.matches.complete=true;
  assert.equal(chooseWork([sample],docs,'history'),null);
});

test('100-row historical rank cap does not silently truncate long careers',()=>{
  const d=newCache(sample);
  d.data.stats={basho:101};
  const first=Array.from({length:100},(_,i)=>({
    id:'rank'+i,rikishiId:28,bashoId:'202001',
    rank:i===0?'Mae-zumo':'Maegashira 2 East'
  }));
  combinePage(d,'ranks',first,28);
  assert.equal(d.stages.ranks.complete,false);
  assert.equal(d.stages.ranks.skip,100);
  assert.equal(endpoint(28,'ranks',d.stages.ranks.skip).includes('skip=100'),true);
  combinePage(d,'ranks',[
    {id:'rank100',rikishiId:28,bashoId:'202003',rank:'Maegashira 3 East'},
    {id:'rank101',rikishiId:28,bashoId:'202005',rank:'Maegashira 4 East'}
  ],28);
  assert.equal(d.stages.ranks.complete,true);
  assert.equal(d.data.ranks.length,102);
  assert.equal(d.data.ranks.filter(x=>x.rank!=='Mae-zumo').length,101);
});

test('null final match page closes only when all saved regular bouts and official source W-L agree',()=>{
  const d=newCache(sample);
  d.data.profile={id:28,debut:'201503'};
  d.data.stats={rikishi_id:28,totalMatches:2,totalWins:1,totalLosses:1};
  d.data.matches=[
    {bashoId:'202611',day:1,matchNo:1,eastId:28,westId:9,winnerId:28,division:'Makuuchi'},
    {bashoId:'202611',day:2,matchNo:2,eastId:28,westId:9,winnerId:9,division:'Makuuchi'},
    {bashoId:'201503',day:2,matchNo:3,eastId:28,westId:9,winnerId:28,division:'Mae-zumo'}
  ];
  d.stages.matches.skip=3;
  combinePage(d,'matches',{limit:200,skip:0,total:0,records:null},28);
  assert.equal(d.stages.matches.complete,true);
  assert.equal(d.stages.matches.skip,3);
  assert.equal(d.data.matches.length,3);
  assert.equal(d.stages.matches.total,null);
});
test('null terminal page cannot conceal missing or inconsistent career outcomes',()=>{
  const d=newCache(sample);
  d.data.stats={totalMatches:2,totalWins:2,totalLosses:0};
  d.data.matches=[{bashoId:'202611',day:1,matchNo:1,eastId:28,westId:9,winnerId:28,division:'Makuuchi'}];
  d.stages.matches.skip=1;
  assert.throws(()=>combinePage(d,'matches',{limit:200,skip:0,total:0,records:null},28),/Null matches page|Expected matches collection/);
  assert.equal(d.stages.matches.skip,1);
  assert.equal(d.stages.matches.complete,false);
  d.data.stats={totalMatches:1,totalWins:1,totalLosses:0};
  assert.throws(()=>combinePage(d,'matches',{limit:200,skip:0,total:10,records:null},28),/Expected matches collection/);
  assert.equal(d.stages.matches.skip,1);
});

import {readFileSync} from 'node:fs';

test('missing debut banzuke is explicitly evidenced, never invented',()=>{
 const d=JSON.parse(readFileSync(new URL('../data/sumo/backfill/v1/rikishi/9050.json',import.meta.url),'utf8'));
 const evidence=unrankedDebutEvidence(d);
 assert.equal(evidence.bashoId,'202503');
 assert.equal(evidence.firstPublishedRankBasho,'202505');
 assert.equal(d.data.ranks.some(x=>x.bashoId==='202503'),false);
 const copy=structuredClone(d);
 copy.data.matches=copy.data.matches.filter(x=>x.bashoId!=='202503');
 assert.equal(unrankedDebutEvidence(copy),null);
});
test('null terminal page is accepted only when full source totals and debut fights agree',()=>{
 const d=JSON.parse(readFileSync(new URL('../data/sumo/backfill/v1/rikishi/113.json',import.meta.url),'utf8'));
 const evidence=terminalHistoryEvidence(d);
 assert.equal(evidence.regularBouts,391);
 assert.equal(evidence.rawRows,400);
 const clone=structuredClone(d);
 clone.data.matches=clone.data.matches.slice(0,380);
 assert.equal(terminalHistoryEvidence(clone),null);
 clone.data.matches=d.data.matches;
 clone.data.stats.totalWins++;
 assert.equal(terminalHistoryEvidence(clone),null);
});
