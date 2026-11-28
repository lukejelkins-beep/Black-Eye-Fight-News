/* Fighter profile design A "One profile" (owner, 2026-11-25): assets/fighter-profile-a.js with the shipped data.
 * No placeholders ("Not rated", "No … listed"), never "Unassessed", a plain "Back" label, a basic profile for other
 * MMA from results and upcoming cards, and the deep-link route that puts the sport's Fighters hub behind a profile. */
"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const PA=require("../assets/fighter-profile-a.js");
const app=fs.readFileSync("assets/app-inline-2.js","utf8");
const combat=(()=>{const w={};vm.runInNewContext(fs.readFileSync("assets/app-inline-1.js","utf8"),{window:w});return w.COMBAT_DATA;})();
const data={results:read("data/results.json"),upcoming:read("data/upcoming-cards.json"),champions:combat.champions.boxing};
const PLACEHOLDERS=/Not rated|No credentials listed|No title history listed|No championship history listed|Unassessed|Fighter Scout|Recent results unavailable/;
const h={localImage:()=>"",portrait:"<div data-fighter-portrait></div>",src:"",news:"",newsOne:""};
const tick=()=>new Promise(r=>setImmediate(r));
function insights(fighters){
 const el={dataset:{},querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
 const document={...el,body:el,getElementById:()=>null,createElement:()=>({...el})};
 const window={COMBAT_DATA:{fighters,champions:combat.champions},BEFNPowerIndex:require("../assets/fighter-power-index.js"),
  addEventListener(){},dispatchEvent(){},location:{hash:""},BEFNStatsProfile:require("../assets/fighter-stats-profile.js"),
  BEFNUfcClassifier:{classify:s=>({label:s.category,score:null,eligible:false,version:2})}};
 const fetch=async url=>{const p=String(url).split("?")[0];return fs.existsSync(p)?{ok:true,json:async()=>read(p)}:{ok:false,json:async()=>null};};
 vm.runInNewContext(fs.readFileSync("assets/fighter-insights.js","utf8"),
  {window,document,fetch,console,URL,CustomEvent:class{},setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:()=>0});
 return window.BEFNFighterInsights;
}

test("the back label is plain Back, never Fighter Scout or UFC stats",()=>{
 const html=PA.shellHTML({id:"x"},PA.model({id:"x",name:"A B",sport:"Boxing",record:"1-0",latest:[]},null,{...data,today:"2026-11-25"}),h);
 assert.match(html,/class="befn-pro-back befn-pa-back" data-close-fighter>← Back</);
 assert.doesNotMatch(app,/Fighter Scout|'← UFC stats'/);
});

test("boxing profiles hold no placeholder and no empty section",async()=>{
 const ins=insights(combat.fighters.map(f=>({...f})));
 for(let i=0;i<10;i++)await tick();
 const boxers=combat.fighters.filter(f=>f.sport==="Boxing");
 assert(boxers.length>50);
 for(const f of boxers){
  const src=ins.renderProfile(f);
  assert.doesNotMatch(src,PLACEHOLDERS,f.id+" fighter-insights section");
  const m=PA.model(f,ins.modelFor(f),{...data,today:"2026-11-25"});
  const html=PA.shellHTML(f,m,{...h,src});
  assert.doesNotMatch(html.replace(src,""),PLACEHOLDERS,f.id+" shell");
  for(const s of m.skills)assert(Number.isInteger(s.score),f.id+" rating without a value: "+s.label);
 }
 // Andres Cortes: Power has a value and is shown; the unrated four are left out.
 const cortes=combat.fighters.find(f=>f.id==="boxing-contenders--andres-cortes");
 const m=PA.model(cortes,ins.modelFor(cortes),{...data,today:"2026-11-25"});
 assert.deepEqual(m.skills.map(s=>s.label),["Power"]);
 assert.equal(m.record,"26–0");assert.equal(m.recordSmall,"13 KOs");
 assert(m.pills.some(p=>p.text==="Unbeaten"));
 assert.equal(m.recent[0].opponent,"Mark Magsayo","initials prefix dropped");
});

test("an older MMA roster fighter is never labelled Unassessed",async()=>{
 const ins=insights(combat.fighters.map(f=>({...f})));
 for(let i=0;i<10;i++)await tick();
 const legacy=combat.fighters.filter(f=>f.sport==="MMA");
 for(const f of legacy){
  const m=PA.model(f,ins.modelFor(f),{...data,today:"2026-11-25"});
  assert(!m.pills.some(p=>/Unassessed|Roster/.test(p.text)),f.id);
  assert.doesNotMatch(PA.shellHTML(f,m,h),PLACEHOLDERS,f.id);
 }
});

test("other MMA: a basic profile from results and cards, with only sourced fields",()=>{
 const f=PA.basicProfile("mma--vadim-nemkov",data,"2026-11-25");
 assert(f,"Vadim Nemkov is in data/results.json");
 assert.equal(f.promotion,"PFL");assert.equal(f.division,"Heavyweight");
 assert.match(f.record,/^20[–-]3/);assert.match(f.recordSource,/^https:\/\//);
 assert.equal(f.fights[0].opponent,"Sergei Bilostenniy");assert.equal(f.fights[0].outcome,"L");
 const m=PA.model(f,null,{...data,today:"2026-11-25"});
 assert.equal(m.crumb,"MMA · PFL · Heavyweight");assert.equal(m.eyebrow,"PFL · Heavyweight");
 assert.equal(m.rating,null);assert.deepEqual(m.skills,[]);
 const html=PA.shellHTML(f,m,h);
 assert.match(html,/<h2 data-profile-name>Vadim Nemkov<\/h2>/);
 assert.match(html,/Next fight: <b>not announced<\/b>/);
 assert.match(html,/About this profile/);assert.match(html,/from schedule\.fightmag\.com/);
 assert.doesNotMatch(html,PLACEHOLDERS);
 // Staff text sits only inside the closed About details, after the body.
 assert(html.indexOf("from schedule.fightmag.com")>html.indexOf('<details class="befn-pa-about">'));
 // UFC fights are left out of the other-MMA profile; unknown names have no profile.
 for(const r of data.results.results.filter(r=>r.sport==="MMA"&&/^ufc-/.test(r.eventId)).slice(0,20))
  assert.equal(PA.basicProfile("mma--"+PA.slugOf(r.fighters[0].name),data,"2026-11-25")?.fights.some(x=>x.promotion==="UFC")??false,false);
 assert.equal(PA.basicProfile("mma--nobody-at-all",data,"2026-11-25"),null);
 // Every other-MMA name on a results card opens a profile.
 const others=data.results.results.filter(r=>r.sport==="MMA"&&!/^ufc-/.test(r.eventId));
 assert(others.length>50);
 for(const r of others)for(const x of r.fighters)assert(PA.basicProfile(PA.idFor(x.name,"mma"),data,"2026-11-25"),x.name);
});

test("a boxing champion without a roster entry opens from the title tracker and cards",()=>{
 const f=PA.basicProfile("boxing--agit-kabayel",data,"2026-11-25");
 assert(f);const m=PA.model(f,null,{...data,today:"2026-11-25"});
 assert(m.pills.some(p=>p.text==="WBC champion"&&p.gold));
 assert.equal(m.next.opponent,"Nelson Hysa");
 assert.equal(m.record,"27–0");
});

test("next fight comes from upcoming cards on or after today, else not announced",()=>{
 const n=PA.nextFightFor("agit-kabayel","boxing",data.upcoming,"2026-11-25");
 assert.equal(n.date,"2026-11-28");
 assert.equal(PA.nextFightFor("agit-kabayel","boxing",data.upcoming,"2026-11-29"),null);
});

test("deep links: the route puts the sport's Fighters hub behind a profile and closing lands there",()=>{
 assert.equal(PA.sportOfId("ufc--ilia-topuria"),"mma");
 assert.equal(PA.sportOfId("mma--vadim-nemkov"),"mma");
 assert.equal(PA.sportOfId("mma-contenders--x"),"mma");
 assert.equal(PA.sportOfId("boxing-contenders--andres-cortes"),"boxing");
 assert.equal(PA.sportOfId("boxing--agit-kabayel"),"boxing");
 const navAt=app.indexOf("function navigate(){"),nav=app.slice(navAt,app.indexOf("\ndocument.addEventListener('click'",navAt));
 // A fresh deep link: switch to the profile's sport, render its Fighters hub, then open the profile.
 assert.match(nav,/if\(location\.hash\.startsWith\('#fighter\/'\)\)\{const fid=/);
 assert.match(nav,/if\(pageShown&&main\.children\.length\)\{openFighter\(fid\);return;\}/);
 assert.match(nav,/window\.BEFNSport\.set\(sp\)/);
 assert.match(nav,/key='fighters';pageHash='#fighters';/);
 assert.doesNotMatch(nav,/key='leaderboards'/,"a UFC profile no longer swaps the page behind it");
 // Closing gives the address back to the page behind.
 assert.match(app,/location\.hash\.startsWith\('#fighter\/'\)&&\(!shownFighterId\|\|decodeURIComponent\(location\.hash\.slice\(9\)\)===shownFighterId\)\)history\.replaceState\(null,'',pageHash\|\|'#fighters'\)/,
 "closing resets the address only while it still names the closed profile (a profile opened in the same moment is kept)");
assert.match(app,/function openFighter\(id\)\{shownFighterId=id;/);
 // Data that loads later opens a profile the reader is still waiting for (the deep link or a click).
 assert.match(app,/PA\?\.basicFor\?\.\(id,retry\)/);
});

test("the KO/TKO count in Performance Highlights cannot contradict the fights",()=>{
 const js=fs.readFileSync("assets/fighter-insights.js","utf8");
 assert.match(js,/if\(b\.type==='count'&&\(m\.value<1\|\|m\.value!==countFromRecent\(v3,b\.id\)\)\)return \[\];/);
});

test("a UFC fighter with a Sherdog gym shows one 'Trains at' line, and nobody else gets a placeholder",()=>{
 // data/ufc-fighter-gyms.json (used with Sherdog's permission, 28 Nov 2026): where Sherdog lists the fighter as training now.
 const base=PA.model({id:"x",name:"Islam Makhachev",sport:"Boxing",record:"1-0",latest:[]},null,{...data,today:"2026-11-26"});
 const ufc={...base,ufc:true},other={...base,ufc:false};
 const keep=PA._data.gyms;
 try{
  PA._data.gyms={islammakhachev:["Eagles MMA","American Kickboxing Academy"],janedoe:["Some Gym"]};
  const withGym=PA.shellHTML({id:"x"},ufc,h);
  assert.match(withGym,/<p class="befn-pa-gym">Trains at: <b>Eagles MMA, American Kickboxing Academy<\/b><\/p>/);
  assert.equal((withGym.match(/befn-pa-gym/g)||[]).length,1);
  assert.doesNotMatch(PA.shellHTML({id:"x"},other,h),/befn-pa-gym/,"only UFC profiles show the line");
  assert.doesNotMatch(PA.shellHTML({id:"x"},{...ufc,name:"Nobody Listed"},h),/befn-pa-gym|Trains at/,"no entry: no line, no placeholder");
  PA._data.gyms=null;
  assert.doesNotMatch(PA.shellHTML({id:"x"},ufc,h),/befn-pa-gym/,"data not loaded: no line");
  PA._data.gyms={islammakhachev:["<b>x</b>"]};
  assert.doesNotMatch(PA.shellHTML({id:"x"},ufc,h),/<b>x<\/b>/,"gym names are escaped");
 }finally{PA._data.gyms=keep;}
});

test("the saved gym file is keyed by folded name and every entry is a non-empty list of names",()=>{
 const g=read("data/ufc-fighter-gyms.json");
 assert.equal(g.schema,1);
 assert.ok(Object.keys(g.fighters).length>500);
 for(const [k,v] of Object.entries(g.fighters)){
  assert.match(k,/^[a-z0-9]+$/);
  assert.ok(Array.isArray(v)&&v.length&&v.every(x=>typeof x==="string"&&x.trim()),k);
 }
});
