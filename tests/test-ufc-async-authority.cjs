/* Deterministic fetch-order regression for reviewed UFC identity and records.
 * Uses the shipped browser module and real repository data, without network.
 * Fails if an older preview overwrites a reviewed UFC-only fighter history.
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const moduleSource = fs.readFileSync("assets/fighter-insights.js", "utf8");
const paths = [
 "data/fighter-comparison-sample.json",
 "data/ufc334-fighter-evidence.json",
 "data/ufc-champion-profiles.json",
 "data/ufc-ranked-profiles.json",
 "data/ufc-contender-profiles.json",
 "data/ufc-prospect-profiles.json",
 "data/ufc-roster-profiles.json",
 "data/ufc-postfight-metrics.json",
 "data/fighter-intelligence.json"
];
const readData = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,"utf8")) : null;
const data = Object.fromEntries(paths.map(file=>[file,readData(file)]));
const champion = Object.values(data["data/ufc-champion-profiles.json"].fighters)[0];
const bia = Object.values(data["data/ufc-contender-profiles.json"].fighters)
 .find(f=>f.name==="Bia Mesquita");
assert(champion && bia, "Expected reviewed UFC champion and Bia Mesquita fixtures");
assert.equal(bia.latest.length,3, "Bia's reviewed fixture must have three UFC bouts");

const normalize = x => String(x||"").normalize("NFKD")
 .replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const comparison = structuredClone(data["data/fighter-comparison-sample.json"]);
const preview = structuredClone(data["data/ufc334-fighter-evidence.json"]);
const mockOldHistory = [{
 date:"2020-01-01",opponent:"NON-UFC PREVIEW OPPONENT",
 outcome:"W",method:"Decision"
}];
preview.fighters["regression-champion"] = {
 id:"preview-"+champion.id,name:champion.name,sport:"MMA",
 organisation:"UFC",category:"Featured card",source:champion.source,
 record:"0-0",latest:mockOldHistory,credentials:[],
 verifiedStats:{scope:"ufc-only",source:champion.source,sampleBouts:2}
};
comparison.fighters["regression-champion"] = {
 id:"sample-"+champion.id,name:champion.name,sport:"MMA",
 source:champion.source,latest:mockOldHistory,
 credentials:[],tale:{height:"INVALID PREVIEW VALUE"}
};
comparison.fighters["regression-bia"] = {
 id:"sample-"+bia.id,name:bia.name,sport:"MMA",
 source:bia.source,latest:mockOldHistory,credentials:[]
};

async function examine(order) {
 const requests = new Map();
 const listeners = new Map();
 const fighters = [];
 const engine = {
  normalize,
  aggregateRoundPreviews:() => new Map([
   [normalize(bia.name),{unreviewed:true}],
   [normalize(champion.name),{unreviewed:true}]
  ])
 };
 const window = {
  COMBAT_DATA:{fighters,champions:{mma:[]}},
  BEFNPowerIndex:engine,
  BEFNUfcClassifier:{
   classify:source=>({label:source.category,score:70,eligible:true,version:2})
  },
  addEventListener:(type,fn)=>{
   const existing=listeners.get(type)||[];
   existing.push(fn);listeners.set(type,existing);
  },
  dispatchEvent:event=>{
   for(const fn of listeners.get(event.type)||[])fn(event);
  }
 };
 class TestEvent {
  constructor(type,init={}){this.type=type;this.detail=init.detail}
 }
 const document = {
  addEventListener:()=>{},
  querySelectorAll:()=>[],
  querySelector:()=>null,
  getElementById:()=>null,
  body:{}
 };
 const fetch = url=>new Promise(resolve=>{
  assert(paths.includes(url),"Unexpected external fetch: "+url);
  requests.set(url,resolve);
 });
 const sandbox = {window,document,fetch,requestAnimationFrame:()=>1,
  Event:TestEvent,CustomEvent:TestEvent,Map,Set,console};
 vm.runInNewContext(moduleSource,sandbox,{filename:"assets/fighter-insights.js"});
 assert.equal(requests.size,paths.length,"All asynchronous source requests should start");
 for(const file of order){
  const resolve=requests.get(file);
  assert(resolve,"Unexpected fixture response "+file);
  const payload=file==="data/fighter-comparison-sample.json"?comparison:
   file==="data/ufc334-fighter-evidence.json"?preview:data[file];
  resolve(payload===null?{ok:false}:{ok:true,json:async()=>payload});
  for(let n=0;n<8;n++)await Promise.resolve();
  // The earlier old preview can contribute partial round observations before
  // canonical fighters hydrate; champion/roster hydration must discard them.
  if(file==="data/ufc334-fighter-evidence.json" &&
     order[0]==="data/fighter-comparison-sample.json"){
   window.dispatchEvent(new TestEvent("befn:round-previews-ready",
    {detail:{events:[{id:"early-preview"}]}}));
  }
 }
 const byName=name=>fighters.find(f=>normalize(f.name)===normalize(name));
 for(const expected of [bia,champion]){
  const actual=byName(expected.name);
  assert(actual,expected.name+" did not hydrate");
  assert.equal(actual.id,expected.id,expected.name+" canonical fighter ID");
  assert.equal(actual.record,expected.record,expected.name+" professional record");
  assert.equal(actual.division,expected.division,expected.name+" division");
  assert.equal(actual.category,expected.category,expected.name+" classification");
  assert.deepEqual(JSON.parse(JSON.stringify(actual.latest)),expected.latest,
   expected.name+" reviewed UFC-only fight history must be final");
  assert.deepEqual(JSON.parse(JSON.stringify(actual.credentials)),expected.credentials,
   expected.name+" verified credentials must be final");
  assert.equal(actual.performanceEvidence,undefined,
   expected.name+" must not inherit unreviewed round snapshots");
  assert.equal(actual.reviewedUfcProfile===true||actual.championReview===true,true,
   expected.name+" must retain reviewed status");
 }
 assert.equal(byName(bia.name).latest.length,3,"Do not publish two non-UFC Bia bouts");
 window.dispatchEvent(new TestEvent("befn:round-previews-ready",
  {detail:{events:[{id:"unreviewed"}]}}));
 assert.equal(byName(bia.name).performanceEvidence,undefined,
  "late round preview must not mutate Bia");
 assert.equal(byName(champion.name).performanceEvidence,undefined,
  "late round preview must not mutate a champion");
 assert.strictEqual(window.BEFNFighterInsights.profileFor(bia.name),byName(bia.name),
  "profile lookup must return the canonical reviewed fighter");
}
const previewFiles = ["data/fighter-comparison-sample.json",
 "data/ufc334-fighter-evidence.json","data/ufc-postfight-metrics.json",
 "data/fighter-intelligence.json"];
const reviewedFiles = ["data/ufc-champion-profiles.json",
 "data/ufc-ranked-profiles.json","data/ufc-contender-profiles.json",
 "data/ufc-prospect-profiles.json","data/ufc-roster-profiles.json"];
test("old previews finish before individually reviewed UFC cohorts",async()=>{
 await examine([...previewFiles,...reviewedFiles]);
});
test("old previews finish after individually reviewed UFC cohorts",async()=>{
 await examine([...reviewedFiles,...previewFiles]);
});
