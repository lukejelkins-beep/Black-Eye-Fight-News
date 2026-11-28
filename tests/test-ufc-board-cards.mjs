/* Top 10s leaderboard cards, the men/women scope and the Fighters hub Top 15 sort (owner, 28 Nov 2026). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const js=fs.readFileSync("assets/fighter-insights.js","utf8");
const hub=fs.readFileSync("assets/fighters-hub.js","utf8");
const block=js.slice(js.indexOf(" // UFC stats leaderboards (stage 5)"),js.indexOf(" function applyV3(f){"));
function boards(){
 const ctx={document:{querySelector:()=>null},fetch:()=>new Promise(()=>{}),
  escapeHTML:v=>String(v).replace(/</g,"&lt;").replace(/>/g,"&gt;"),norm:v=>String(v).toLowerCase(),
  opponentPhoto:()=>"",ordinal:n=>n+"th",dec2:v=>v.toFixed(2),formShown:()=>false,formData:null,RATING_HINT:"",
  encodeURIComponent,Math,Number,String,Object,Array,Set};
 return vm.runInNewContext(block+"\n({boardRows,boardCardHTML,boardGridHTML,state:boardState,set:d=>{boardData=d}})",ctx);
}
const data={schema:1,asOf:"2026-11-21",minFights:3,minCageSeconds:900,windows:{l36:"Last 36 months"},
 stats:[{id:"slpm",label:"Strikes landed",group:"Striking",unit:"rate"},{id:"fin",label:"Finishes",group:"Finishing",unit:"pct"},
  {id:"pace",label:"Pace",group:"Pace",unit:"pct"}],
 divisions:{lightweight:"Lightweight","womens-flyweight":"Women's Flyweight"},
 fighters:[["a","Alpha One","lightweight",2,false],["b","Bravo Two","womens-flyweight",0,true],["c","Charlie Three","lightweight",null,false],
  ["d","Delta Four","lightweight",5,false]],
 rowFields:["fighter","statFights","slpm","fin","pace"],
 rows:{l36:[[0,5,6,.5,1],[1,5,7,.4,1],[2,5,5,.3,1],[3,5,4,.2,1]]},
 ratingFields:["fighter","overall","striking","grappling","wrestling","form","results","statFights","overallRank","pool"],
 ratings:[[0,80,.9,.5,.5,null,.5,6,2,"men"],[1,90,.8,.5,.5,null,.5,6,1,"women"],[2,85,.7,.5,.5,null,.5,6,1,"men"],[3,70,.6,.5,.5,null,.5,6,3,"men"]]};

test("men and women scopes keep each pool apart and rank by the stored rank",()=>{
 const b=boards();b.set(data);
 let v=b.boardRows({metric:"overall",window:"l36",division:"men"});
 assert.deepEqual(v.rows.map(r=>[r.f,r.rank]),[[2,1],[0,2],[3,3]]);
 v=b.boardRows({metric:"slpm",window:"l36",division:"women"});
 assert.deepEqual(v.rows.map(r=>r.f),[1]);
});
test("a card shows the top N, links to the full table only when there is more, and tags ranks inside a division",()=>{
 const b=boards();b.set(data);
 const s={metric:"overall",window:"l36",division:"lightweight"};
 const html=b.boardCardHTML("overall",s,2);
 assert.equal((html.match(/<li/g)||[]).length,2);
 assert.match(html,/data-board-open="overall">All 3 ›/);
 assert.match(html,/Charlie Three<\/a><\/span>|Charlie Three<\/a>/);
 assert.match(html,/<i>#2<\/i>/,"official rank tag inside a division");
 assert.doesNotMatch(b.boardCardHTML("overall",s,5),/All 3/,"no 'All' link when every row is shown");
 const hubCard=b.boardCardHTML("overall",s,1,{link:true});
 assert.match(hubCard,/href="#analysis" data-board-division="lightweight" data-board-metric="overall"/);
 assert.doesNotMatch(hubCard,/https?:/);
});
test("the Top 10s grid leads with ratings and folds Finishing and Pace into one group",()=>{
 const b=boards();b.set(data);
 const html=b.boardGridHTML({metric:"overall",window:"l36",division:"all"});
 const heads=[...html.matchAll(/<div class="befn-bgroup-head"><h3>([^<]+)</g)].map(m=>m[1]);
 assert.deepEqual(heads,["Ratings","Striking","Finishing and pace"]);
 assert.match(html,/--cols:3/,"six rating cards sit in two rows of three");
});
test("Top 15 sort: natural order per column, blanks last, champion first by rank",()=>{
 const start=hub.indexOf(" const STAGE_ORDER="),end=hub.indexOf(" // Rating boards shown on each division page");
 const ctx={st:{sort:{key:"rank",dir:1}},window:{},Number};
 const api=vm.runInNewContext(hub.slice(start,end)+"\n({sortLadder,st})",ctx);
 const f=(name,rank,form,overall,formRank,extra={})=>({name,rank,form,overall,formRank,certified:true,stage:"Contender",...extra});
 const list=[f("C",3,70,60,2),f("A",1,null,80,null,{certified:false}),f("Champ",0,90,85,null,{champion:true,stage:"Champion"}),f("B",2,95,70,1)];
 assert.deepEqual(api.sortLadder(list).map(x=>x.name),["Champ","A","B","C"]);
 ctx.st.sort={key:"form",dir:1};
 assert.deepEqual(api.sortLadder(list).map(x=>x.name),["B","Champ","C","A"],"highest Form first, uncertified last");
 ctx.st.sort={key:"form",dir:-1};
 assert.deepEqual(api.sortLadder(list).map(x=>x.name),["C","Champ","B","A"],"reversed, blanks still last");
 ctx.st.sort={key:"formRank",dir:1};
 assert.deepEqual(api.sortLadder(list).map(x=>x.name),["B","C","Champ","A"]);
 ctx.st.sort={key:"name",dir:1};
 assert.deepEqual(api.sortLadder(list).map(x=>x.name),["A","B","C","Champ"]);
});
test("skill and Results boards use the 2-decimal score column when the file has it",()=>{
 const b=boards();
 const fine=JSON.parse(JSON.stringify(data));
 fine.ratingFields.push("strikingScore","grapplingScore","wrestlingScore","resultsScore");
 // two fighters share a whole percentile; the score separates them
 fine.ratings=[[0,80,.9,.5,.5,null,.5,6,2,"men",99.41,50,50,50],[2,85,.9,.5,.5,null,.5,6,1,"men",99.92,50,50,50],[3,70,.6,.5,.5,null,.5,6,3,"men",60.1,50,50,50]];
 b.set(fine);
 const v=b.boardRows({metric:"striking",window:"l36",division:"men"});
 assert.deepEqual(v.rows.map(r=>[r.f,r.rank,r.v]),[[2,1,99.92],[0,2,99.41],[3,3,60.1]]);
 assert.equal(v.unit,"score","printed as a plain number to 2 decimals, not '99th'");
 const html=b.boardCardHTML("striking",{metric:"striking",window:"l36",division:"men"},3);
 assert.match(html,/>99\.92</);assert.doesNotMatch(html,/99th/);
 b.set(data);
 assert.equal(b.boardRows({metric:"striking",window:"l36",division:"men"}).unit,"ordinal","an older file keeps the whole percentile");
});
