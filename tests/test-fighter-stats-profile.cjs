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

// ---- Over time: one measured number per fight ----
// Six measured fights, strikes landed per minute rising 2,3,4,5,6,7 over 5-minute fights.
const timeline={...stats,fights:[...Array(6)].map((_,i)=>{
 const n=6-i;  // newest first, so fight 1 is the oldest
 return {boutId:"t"+n,date:(2020+n)+"-05-01",opponent:"Rival "+n,outcome:n%3===0?"L":"W",method:"dec",
  seconds:300,rounds:[[1,300,own((n+1)*10,1,0,60),opp(20,0,0,30)]]};
})};
const trend=sp.trends(timeline,divisions);
assert.match(trend,/data-bsp-trend="test-fighter"/);
assert.match(trend,/<svg class="bsp-trend-svg"[^>]*role="img"/,"the chart is one image to a screen reader");
assert.equal((trend.match(/class="bsp-trend-dot/g)||[]).length,6,"one dot per measured fight");
assert.equal((trend.match(/bsp-trend-dot is-loss/g)||[]).length,2,"losses are marked");
assert.match(trend,/<title>L vs Rival 6 · 2026-05-01 · 14\.00<\/title>/,"each dot names its fight, result and value");
assert.match(trend,/aria-label="6 UFC fights, oldest first\. 4\.00 in the first, 14\.00 in the latest, 9\.00 on average\."/,"and the chart as a whole reads as a sentence");
assert.match(trend,/class="bsp-trend-key"/,"a key names every line, so no label sits on the data");
assert.match(trend,/Career avg 9\.00/);assert.match(trend,/Welterweight avg 3\.90/,"the division average is a reference line");
assert.match(trend,/>15\.00<\/text>/,"the axis top is a round number, not 15.68");
assert.match(trend,/aria-pressed="true">Sig\. strikes landed\/min/,"the first measure is chosen");
assert.match(trend,/Takedowns\/15 min/,"other measures are offered");
assert.match(trend,/not a forecast/);
assert.doesNotMatch(trend,/NaN|Infinity|undefined/,"no arithmetic leaks into the page");

// The key names only what is actually drawn.
assert.match(trend,/is-roll">Five-fight average/,"six fights carry a rolling average");
assert.match(trend,/class="bsp-trend-roll"/);
assert.doesNotMatch(trend,/Draw or no contest/,"no neutral result, no neutral key entry");
const four=sp.trends({...timeline,fights:timeline.fights.slice(0,4)},divisions);
assert.equal((four.match(/class="bsp-trend-dot/g)||[]).length,4,"four fights still draw");
assert.doesNotMatch(four,/class="bsp-trend-roll"/,"four fights draw no five-fight average");
assert.doesNotMatch(four,/Five-fight average/,"and the key does not name a line that is not there");
assert.match(four,/Career avg/,"the career average is still named");

// An outcome the fighter has never had is not in the key either.
const unbeaten=sp.trends({...timeline,fights:timeline.fights.map(f=>({...f,outcome:"W"}))},divisions);
assert.match(unbeaten,/is-win">Won/,"wins are named");
assert.doesNotMatch(unbeaten,/is-loss">Lost/,"an unbeaten fighter has no red dot to explain");
assert.match(unbeaten,/oldest first; green won\./,"and the note matches the key");

// A no contest is neither a win nor a loss: grey, and said so.
const nc=sp.trends({...timeline,fights:timeline.fights.map((f,i)=>i===0?{...f,outcome:"NC",method:"nc"}:f)},divisions);
assert.match(nc,/bsp-trend-dot is-draw/,"a no contest is drawn grey");
assert.match(nc,/is-draw">Draw or no contest/,"and the key explains the grey dot");
assert.match(nc,/grey a draw or no contest/,"as does the note under the chart");

// Too few fights is a list, not a trend.
assert.equal(sp.trends(stats,divisions),"","two fights draw nothing");
assert.equal(sp.trends({...timeline,fights:timeline.fights.slice(0,3)},divisions),"","three fights draw nothing");
// A fighter with no division average still gets the chart, without that line.
const noDiv=sp.trends({...timeline,divisionSlug:"flyweight"},divisions);
assert.match(noDiv,/bsp-trend-svg/);assert.doesNotMatch(noDiv,/Welterweight avg/);assert.match(noDiv,/Career avg/);
// Fights without rounds are not points.
assert.equal((sp.trends({...timeline,fights:[{boutId:"x",date:"2027-01-01",opponent:"Ghost",outcome:"W",seconds:300,rounds:[]},
 ...timeline.fights]},divisions).match(/class="bsp-trend-dot/g)||[]).length,6,"a fight with no round data is skipped");

for(const html of [glance,detail,panel,cmp,history,trend]){
 assert.doesNotMatch(html,/<a\s+href=/i,"no external or research links on reader sections");
 assert.doesNotMatch(html,/verification|source|review queue/i,"no research wording");
}
console.log("PASS fighter stats profile sections");
