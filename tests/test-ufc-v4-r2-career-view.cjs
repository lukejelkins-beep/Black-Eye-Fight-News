/* R2 verified career view (release tracker #171): OFF by default, fail closed, never calls an uncertified or
 * mismatched history a verified career. Offline. */
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const sp=require("../assets/fighter-stats-profile.js");
const read=f=>JSON.parse(fs.readFileSync(__dirname+"/../"+f,"utf8"));
const fight=(id,o="W")=>({boutId:String(id),date:"2026-0"+id+"-01",opponent:"Opp "+id,outcome:o,method:"dec",methodDetail:"Unanimous",endRound:3,endTime:"5:00",rounds:[]});
const stats={slug:"pilot",name:"Pilot",fights:[fight(3),fight(2,"L"),fight(1)]};
const list={schema:1,approved:783,certified:{pilot:3}};
const on={verifiedCareerView:true};

test("the flag is off in the repository",()=>{
 assert.equal(read("data/ufc-v4-flags.json").verifiedCareerView,false);
});
test("flag off: nothing changes and no history is called verified",()=>{
 assert.equal(sp.careerState(stats,list,{verifiedCareerView:false}).view,"off");
 assert.equal(sp.careerState(stats,list,null).view,"off");
 const html=sp.history(stats,[],sp.careerState(stats,list,null));
 assert.match(html,/Full UFC history/);
 assert.doesNotMatch(html,/Verified UFC career|independently verified/);
 assert.equal(sp.history(stats,[]),html,"same output with no career argument");
});
test("flag on: only an exact certified match is verified",()=>{
 assert.deepEqual(sp.careerState(stats,list,on),{view:"on",verified:true,count:3});
 const html=sp.history(stats,[],sp.careerState(stats,list,on));
 assert.match(html,/Verified UFC career/);assert.match(html,/3 official fights/);assert.match(html,/is-verified/);
});
test("flag on: anything else is labelled as fights on record",()=>{
 const reasons=(s,l)=>sp.careerState(s,l,on).reason;
 assert.equal(reasons(stats,null),"no_certified_list");
 assert.equal(reasons(stats,{...list,approved:700}),"no_certified_list");
 assert.equal(reasons(stats,{...list,certified:{}}),"not_certified");
 assert.equal(reasons(stats,{...list,certified:{pilot:4}}),"count_mismatch");
 assert.equal(reasons({...stats,fights:[...stats.fights,fight(4)]},list),"count_mismatch");
 assert.equal(reasons({...stats,fights:[fight(1),fight(1),fight(2)]},list),"invalid_bouts","duplicate bout id");
 assert.equal(reasons({...stats,fights:[fight(1),fight(2),{...fight(3),outcome:"?"}]},list),"invalid_bouts");
 const html=sp.history(stats,[],sp.careerState(stats,{...list,certified:{}},on));
 assert.match(html,/UFC fights on record/);assert.match(html,/not yet independently verified/);
 assert.doesNotMatch(html,/Verified UFC career/);
});
test("the certified list matches the canonical register",()=>{
 const careers=read("data/ufc-v4-certified-careers.json"),register=read("data/ufc-independent-full-career-verification.json").fighters;
 const approval=read("data/ufc-36-month-roster-approval.json");
 assert.equal(careers.approved,783);
 assert.equal(careers.approvalHash,approval.approvedRosterSha256,"built from the approved cohort");
 const slugs=Object.keys(careers.certified);
 assert.equal(slugs.length,careers.certifiedCount);
 assert(slugs.length>=700&&slugs.length<=783);
 for(const s of slugs){
  assert(register[s],s+" is not in the canonical register");
  assert(["complete_official_ufc_career","full_ufc_career_from_debut_to_snapshot"].includes(register[s].scope),s+" scope "+register[s].scope);
  assert.equal(register[s].sourceCoverageAttested,true,s);
  assert(Number.isSafeInteger(careers.certified[s])&&careers.certified[s]>=1,s);
 }
});

test("when every fight is already in the recent list, the career status is still stated, in one line",()=>{
 const all=stats.fights.map(f=>f.boutId);
 assert.equal(sp.history(stats,all,sp.careerState(stats,list,null)),"","flag off: nothing extra");
 assert.match(sp.history(stats,all,sp.careerState(stats,list,on)),/Verified UFC career · 3 official fights/);
 assert.match(sp.history(stats,all,sp.careerState(stats,{...list,certified:{}},on)),/not yet independently verified/);
});
