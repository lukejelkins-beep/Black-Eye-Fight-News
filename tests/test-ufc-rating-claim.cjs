/* The BEFN rating is DESCRIPTIVE (owner decision 2026-11-23, after the R4 calibration study): a percentile among rated
 * UFC fighters on measured skills, never a forecast. Profile code must not describe it as a prediction, odds or a
 * favourite. Comments are ignored, and so is the disclaimer that says stats are not a prediction. */
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const files=["assets/fighter-insights.js","assets/fighter-stats-profile.js","assets/ufc-stat-leaderboards.js","assets/fighter-power-index.js"];
const banned=/\b(?:predicts?|predicted|predictive|forecasts?|win probability|chance of winning|odds|favou?rites?)\b/i;
test("rating and stats code makes no predictive claim",()=>{
 for(const f of files){
  const path=__dirname+"/../"+f;
  if(!fs.existsSync(path))continue;
  const hits=fs.readFileSync(path,"utf8").split("\n").map((l,i)=>[i+1,l]).filter(([,l])=>!/^\s*(?:\/\/|\*|\/\*)/.test(l)&&banned.test(l)&&!/not an ability prediction/i.test(l));
  assert.deepEqual(hits.map(([n,l])=>f+":"+n+" "+l.trim().slice(0,100)),[],f+" uses predictive wording");
 }
});
