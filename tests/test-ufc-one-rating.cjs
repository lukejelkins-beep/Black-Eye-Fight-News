/* One BEFN rating: every profile shows the stats build's own number, the one the
 * UFC stats page ranks by. Runs the shipped renderer on the committed data. */
"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const read=p=>fs.existsSync(p)?JSON.parse(fs.readFileSync(p,"utf8")):null;
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function load(fighters){
 const engine=require("../assets/fighter-power-index.js");
 const el={dataset:{},querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
 const document={...el,body:el,getElementById:()=>null,createElement:()=>({...el})};
 const window={COMBAT_DATA:{fighters,champions:{mma:[]}},BEFNPowerIndex:engine,
  addEventListener(){},dispatchEvent(){},location:{hash:""},
  BEFNUfcClassifier:{classify:s=>({label:s.category,score:null,eligible:false,version:2})}};
 const fetch=async url=>{const body=read(String(url).split("?")[0]);return {ok:body!==null,json:async()=>body};};
 window.BEFNStatsProfile=require("../assets/fighter-stats-profile.js");
 vm.runInNewContext(fs.readFileSync("assets/fighter-insights.js","utf8"),
  {window,document,fetch,console,URL,CustomEvent:class{},setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:()=>0});
 return window.BEFNFighterInsights;
}


// A provisional rating (1-2 measured fights) is in the fighter's own file but deliberately not in index.json, so the
// leaderboards and the rated count never see it. The page shows it, tagged; the index row stays blank.
function expectedRating(slug,row){
 const own=read("data/ufc-stats/fighters/"+slug+".json").ratings;
 if(!own.provisional)return row.rating;
 return [own.overall??null,...["striking","grappling","wrestling","defence"].map(k=>own.skills[k].roster??null),own.form.score??null];
}

test("profile rating and skills equal the stats build, with no credential points",async()=>{
 const index=read("data/ufc-stats/index.json").fighters,names=read("data/ufc-stats/names.json").names;
 const fighters=[],ui=load(fighters);
 for(let i=0;i<20;i++)await tick();
 const people=Object.entries(index).filter(([slug,row])=>Object.values(names).includes(slug)).map(([slug,row])=>{
  // The catalogue's own object carries the credentials that used to add points.
  const known=ui.profileFor(row.name);
  return {slug,row,profile:{...(known||{}),id:known?.id||slug,name:row.name,sport:"MMA",organisation:"UFC"}};
 });
 for(const p of people)ui.renderProfile(p.profile);
 for(let i=0;i<20;i++)await tick();
 assert(people.length>800,"the whole roster is checked");
 let credentialled=0;
 for(const {slug,row,profile} of people){
  if(ui.credentialsFor(profile).length)credentialled++;
  const html=ui.renderProfile(profile);
  const shown=/class="befn-v3-score">(\d+|Unrated|—)/.exec(html)?.[1];
  const want=expectedRating(slug,row);
  assert.equal(shown,want[0]===null?"Unrated":String(want[0]),slug+" headline");
  for(const [i,label] of ["Striking","Grappling","Wrestling","Defence"].entries()){
   const value=want[i+1],meter=html.slice(html.indexOf(">"+label+"<"));
   const got=/<b[^>]*>(Not rated|\d+)/.exec(meter)?.[1];
   assert.equal(got,value===null?"Not rated":String(value),slug+" "+label);
  }
 }
 assert(credentialled>=5,"fighters with credentials are covered");
});

test("every fighter in the stats build has a profile with their own stats and rating",async()=>{
 const index=read("data/ufc-stats/index.json").fighters,ui=load([]);
 for(let i=0;i<20;i++)await tick();
 for(const slug of Object.keys(index))ui.statsProfile("ufc--"+slug);
 for(let i=0;i<30;i++)await tick();
 for(const [slug,row] of Object.entries(index)){
  const f=ui.statsProfile("ufc--"+slug);
  assert(f,slug+" has no profile");
  const html=ui.renderProfile(f),shown=/class="befn-v3-score">(\d+|Unrated|—)/.exec(html)?.[1];
  const plain=n=>n.normalize("NFKD").replace(/[^a-z0-9]/gi,"").toLowerCase();
  assert.equal(plain(f.name),plain(row.name),slug);
  const want=expectedRating(slug,row);
  assert.equal(shown,want[0]===null?"Unrated":String(want[0]),slug+" headline");
  assert(html.includes("data-bsp-stats"),slug+" has no statistics panel");
 }
});

test("a provisional rating is tagged and stays out of the index",()=>{
 const index=read("data/ufc-stats/index.json").fighters;
 let n=0;
 for(const [slug,row] of Object.entries(index)){
  const own=read("data/ufc-stats/fighters/"+slug+".json").ratings;
  if(!own.provisional)continue;
  n++;
  assert.equal(own.eligible,false,slug+" is not a full rating");
  assert(row.rating.slice(0,5).every(v=>v===null),slug+" index row keeps the percentiles blank");
 }
 assert(n>=100,"provisional fighters are covered");
});
