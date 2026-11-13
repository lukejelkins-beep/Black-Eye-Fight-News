import test from "node:test";
import assert from "node:assert/strict";
import {
  UFC_V3_HEADLINE_TILES,PERFORMANCE_PERIODS,verifiedUfcBouts,
  periodOptions,preferredPeriod,selectUfcPeriod,computeUfcPeriod
} from "../scripts/ufc-performance-periods.mjs";
const fight=(id,offset=0,extra={})=>({
  boutId:String(id),date:"2026-11-"+String(12-offset).padStart(2,"0"),
  promotion:"UFC",opponent:"Opponent "+id,
  outcome:"W",method:"Decision",
  stats:{cageSec:300,metrics:{sigLanded:20,sigAbsorbed:10,
    knockdowns:0,takedowns:1,controlSec:30,subAttempts:0}},
  ...extra,
});
const sample=Array.from({length:12},(_,i)=>fight(i+1,i));
const options=n=>periodOptions(sample.slice(0,n)).map(p=>[p.id,p.enabled]);

test("approved nine headline tiles and exactly three period choices are fixed",()=>{
  assert.deepEqual(UFC_V3_HEADLINE_TILES.map(m=>m.id),[
    "record","ko","submission","slpm","diffpm","kd15","td15","control15","sub15"
  ]);
  assert.deepEqual(PERFORMANCE_PERIODS.map(p=>p.id),["5","10","career"]);
});
test("availability at 0,1,3,4,5,9,10,11 fights; no fallback to partial ten",()=>{
  for(const n of [0,1,3,4,5,9,10,11]){
    assert.deepEqual(options(n),[
      ["5",n>=5],["10",n>=10],["career",n>=1]
    ]);
    assert.equal(preferredPeriod(sample.slice(0,n)),n===0?null:n>=5?"5":"career");
    assert.equal(selectUfcPeriod(sample.slice(0,n),"10").available,n>=10);
  }
});
test("newest five and newest ten ignore archive insertion order",()=>{
  const mixed=[...sample].reverse();
  assert.deepEqual(selectUfcPeriod(mixed,"5").bouts.map(b=>b.boutId),["1","2","3","4","5"]);
  assert.deepEqual(selectUfcPeriod(mixed,"10").bouts.map(b=>b.boutId),
    ["1","2","3","4","5","6","7","8","9","10"]);
  assert.equal(selectUfcPeriod(mixed,"career").bouts.length,12);
});
test("missing fifth-fight data never substitutes an older sixth fight",()=>{
  const fights=structuredClone(sample);
  fights[4].stats.metrics.sigLanded=null;
  fights[4].stats.metrics.sigAbsorbed=null;
  const last5=computeUfcPeriod(fights,"5");
  assert.equal(last5.bouts.length,5);
  assert.equal(last5.metrics.slpm.measuredBouts,4);
  assert.equal(last5.metrics.slpm.selectedBouts,5);
  assert.equal(last5.metrics.slpm.value,4);
  assert.equal(last5.metrics.diffpm.measuredBouts,4);
  assert.equal(computeUfcPeriod(fights,"10").metrics.slpm.measuredBouts,9);
});
test("genuine zeroes remain measured values, distinct from null",()=>{
  const fights=[fight("a",0,{stats:{cageSec:300,metrics:{
    sigLanded:0,sigAbsorbed:0,knockdowns:0,takedowns:0,controlSec:0,subAttempts:0
  }}})];
  const result=computeUfcPeriod(fights,"career");
  for(const id of ["slpm","diffpm","kd15","td15","control15","sub15"]){
    assert.equal(result.metrics[id].value,0);
    assert.equal(result.metrics[id].measuredBouts,1);
  }
});
test("measured rates aggregate totals over measured duration, not bout mean",()=>{
  const first=fight("a",0,{stats:{cageSec:60,metrics:{
    sigLanded:6,sigAbsorbed:0,knockdowns:1,takedowns:0,controlSec:20,subAttempts:0
  }}});
  const second=fight("b",1,{stats:{cageSec:540,metrics:{
    sigLanded:54,sigAbsorbed:12,knockdowns:0,takedowns:4,controlSec:200,subAttempts:2
  }}});
  const r=computeUfcPeriod([second,first],"career");
  assert.equal(r.metrics.slpm.value,6);
  assert.equal(r.metrics.diffpm.value,4.8);
  assert.equal(r.metrics.kd15.value,1.5);
  assert.equal(r.metrics.td15.value,6);
  assert.equal(r.metrics.control15.value,330);
  assert.equal(r.metrics.sub15.value,3);
});
test("decisions, knockouts, submissions and no contests retain distinct outcomes",()=>{
  const list=[
    fight("w1",0,{outcome:"W",method:"KO/TKO"}),
    fight("w2",1,{outcome:"W",method:"Submission R2"}),
    fight("w3",2,{outcome:"W",method:null}),
    fight("l",3,{outcome:"L",method:"Decision"}),
    fight("d",4,{outcome:"D",method:"Draw"}),
    fight("nc",5,{outcome:"NC",method:"No contest"}),
  ];
  const r=computeUfcPeriod(list,"career");
  assert.deepEqual(r.record,{wins:3,losses:1,draws:1,noContests:1,display:"3-1-1"});
  assert.equal(r.metrics.ko.value,1);
  assert.equal(r.metrics.submission.value,1);
  assert.equal(r.metrics.ko.measuredBouts,4);
  assert.equal(r.metrics.slpm.measuredBouts,5,"NC has no leaderboard performance denominator");
});
test("duplicate UFC IDs, non-UFC fights and unverified results cannot inflate samples",()=>{
  const list=[sample[0],sample[0],fight("x",2,{promotion:"PFL"}),
    fight("y",3,{outcome:"unknown"}),fight("",4),...sample.slice(1,5)];
  assert.equal(verifiedUfcBouts(list).length,5);
  assert.equal(selectUfcPeriod(list,"5").available,true);
  assert.equal(selectUfcPeriod(list,"10").available,false);
});
test("careers with fewer than five fights still provide UFC career stats",()=>{
  const d=computeUfcPeriod(sample.slice(0,3),"career");
  assert.equal(d.record.display,"3-0-0");
  assert.equal(d.metrics.slpm.measuredBouts,3);
  assert.equal(computeUfcPeriod(sample.slice(0,3),"5").record,null);
});
test("unavailable statistics stay null, not fabricated zeroes",()=>{
  const list=sample.slice(0,5).map(f=>({...f,stats:null}));
  const d=computeUfcPeriod(list,"5");
  assert.equal(d.metrics.slpm,null);
  assert.equal(d.metrics.control15,null);
  assert.equal(d.record.display,"5-0-0");
});
test("an unknown period fails closed",()=>{
  assert.throws(()=>selectUfcPeriod(sample,"all-promotions"),/Unknown UFC/);
});
