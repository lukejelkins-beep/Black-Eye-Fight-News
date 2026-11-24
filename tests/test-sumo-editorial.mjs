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

test('distinct same-day regular, playoff and trial bouts are preserved under complete career merge',()=>{
 const regular={bashoId:'202611',day:14,opponentId:28,outcome:'win',kimarite:'yorikiri',matchNo:14};
 const another={...regular,outcome:'loss',kimarite:'uwatenage',matchNo:18};
 const playoff={...regular,eventType:'playoff',matchNo:32};
 const current={bashoId:'202611',day:14,opponentId:28,outcome:'win',kimarite:'yorikiri'};
 const result=mergeProfileBouts([current],[regular,another,playoff]);
 assert.equal(result.length,3,'One matching regular bout is replaced, others retained');
 assert.equal(result.filter(x=>x.eventType==='playoff').length,1);
 assert.ok(result.some(x=>x.matchNo===18));
 assert.ok(result.some(x=>x===current));
 assert.ok(boutKey(playoff).includes('special-playoff'));
});

test('source-recorded absence remains an A row without a fabricated opponent or zero',()=>{
 const absence={bashoId:'202611',day:4,opponentId:null,outcome:'absence',kimarite:null};
 const ordinary={bashoId:'202611',day:3,opponentId:28,outcome:'win',kimarite:'oshidashi'};
 const rows=mergeProfileBouts([ordinary,absence],[]);
 assert.equal(rows.length,2);
 assert.strictEqual(rows.find(x=>x.outcome==='absence'),absence);
 assert.ok(boutKey(absence).includes('unknown'),'Absence has no invented opponent ID');
 assert.equal(mergeProfileBouts([{...absence,outcome:'scheduled'}],[]).length,0,'Unconfirmed no-opponent future slots are not bouts');
});
