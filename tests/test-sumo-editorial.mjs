import test from 'node:test';
import assert from 'node:assert/strict';
import { weightTimePositions, datedWeightObservations, editorialWeightChart, editorialRankChart,
  rankRangePoints } from '../assets/sumo-editorial-charts.mjs';
import { boutKey, mergeProfileBouts, filterAndSortOpponents, exactNamePriority } from '../assets/sumo-editorial-data.mjs';

const ura=[
 {basho:'201503',kg:113,source:'API'}, {basho:'202103',kg:136,source:'API'},
 {basho:'202205',kg:148,source:'API'}, {basho:'202305',kg:143,source:'API'},
 {basho:'202405',kg:142,source:'API'}, {basho:'202505',kg:139,source:'API'}
];
test('weights are plotted by elapsed months, not their ordinal array position',()=>{
 const positions=weightTimePositions(ura,'201503','202611');
 assert.equal(positions.length,6);
 const firstGap=positions[1].ratio-positions[0].ratio;
 const nextGap=positions[2].ratio-positions[1].ratio;
 assert.ok(Math.abs(firstGap/nextGap-(72/14))<0.00001,'2015–2021 consumes 72 months, versus 14 months after');
 assert.ok(positions.at(-1).ratio<1,'No dated measurement is dragged to the November 2026 snapshot');
 const html=editorialWeightChart(ura,{start:'201503',end:'202611'});
 assert.equal((html.match(/class="sumo-weight-point"/g)||[]).length,6);
 assert.equal((html.match(/class="sumo-weight-connector"/g)||[]).length,4,'72-month gap is visibly broken');
 assert.ok(!html.includes('138 kg'),'Undated current listing is not synthesized as a measurement');
 assert.match(html,/All 6 dated weight observations and sources/);
});
test('weight chart handles empty, one-point, two-point, and same-month conflicting values without interpolation',()=>{
 assert.match(editorialWeightChart([]),/No dated weight observations/);
 assert.equal((editorialWeightChart([{basho:'202501',kg:130}]).match(/sumo-weight-connector/g)||[]).length,0);
 const two=editorialWeightChart([{basho:'202501',kg:130},{basho:'202511',kg:131}]);
 assert.equal((two.match(/class="sumo-weight-point"/g)||[]).length,2);
 const conflicts=[{basho:'202503',kg:146,source:'A'},{basho:'202503',kg:148,source:'B'}];
 assert.equal(datedWeightObservations({weight:conflicts}).length,2,'No averaging or destructive deduplication');
 const html=editorialWeightChart(conflicts);
 assert.ok(html.includes('146 kg')&&html.includes('148 kg'));
 assert.equal((html.match(/class="sumo-weight-point"/g)||[]).length,2);
 const untouched=Object.freeze({weight:Object.freeze([Object.freeze({basho:'202503',kg:146})])});
 assert.equal(datedWeightObservations(untouched).length,1);
});
test('rank ranges and source observation counts preserve first/latest without invented missing bashos',()=>{
 const all=Array.from({length:121},(_,i)=>{
   const y=2005+Math.floor(i/6),m=1+(i%6)*2;
   return {basho:String(y)+String(m).padStart(2,'0'),rank:'Makushita '+String(i%60+1)+' East'};
 });
 const output=editorialRankChart(all,{range:'2y'});
 assert.match(output,/121 recorded rank observations/);
 assert.match(output,/All 121 recorded rank observations/);
 assert.match(output,/Nov 2025/);
 assert.equal((output.match(/class="sumo-rank-overview"/g)||[]).length,1);
 assert.equal((output.match(/class="sumo-rank-svg"/g)||[]).length,1);
 assert.ok(rankRangePoints(all,'2y').length<all.length);
 assert.equal(rankRangePoints(all,'career').length,121);
 assert.ok(!output.includes('Yokozuna</text>'),'Adaptive Makushita scale has no unused Yokozuna band');
 assert.ok(editorialRankChart(all,{fullLadder:true}).includes('Yokozuna</text>'),'Full ladder is explicit choice');
});
test('canonical bout merge gives current source authority without duplicates, padding, or zero-filling',()=>{
 const old={bashoId:'202611',day:3,opponentId:28,outcome:'loss',kimarite:null};
 const current={...old,outcome:'win',kimarite:'oshidashi'};
 const past={bashoId:'202609',day:2,opponentId:75,outcome:'loss',kimarite:null};
 const a=mergeProfileBouts([current],[old,past]);
 assert.equal(a.length,2);
 assert.strictEqual(a[0],current);
 assert.strictEqual(a[1],past);
 assert.equal(a[1].kimarite,null);
 assert.equal(boutKey(current),'202611-3-28');
 assert.deepEqual(mergeProfileBouts([],[]),[]);
});
test('opponent search remains complete, deterministic and exact directory names outrank broad hits',()=>{
 const source=Object.freeze([{id:3,name:'A',meetings:4,wins:3,losses:1},
  {id:2,name:'B',meetings:4,wins:1,losses:3},{id:1,name:'C',meetings:12,wins:6,losses:6}]);
 const ranked=filterAndSortOpponents(source,'','meetings');
 assert.deepEqual(ranked.map(x=>x.id),[1,3,2]);
 assert.deepEqual(filterAndSortOpponents(source,'','name').map(x=>x.id),[3,2,1]);
 assert.deepEqual(filterAndSortOpponents(source,'','record').map(x=>x.id),[3,1,2]);
 assert.deepEqual(filterAndSortOpponents(source,'b','meetings').map(x=>x.id),[2]);
 assert.equal(source[0].id,3,'Source list order never mutated');
 assert.equal(exactNamePriority({shikonaEn:'Ura'},'ura'),0);
 assert.equal(exactNamePriority({shikonaEn:'Other Ura',heya:'Ura'},'ura'),1);
});
