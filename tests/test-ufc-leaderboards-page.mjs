import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const html=fs.readFileSync("index.html","utf8");
const js=fs.readFileSync("assets/fighter-insights.js","utf8");
const css=fs.readFileSync("assets/ufc-stat-leaderboards.css","utf8");
test("dedicated UFC statistics route is navigable with a responsive standalone page",()=>{
 assert.match(html,/href="#leaderboards" data-nav="leaderboards"/);
 assert.match(html,/leaderboards:renderLeaderboards/);
 assert.match(html,/function renderLeaderboards\(\)/);
 assert.match(html,/data-befn-v3-leaderboards aria-live="polite"/);
 assert.match(html,/assets\/ufc-stat-leaderboards\.css/);
 assert.match(css,/@media \(max-width:680px\)/);
 assert.match(css, /\.befn-board-list>li/);
});
function view(data){
 const select={value:"slpm",handler:null,addEventListener(name,fn){this.handler=fn}};
 const results={innerHTML:""};
 const root={dataset:{},innerHTML:"",querySelector(q){
  if(q==="select")return select;
  if(q===".befn-v3-board-results")return results;
  return null;
 }};
 const source=js.slice(js.indexOf(" function renderV3Boards(){"),
  js.indexOf(" function applyV3(f){"));
 assert.match(source,/function renderV3Boards/);
 const script=source+"\nrenderV3Boards";
 const ctx={
  document:{querySelector:()=>root},
  ufcV3:data,
  escapeHTML:v=>String(v).replace(/</g,"&lt;").replace(/>/g,"&gt;"),
  byName:new Map(),
  norm:v=>String(v).toLowerCase().replace(/[^a-z0-9]/g,""),
  isReviewedUfc:()=>false,
  metricValue:(v)=>v.value.toFixed(1),
  encodeURIComponent
 };
 const render=vm.runInNewContext(script,ctx);
 return {root,results,select,render,context:ctx};
}
test("leaderboard remains unpublished without verified schema-four data",()=>{
 const d=view(null);d.render();
 assert.match(d.root.innerHTML,/not published yet/);
 assert.notEqual(d.root.dataset.ready,"true");
});
test("top-30 view suppresses rows with fewer than three observed fights",()=>{
 const data={schema:4,population:887,asOf:"2026-11-13",boards:[
  {id:"slpm",label:"Significant strikes per minute",eligible:2,type:"rate",
   leaders:[
    {name:"Verified Athlete",value:6.5,bouts:3,rank:1},
    {name:"Ineligible Athlete",value:12.2,bouts:2,rank:2},
    {name:"Unknown Rank",value:9.1,bouts:4,rank:null}
   ]},
  {id:"sapm",label:"Sig strikes absorbed/min",eligible:1,type:"rate",leaders:[
    {name:"Defensive Athlete",value:1.1,bouts:5,rank:1}
   ]}
 ]};
 const d=view(data);
 d.render();
 assert.match(d.root.innerHTML,/Choose a statistic/);
 assert.match(d.results.innerHTML,/Verified Athlete/);
 assert.doesNotMatch(d.results.innerHTML,/Ineligible Athlete|Unknown Rank/);
 assert.match(d.results.innerHTML,/3 recorded UFC bouts/);
 d.select.value="sapm";d.select.handler();
 assert.match(d.results.innerHTML,/Defensive Athlete/);
 assert.match(d.results.innerHTML,/Lower is better/);
 assert.doesNotMatch(d.results.innerHTML,/Verified Athlete/);
});
test("all displayed board rows must be sampled, finite and ranked",()=>{
 assert.match(js,/row.bouts>=3&&row.bouts<=5/);
 assert.match(js,/Number.isFinite\(row.value\)&&Number.isInteger\(row.rank\)/);
 assert.match(js,/eligible.slice\(0,30\)/);
});
