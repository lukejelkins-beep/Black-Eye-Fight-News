/* CI parity check: the Python ratings port (scripts/ufc_ratings.py) must give the
 * same raw skill composites as the browser engine (assets/fighter-power-index.js).
 * Usage: node tests/ufc-ratings-parity.cjs <fixture.json from build-ufc-stats.py --parity-out> */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const engine=require("../assets/fighter-power-index.js");
const rows=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
assert(Array.isArray(rows)&&rows.length>=100,"parity fixture needs at least 100 rated fighters");
let compared=0;
for(const row of rows){
 const r=row.rates,w=row.window;
 const d=engine.careerData({stats:{source:"BEFN stats build",observedOn:"parity",sampleBouts:Math.max(2,row.statFights),
  slpm:r.slpm,sapm:r.sapm,strAcc:r.strAcc,strDef:r.strDef,tdAvg:r.td15,tdAcc:r.tdAcc,tdDef:r.tdDef,
  subAvg:r.sub15,revAvg:r.rev15,controlShare:r.ctrlShare,controlAgainst:r.ctrlAgainstShare,
  kdAvg:r.kd15,kdAgainstAvg:r.kdAbs15,koTkoWinRate:w.koWinShare,submissionWinRate:w.subWinShare,
  submissionLossRate:w.subLossShare,subAgainstAvg:r.subAbs15}});
 for(const skill of ["striking","grappling","wrestling","defence"]){
  const js=engine.rawSkill(d,skill),py=row.raw[skill];
  if(js===null||py===null)assert.equal(js,py,row.slug+" "+skill+" gate differs: js="+js+" py="+py);
  else assert(Math.abs(js-py)<1e-6,row.slug+" "+skill+" js="+js+" py="+py);
  compared++;
 }
}
console.log("PASS ratings parity: "+compared+" skill composites identical across "+rows.length+" fighters");
