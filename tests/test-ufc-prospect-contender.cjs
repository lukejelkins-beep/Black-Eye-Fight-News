/* Counterfactual QA: two independent UFC scouting indices, opponent gates,
 * small-sample caution, stale rank rejection, no division quotas. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const classifier=require("../assets/ufc-prospect-contender.js");
const power=require("../assets/fighter-power-index.js");
const root=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const source=[...Object.values(read("data/ufc-prospect-profiles.json").fighters),
 ...Object.values(read("data/ufc-contender-profiles.json").fighters)];
const individuals=Object.fromEntries(source.map(f=>[f.name,{f,result:classifier.classify(f,power)}]));
for(const [name,{f,result}] of Object.entries(individuals)){
 assert(result.eligible,name+": source-review gate");
 assert.equal(result.version,2);
 assert.equal(result.label,f.category,name+": editorial label no longer matches v2");
 assert(Number.isFinite(result.prospectIndex)&&Number.isFinite(result.contenderIndex));
 assert(result.prospectIndex>=0&&result.prospectIndex<=100);
 assert(result.contenderIndex>=0&&result.contenderIndex<=100);
 assert(result.components.contender.measuredUFCPerformance!==null);
 assert(result.components.prospect.measuredUFCPerformance!==null);
 assert(result.confidence==="Limited"||result.confidence==="Moderate"||result.confidence==="High");
 console.log(name,JSON.stringify({classification:result.label,
  prospect:result.prospectIndex,contender:result.contenderIndex,
  confidence:result.confidence,quality:result.qualityEvidence}));
}
for(const name of ["José Souza","Austin Bashi","Lucas Fernando","Elijah Smith"])
 assert.equal(individuals[name].result.label,"Prospect",
  name+": promising UFC record without verified opponent-quality evidence is not yet proven contender");
const base=individuals["Elijah Smith"].f;
const change=(updates)=>({...base,...updates});
const R=f=>classifier.classify(f,power);
assert.equal(R(change({ufcRecord:{...base.ufcRecord,complete:false}})).label,"Unassessed");
assert.equal(R(change({latest:[]})).label,"Unassessed");
assert(R(change({verifiedStats:null})).eligible,
 "Source-verified results can still be assessed without measured stats");
assert.equal(R(change({verifiedStats:null})).components.prospect.measuredUFCPerformance,null);
assert.equal(R(change({age:35})).label,"Prospect",
 "Breakout talent must not be excluded solely by an age cutoff");
const rankedWin={...base.latest[0],opponentRankAtFight:8,
 opponentRankSource:"https://www.ufc.com/rankings",
 opponentRankCheckedAt:"2026-11-01"};
const improved=R(change({latest:[rankedWin,...base.latest.slice(1)]}));
assert(improved.contenderIndex>individuals["Elijah Smith"].result.contenderIndex);
assert.equal(improved.label,"Contender","A sourced ranked-opponent win can establish contender status");
assert.equal(R(change({latest:[{...rankedWin,opponentRankSource:"https://example.com/opinion"},...base.latest.slice(1)]})).label,
 "Prospect","Unverified unofficial rank cannot create contender status");
const officialRank={rank:12,checkedAt:"2026-11-12",source:"https://www.ufc.com/rankings"};
assert.equal(R(change({ranking:officialRank})).label,"Contender");
assert.equal(R(change({ranking:{...officialRank,source:"https://example.com/rankings"}})).label,
 "Prospect");
assert.equal(R(change({ranking:{...officialRank,checkedAt:"2026-08-01"}})).label,
 "Prospect","Stale rankings must not count indefinitely");
const withLoss=R(change({latest:[{...base.latest[0],outcome:"L"},...base.latest.slice(1)]}));
assert.equal(withLoss.label,"Prospect","One defeat must not immediately cancel a promising trajectory");
const weakRecent=R(change({latest:base.latest.map(x=>({...x,outcome:"L"}))}));
assert.notEqual(weakRecent.label,"Contender");
const wide=Array.from({length:60},(_,i)=>R(change({
 name:"Same Division "+i,
 source:"https://www.ufc.com/athlete/same-division-"+i,
 ranking:officialRank})));
assert(wide.every(x=>x.label==="Contender"),"No top-N division quota");
console.log("PASS UFC scout v2: distinct scores, opponent gates, sources, age independence, no quotas");
