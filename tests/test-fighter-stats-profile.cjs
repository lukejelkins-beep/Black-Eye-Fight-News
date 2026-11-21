/* Stage 4 profile sections (assets/fighter-stats-profile.js): reader-safe output and contracts. */
const assert=require("node:assert/strict");
const sp=require("../assets/fighter-stats-profile.js");
const fields=["sigLanded","sigAttempted","takedowns","knockdowns","controlSec"];
const own=(s,t,k,c)=>[s,s+5,t,k,c],opp=(s,t,k,c)=>[s,s+4,t,k,c];
const stats={
 slug:"test-fighter",name:"Test Fighter",division:"Welterweight",divisionSlug:"welterweight",roundFields:fields,
 windows:{
  career:{fights:3,W:2,L:1,D:0,NC:0,finishRate:.5,winsBy:{ko:1,sub:0,dec:1},judging:{roundsScored:6,roundsWon:4,roundWinRate:.6667},rates:{diffPm:.4}},
  last5:{fights:3,W:2,L:1,D:0,NC:0,statFights:3,winsBy:{ko:1,sub:0},rates:{slpm:4.2,strAcc:.51,kd15:.3,td15:1.2,tdDef:.8,ctrlShare:.2,
   target:{head:.6,body:.25,leg:.15},position:{distance:.7,clinch:.2,ground:.1},paceRetention:.9}},
  l12:{fights:0,rates:{}},
  l36:{fights:3,statFights:3,rates:{slpm:4.2,sapm:2.5,strAcc:.51,strDef:.6,td15:1.2,tdDef:.8,ctrlShare:.2,kd15:.3}}
 },
 fights:[
  {boutId:"9",date:"2026-08-01",opponent:"Alpha Bravo",outcome:"W",method:"dec",methodDetail:"Split",endRound:3,endTime:"5:00",event:"Polymarket UFC 999: A vs B",
   rounds:[[1,300,own(10,1,0,60),opp(8,0,0,0)],[2,300,own(12,0,1,0),opp(9,1,0,30)],[3,300,own(7,0,0,0),opp(11,0,0,0)]],
   scorecards:{judges:[{judge:"J One",rounds:[[1,10,9],[2,10,9],[3,9,10]],total:[29,28]}]}},
  {boutId:"8",date:"2026-03-01",opponent:"Charlie Delta",outcome:"L",method:"ko",endRound:1,endTime:"2:10",rounds:[]}
 ]
};
const divisions={schema:1,minFights:3,rateFields:["slpm","sapm","strAcc","strDef","td15","tdDef","ctrlShare","kd15"],
 divisions:{welterweight:{label:"Welterweight",fighters:24,rates:[3.9,3.4,.5,.55,1.4,.7,.19,.25]}}};

// Matching: by bout id, else by opponent and date within one day.
assert.equal(sp.findFight(stats,{boutId:"9"}).opponent,"Alpha Bravo");
assert.equal(sp.findFight(stats,{date:"2026-03-02",opponent:"Charlie  Delta"}).boutId,"8");
assert.equal(sp.findFight(stats,{date:"2026-03-05",opponent:"Charlie Delta"}),null,"never matches beyond one day");
assert.equal(sp.methodText(stats.fights[0]),"Decision (split)");
assert.equal(sp.methodText(stats.fights[1]),"KO/TKO · R1 2:10");

const glance=sp.glance(stats);
assert.match(glance,/2–1/);assert.match(glance,/50%/);assert.match(glance,/67%/);
assert.match(glance,/Latest bout/);assert.match(glance,/<b>29–28<\/b> sig\. strikes/,"latest bout sums its rounds");

const detail=sp.fightDetail(stats,{boutId:"9"});
assert.match(detail,/R1/);assert.match(detail,/J One/);
assert.match(detail,/class="is-won">10–9/);assert.match(detail,/class="is-lost">9–10/,"fighter's score first");
assert.match(sp.fightDetail(stats,{boutId:"8"}),/not recorded/,"a fight without rounds says so");
assert.equal(sp.fightDetail(stats,{boutId:"404"}),"","unknown fights render nothing");

const panel=sp.statsPanel(stats);
assert.equal((panel.match(/<div><strong>/g)||[]).length,9,"stats keep exactly nine tiles");
assert.match(panel,/aria-pressed="true">Last 5/);
assert.match(panel,/Where strikes land/);assert.match(panel,/90%/);

const cmp=sp.compare(stats,divisions);
assert.match(cmp,/Welterweight average/);
assert.match(cmp,/is-own is-better[^]*?2\.50/,"lower absorbed strikes is marked better");
assert.equal(sp.compare({...stats,divisionSlug:"flyweight"},divisions),"","no average, no section");

const history=sp.history(stats,["9"]);
assert.match(history,/Full UFC history/);assert.doesNotMatch(history,/Alpha Bravo/,"rows already shown are skipped");

for(const html of [glance,detail,panel,cmp,history]){
 assert.doesNotMatch(html,/<a\s+href=/i,"no external or research links on reader sections");
 assert.doesNotMatch(html,/verification|source|review queue/i,"no research wording");
}
console.log("PASS fighter stats profile sections");
