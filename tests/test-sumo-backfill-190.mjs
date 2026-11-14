import test from 'node:test';
import assert from 'node:assert/strict';
import {STAGES,newCache,endpoint,combinePage,fillStage,stageStatus} from '../scripts/sumo-backfill-190.mjs';

const sample={sourceId:28,officialNskId:3616,sumoDbId:12226,shikonaEn:'Ura'};
test('free Sumo API history endpoints use explicit source ID and stable pagination',()=>{
  assert.equal(STAGES.length,6);
  assert.match(endpoint(28,'profile'),/includeMeasurements=true/);
  assert.match(endpoint(28,'profile'),/includeRanks=true/);
  assert.match(endpoint(28,'profile'),/includeShikonas=true/);
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
  assert.equal(stageStatus(another),'exception');
});
