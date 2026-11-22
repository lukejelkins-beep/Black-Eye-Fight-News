import test from 'node:test';
import assert from 'node:assert/strict';
import {careerPoints,careerGraphs} from '../assets/sumo-career.mjs';

const w={sourceId:28,officialNskId:3617,weightKg:145,currentRank:'Maegashira 5 East'};
const history={
 bySourceId:{28:{sumoApiId:28,officialNskId:3617,
   weight:[{basho:'201503',kg:113},{basho:'202405',kg:142}],
   rank:[{basho:'201503',rank:'Jonokuchi 15 West'},
    {basho:'202405',rank:'Maegashira 5 West'}],
   rankSource:'https://sumodb.sumogames.de/Rikishi.aspx?r=12226',
   rankCrosscheck:'https://www.sumo.or.jp/EnSumoDataRikishi/profile/3617/'}}};
test('current listed weight is NOT a historical tournament weigh-in',()=>{
 const points=careerPoints(w,structuredClone(history),'202611','202609','Maegashira 9 West');
 assert.deepEqual(points.weight.map(x=>x.basho),['201503','202405']);
 assert.deepEqual(points.weight.map(x=>x.kg),[113,142]);
 assert.equal(points.currentListedWeightKg,145);
 assert.equal(points.ranks.at(-1).basho,'202611');
});
test('without dated source weights, graph has no invented dots and labels current weight separately',()=>{
 const point=careerPoints({...w,sourceId:999},null,'202611','202609','Maegashira 9 West');
 assert.equal(point.weight.length,0);
 assert.equal(point.currentListedWeightKg,145);
 const html=careerGraphs({...w,sourceId:999},null,'202611','202609','Maegashira 9 West');
 assert.ok(html.includes('Historical weight measurements have not been sourced'));
 assert.ok(html.includes('Currently listed: 145 kg (undated)'));
 assert.ok(!html.includes('Nov 2026 — 145 kg'));
});
test('sourced dates stay unchanged, no extra present-basho dot or fabricated highest rank',()=>{
 const input=structuredClone(history);
 const html=careerGraphs(w,input,'202611','202609','Maegashira 9 West');
 assert.ok(html.includes('May 2024 — 142 kg'));
 assert.ok(!html.includes('Nov 2026 — 145 kg'));
 assert.ok(html.includes('Currently listed: 145 kg (undated)'));
 assert.ok(html.includes('Highest rank: Maegashira 5 East'));
 assert.deepEqual(input,history,'source cache must be immutable');
});

test('historical banzuke rank is preserved over a contradictory current listing',()=>{
 const changed={...w,currentRank:'Maegashira 3 East'};
 const source=structuredClone(history);
 source.bySourceId['28'].rank.push({basho:'202611',rank:'Maegashira 2 East'});
 const p=careerPoints(changed,source,'202611','202609','Maegashira 9 West');
 assert.equal(p.ranks.at(-1).rank,'Maegashira 2 East');
 assert.deepEqual(p.currentRankDiscrepancy,{
  basho:'202611',recordedRank:'Maegashira 2 East',rosterRank:'Maegashira 3 East'});
 assert.match(careerGraphs(changed,source,'202611','202609','Maegashira 9 West'),/Rank review required/);
 assert.deepEqual(source.bySourceId['28'].rank.at(-1),{
  basho:'202611',rank:'Maegashira 2 East'});
});
test('rank chart names real Sumo API source and does not claim full JSA verification',()=>{
 const html=careerGraphs(w,history,'202611','202609','Maegashira 9 West');
 assert.match(html,/Sumo API historical ranks/);
 assert.match(html,/per-basho certification remains underway/);
 assert.doesNotMatch(html,/latest rank is cross-checked with/);
});

test('official current listed weight is presented separately from dated history',()=>{
 const c=structuredClone(history);
 c.bySourceId['28'].currentListedWeight={
  kg:145,datedMeasurement:false,
  source:'https://www.sumo.or.jp/EnSumoDataRikishi/profile/3616/'};
 const p=careerPoints({...w,weightKg:144.8},c,'202611','202609','Maegashira 9 West');
 assert.equal(p.currentListedWeightKg,145);
 assert.equal(p.currentListedWeightSource,'JSA current published profile');
 assert.equal(p.currentWeightApiDiscrepancy,null,'decimal source matches JSA integer display');
 assert.deepEqual(p.weight.map(x=>x.basho),['201503','202405']);
 assert.match(careerGraphs({...w,weightKg:144.8},c,'202611','202609','Maegashira 9 West'),
   /JSA currently listed: 145 kg \(undated\)/);
});
test('JSA and API current weights that disagree by a full kilogram are both shown as under review',()=>{
 const c=structuredClone(history);
 c.bySourceId['28'].currentListedWeight={
  kg:173,datedMeasurement:false,
  source:'https://www.sumo.or.jp/EnSumoDataRikishi/profile/3616/'};
 const w2={...w,weightKg:172};
 const p=careerPoints(w2,c,'202611','202609','Maegashira 9 West');
 assert.deepEqual(p.currentWeightApiDiscrepancy,{
  officialKg:173,apiKg:172,
  note:'Current measurement discrepancy pending source reconciliation'});
 const html=careerGraphs(w2,c,'202611','202609','Maegashira 9 West');
 assert.match(html,/Weight review: JSA 173 kg, Sumo API 172 kg/);
 assert.ok(!html.includes('Nov 2026 — 173 kg'));
 assert.equal(p.weight.length,2,'official current weight must not add a historical dot');
});
