/* R2 verified career view (release tracker #171): OFF by default, fail closed, never calls an uncertified or
 * mismatched history a verified career. Offline. */
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const sp=require("../assets/fighter-stats-profile.js");
const read=f=>JSON.parse(fs.readFileSync(__dirname+"/../"+f,"utf8"));
const fight=(id,o="W")=>({boutId:String(id),date:"2026-0"+id+"-01",opponent:"Opp "+id,outcome:o,method:"dec",methodDetail:"Unanimous",endRound:3,endTime:"5:00",rounds:[]});
const stats={slug:"pilot",name:"Pilot",fights:[fight(3),fight(2,"L"),fight(1)]};
const list={schema:1,approved:783,certifiedThrough:"2026-12-01",certified:{pilot:3}};
const on={verifiedCareerView:true};

test("the career view flag exists and is a boolean (the owner turns it on with a PR, #429)",()=>{
 assert.equal(typeof read("data/ufc-v4-flags.json").verifiedCareerView,"boolean");
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
 assert.deepEqual(sp.careerState(stats,list,on),{view:"on",verified:true,count:3,later:0,through:"2026-12-01"});
 const html=sp.history(stats,[],sp.careerState(stats,list,on));
 assert.match(html,/Verified UFC career/);assert.match(html,/3 official fights · independently verified to 2026-12-01/);assert.match(html,/is-verified/);
});
test("flag on: anything else is labelled as fights on record",()=>{
 const reasons=(s,l)=>sp.careerState(s,l,on).reason;
 assert.equal(reasons(stats,null),"no_certified_list");
 assert.equal(reasons(stats,{...list,approved:700}),"no_certified_list");
 assert.equal(reasons(stats,{...list,certifiedThrough:undefined}),"no_certified_list");
 assert.equal(reasons(stats,{...list,certified:{}}),"not_certified");
 assert.equal(reasons(stats,{...list,certified:{pilot:4}}),"count_mismatch");
 assert.equal(reasons({...stats,fights:[...stats.fights,fight(4)]},{...list,certifiedThrough:"2026-12-01"}),"count_mismatch","a fight inside the certified period that the certificate lacks");
 assert.equal(reasons({...stats,fights:[fight(3),fight(2)]},list),"count_mismatch","a certified fight BEFN lacks (the skipped no-contest case)");
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

test("a fight after the evidence cutoff is newer, not a gap",()=>{
 const late={...fight(9),date:"2026-12-05"};
 const st={...stats,fights:[late,...stats.fights]};
 assert.deepEqual(sp.careerState(st,list,on),{view:"on",verified:true,count:3,later:1,through:"2026-12-01"});
 assert.match(sp.history(st,[],sp.careerState(st,list,on)),/independently verified to 2026-12-01 · 1 newer/);
 assert.equal(sp.careerState({...stats,fights:[late,fight(2),fight(1)]},list,on).reason,"count_mismatch");
});
test("the certified list states the evidence cutoff it covers",()=>{
 assert.match(read("data/ufc-v4-certified-careers.json").certifiedThrough,/^\d{4}-\d{2}-\d{2}$/);
});

test("every certified fighter with a stats file matches the certificate up to the cutoff",()=>{
 const careers=read("data/ufc-v4-certified-careers.json");
 let checked=0,missing=[];
 for(const [slug,want] of Object.entries(careers.certified)){
  const path=__dirname+"/../data/ufc-stats/fighters/"+slug+".json";
  if(!fs.existsSync(path)){missing.push(slug);continue;}
  const fights=JSON.parse(fs.readFileSync(path,"utf8")).fights.filter(f=>f.date<=careers.certifiedThrough);
  assert.equal(fights.length,want,slug+" stats vs certificate");
  checked++;
 }
 assert(checked>=740,"most certified fighters are checked");
 assert(missing.length<=2,"only the two shared-name fighters have no stats file: "+missing);
});

/* ---- R3 period views ---- */
const many=n=>Array.from({length:n},(_,i)=>({...fight(i+1),date:"2026-01-"+String(i+1).padStart(2,"0"),outcome:i===2?"NC":"W"}));
const win=(fights,statFights)=>({fights,statFights,W:fights,L:0,D:0,NC:0,winsBy:{ko:1,sub:0},rates:{slpm:3}});
const big=n=>({slug:"vet",name:"Vet",fights:many(n),windows:{last5:win(Math.min(5,n),Math.min(5,n)),last10:win(Math.min(10,n),Math.min(10,n)-1),l12:win(2,2),l36:win(4,4),career:win(n,n-1)}});
const certN=n=>({schema:1,approved:783,certifiedThrough:"2026-12-01",certified:{vet:n}});
const p_on={periodViews:true};
const labels=html=>[...html.matchAll(/data-bsp-window="(\w+)"/g)].map(m=>m[1]);

test("the period views flag exists and is a boolean (the owner turns it on with a PR, #429)",()=>{
 assert.equal(typeof read("data/ufc-v4-flags.json").periodViews,"boolean");
});
test("flag off: the existing switcher, whatever the fighter",()=>{
 const st=big(12),mode=sp.periodMode(st,certN(12),{periodViews:false});
 assert.equal(mode.on,false);
 assert.deepEqual(labels(sp.statsPanel(st,mode)),["last5","l12","l36","career"]);
 assert.deepEqual(labels(sp.statsPanel(st)),["last5","l12","l36","career"],"no argument, same");
});
test("flag on, verified career: Last 5 / Last 10 / Career, and a Last N only with N fights",()=>{
 assert.deepEqual(labels(sp.statsPanel(big(12),sp.periodMode(big(12),certN(12),p_on))),["last5","last10","career"]);
 assert.deepEqual(labels(sp.statsPanel(big(7),sp.periodMode(big(7),certN(7),p_on))),["last5","career"],"7 fights: no Last 10");
 assert.deepEqual(labels(sp.statsPanel(big(3),sp.periodMode(big(3),certN(3),p_on))),["career"],"3 fights: Career only");
});
test("flag on, not verified: the existing switcher, never the new views",()=>{
 const st=big(12);
 for(const c of [null,certN(11),{...certN(12),certified:{}}]){
  const mode=sp.periodMode(st,c,p_on);
  assert.equal(mode.on,false);
  assert.deepEqual(labels(sp.statsPanel(st,mode)),["last5","l12","l36","career"]);
 }
});
test("the 12 and 36 month windows are replaced, and the first view states its measured count",()=>{
 const st=big(12),html=sp.statsPanel(st,sp.periodMode(st,certN(12),p_on));
 assert.match(html,/5 fights with stats/,"Last 5: all five measured");
 assert(!/data-bsp-window="l12"|data-bsp-window="l36"/.test(html));
});
