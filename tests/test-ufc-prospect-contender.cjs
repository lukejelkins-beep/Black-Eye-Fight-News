const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const classifier=require("../assets/ufc-prospect-contender.js");
const power=require("../assets/fighter-power-index.js");
const root=path.resolve(__dirname,"..");
const load=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const prospects=load("data/ufc-prospect-profiles.json"),contenders=load("data/ufc-contender-profiles.json");
const byName={};
for(const f of [...Object.values(prospects.fighters),...Object.values(contenders.fighters)]){
 const result=classifier.classify(f,power);
 byName[f.name]={f,result};
 assert.equal(result.label,f.category,f.name+" editorial label differs from rule-based classification");
 assert(result.eligible&&result.score>=35,f.name+" research incomplete");
 assert.equal(result.verifiedRank,null,"Never infer official ranking from unofficial Elo ranks");
 assert(result.components.statisticalSkill!==null,"All four UFC-only stat snapshots should contribute");
}
assert.equal(byName["José Souza"].result.label,"Prospect");
assert.equal(byName["Austin Bashi"].result.label,"Prospect");
assert.equal(byName["Lucas Fernando"].result.label,"Prospect");
assert.equal(byName["Elijah Smith"].result.label,"Contender");
const smith=byName["Elijah Smith"].result;
assert.equal(smith.ufcWins,4);
assert(smith.score>=72);
assert.equal(byName["Austin Bashi"].result.ufcWins,2);
assert(classifier.classify({...byName["Elijah Smith"].f,ufcRecord:{...byName["Elijah Smith"].f.ufcRecord,complete:false}},power).label==="Unassessed");
assert(classifier.classify({...byName["Elijah Smith"].f,latest:[]},power).label==="Unassessed");
assert(classifier.classify({...byName["Elijah Smith"].f,ufcRecord:{...byName["Elijah Smith"].f.ufcRecord,wins:3,losses:1},latest:[
 {...byName["Elijah Smith"].f.latest[0],outcome:"L"},...byName["Elijah Smith"].f.latest.slice(1)]},power).label!=="Contender");
const fake=(index)=>({...byName["Elijah Smith"].f,name:"New Fighter "+index,
 source:"https://www.ufc.com/athlete/new-fighter-"+index,id:"mma-ufc--new-fighter-"+index});
const many=Array.from({length:35},(_,i)=>classifier.classify(fake(i),power));
assert(many.every(x=>x.label==="Contender"),"No per-division maximum on classification");
for(const n of Object.keys(byName))console.log(n,JSON.stringify(byName[n].result));
console.log("PASS: evidence-gated and division-uncapped UFC classifications");
