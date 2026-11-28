import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import readIndex from "./helpers/read-index.cjs";
const html=readIndex();
const js=fs.readFileSync("assets/fighter-insights.js","utf8");
const css=fs.readFileSync("assets/ufc-stat-leaderboards.css","utf8");
test("dedicated UFC statistics route is navigable with a responsive standalone page",()=>{
 // Owner, 24 Nov 2026: the UFC stats leaderboards are MMA's Analysis section (they were a sub-link
 // inside Fighters, PR #329). The #leaderboards route itself still works and belongs to Analysis.
 assert.match(html,/function renderAnalysis\(\)\{if\(activeSport\(\)==='mma'\)return renderLeaderboards\(true\);/);
 // MMA Analysis shows a short top section (champions, finishes, title fights) above the leaderboards (owner, 24 Nov 2026).
 assert.match(html,/data-befn-analysis=\\?"mma\\?"/);
 assert.match(html,/leaderboards:'analysis'/);
 assert.match(html,/const all=\[[^\]]*'leaderboards'/);
 assert.match(html,/leaderboards:renderLeaderboards/);
 assert.match(html,/function renderLeaderboards\((withTop)?\)/);
 assert.match(html,/data-befn-v3-leaderboards aria-live="polite"/);
 assert.match(html,/assets\/ufc-stat-leaderboards\.css/);
 assert.match(css,/@media \(max-width:680px\)/);
 assert.match(css, /\.befn-board-list>li/);
});

// Run the real leaderboard block (renderV3Boards and helpers) in a sandbox.
const block=js.slice(js.indexOf(" // UFC stats leaderboards (stage 5)"),js.indexOf(" function applyV3(f){"));
function sandbox({data=null,fail=false}={}){
 const root={dataset:{},innerHTML:"",querySelector:()=>null,querySelectorAll:()=>[]};
 const ctx={
  document:{querySelector:q=>q==="[data-befn-v3-leaderboards]"?root:null},
  fetch:()=>fail?Promise.reject(new Error("offline")):Promise.resolve({ok:true,json:()=>Promise.resolve(data)}),
  escapeHTML:v=>String(v).replace(/</g,"&lt;").replace(/>/g,"&gt;"),
  byName:new Map([["verifiedathlete",{id:"mma-ufc--verified-athlete"}]]),
  norm:v=>String(v).toLowerCase().replace(/[^a-z0-9]/g,""),
  opponentPhoto:()=>"",ordinal:n=>n+"th",encodeURIComponent,Math,Number,String,Object,Array,
  formData:null // the Form file is loaded elsewhere in the page; these tests run without it
 };
 const api=vm.runInNewContext(block+"\n({renderV3Boards,boardRows,boardValue,boardRowHTML,searchRows,searchHTML,state:boardState,set:d=>{boardData=d}})",ctx);
 return {root,api};
}
const data={schema:1,asOf:"2026-11-14",minFights:3,minCageSeconds:900,
 windows:{last5:"Last 5 fights",l36:"Last 36 months"},
 stats:[{id:"slpm",label:"Strikes landed/min",group:"Striking",unit:"rate",lowerIsBetter:false},
        {id:"sapm",label:"Strikes absorbed/min",group:"Defence",unit:"rate",lowerIsBetter:true}],
 divisions:{welterweight:"Welterweight",lightweight:"Lightweight"},
 fighters:[["verified-athlete","Verified Athlete","welterweight",3,false],
           ["ineligible","Ineligible Athlete","welterweight",null,false],
           ["champ","Champion Athlete","lightweight",0,true],
           ["tie","Tie Athlete","welterweight",null,false]],
 rowFields:["fighter","statFights","slpm","sapm"],
 rows:{l36:[[0,4,6.5,3.1],[1,2,12.2,1.0],[2,6,5.0,1.5],[3,3,5.0,2.2]],last5:[]},
 ratingFields:["fighter","overall","striking","grappling","wrestling","defence","form","statFights"],
 ratings:[[0,90,95,40,50,60,80,4],[2,85,70,60,70,80,90,9]]};

test("leaderboard says so when the statistics file is unavailable",async()=>{
 const {root,api}=sandbox({fail:true});
 api.renderV3Boards();
 await new Promise(r=>setTimeout(r,0));await new Promise(r=>setTimeout(r,0));
 assert.match(root.innerHTML,/not published yet/);
 assert.notEqual(root.dataset.ready,"true");
});
test("rows need the minimum fights, lower-is-better sorts ascending, ties share a rank",()=>{
 const {api}=sandbox();api.set(data);
 api.state.metric="slpm";api.state.window="l36";api.state.division="all";
 let view=api.boardRows();
 assert.deepEqual(view.rows.map(r=>r.f),[0,2,3],"two-fight athlete excluded");
 assert.deepEqual(view.rows.map(r=>r.rank),[1,2,2],"equal values share a rank");
 api.state.metric="sapm";view=api.boardRows();
 assert.equal(view.lower,true);
 assert.deepEqual(view.rows.map(r=>r.f),[2,3,0],"fewest absorbed first");
});
test("division filter re-ranks inside the division",()=>{
 const {api}=sandbox();api.set(data);
 Object.assign(api.state,{metric:"slpm",window:"l36",division:"welterweight"});
 const view=api.boardRows();
 assert.deepEqual(view.rows.map(r=>[r.f,r.rank]),[[0,1],[3,2]]);
});
test("rating boards ask for five full-stat fights and ignore the window",()=>{
 const {api}=sandbox();api.set(data);
 Object.assign(api.state,{metric:"overall",window:"last5",division:"all"});
 const view=api.boardRows();
 assert.equal(view.isRating,true);
 assert.equal(view.minimum,5);
 assert.deepEqual(view.rows.map(r=>r.f),[2],"a four-fight rating is not listed");
});
test("a chosen window rebuilds the Ratings boards from that window's own rows; Form and an older file stay on career",()=>{
 const {api}=sandbox();
 // Window rows use the same fields as the career ratings. Fighter 3 has three fights in the window (below the career five).
 api.set({...data,windows:{last5:"Last 5 fights",l12:"Last 12 months",l36:"Last 36 months",career:"UFC career"},
  ratingWindows:{l12:[[3,66,50,50,50,50,50,3],[0,71,50,50,50,50,50,4]]}});
 Object.assign(api.state,{metric:"overall",window:"l12",ratingWindow:"l12",division:"all"});
 let view=api.boardRows();
 assert.equal(view.ratingWindow,"l12");
 assert.equal(view.minimum,3,"a window needs the stat boards' three fights, not the career five");
 assert.deepEqual(view.rows.map(r=>[r.f,r.v]),[[0,71],[3,66]],"ordered by the window's own score");
 api.state.metric="form";
 assert.equal(api.boardRows().ratingWindow,"career","Form is right now whatever the window");
 api.state.metric="overall";api.state.ratingWindow="career";
 view=api.boardRows();
 assert.equal(view.ratingWindow,"career");
 assert.deepEqual(view.rows.map(r=>r.f),[2],"career rating is unchanged");
 api.set(data);api.state.ratingWindow="l12";
 assert.equal(api.boardRows().ratingWindow,"career","a file without ratingWindows falls back to career");
});
test("the window buttons set the Ratings window and the hub keeps asking for career",()=>{
 assert.match(block,/boardState\.ratingWindow=w\.dataset\.boardWindow/);
 assert.match(block,/window:"l36",ratingWindow:"career"\};\s*return \(metrics/);
 assert.match(block,/ratingWindow:"career",division:"all"/,"the page opens on the career rating");
});
test("rows link to profiles internally and show sample and tags",()=>{
 const {api}=sandbox();api.set(data);
 const html=api.boardRowHTML({f:0,v:6.5,n:4,rank:1},"rate");
 assert.match(html,/<a href="#fighter\/ufc--verified-athlete">Verified Athlete<\/a>/);
 // The division name opens that division in the Fighters hub (owner, 28 Nov 2026).
 assert.match(html,/4 UFC fights with full stats · <a href="#fighters" data-hub-division="welterweight">Welterweight<\/a>/);
 assert.match(html,/#3/);
 assert.match(api.boardRowHTML({f:2,v:5,n:6,rank:1},"rate"),/Champion/);
 assert.equal(api.boardValue(.555,"pct"),"56%");
 assert.equal(api.boardValue(-1.2,"signed"),"−1.20");
 assert.doesNotMatch(block,/<a\s+href=["'](?:https?:|\/\/)/,"no external links");
});
test("search finds fighters below the board minimum and links every one",()=>{
 const {api}=sandbox();api.set(data);
 const found=api.searchRows("inelig");
 assert.deepEqual(found.map(f=>[f.slug,f.score]),[["ineligible",null]]);
 assert.match(api.searchHTML(found),/#fighter\/ufc--ineligible[\s\S]*Unrated/);
 assert.equal(api.searchRows("i"),null,"one letter is not a search");
});
test("only the top thirty rows are displayed",()=>{
 assert.match(block,/view\.rows\.slice\(0,30\)/);
});
