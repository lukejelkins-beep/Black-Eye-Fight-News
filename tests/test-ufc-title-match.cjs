const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const html=fs.readFileSync("index.html","utf8");
const start=html.indexOf("function befnDivisionKey(");
const stop=html.indexOf("function openFighter(",start);
assert(start>=0&&stop>start,"V3 championship helper is present");
const champions={mma:[
 {name:"Carlos Ulberg",division:"Light heavyweight",days:210,start:"11 Apr 2026",defences:0},
 {name:"Kayla Harrison",division:"Women’s bantamweight",days:518,start:"7 Jun 2025",defences:0},
 {name:"Natália Silva",division:"Women’s flyweight",days:35,start:"3 Oct 2026",defences:0},
 {name:"Mackenzie Dern",division:"Women’s strawweight",days:378,start:"25 Oct 2025",defences:1}
]};
const context={D:{champions},esc:x=>String(x).replace(/[&<>"]/g,"")};
const {befnTitleBelts,befnReign}=vm.runInNewContext(
 html.slice(start,stop)+"\n({befnTitleBelts,befnReign})",context);
for(const [name,division] of [
 ["Carlos Ulberg","Light Heavyweight"],
 ["Kayla Harrison","Women's Bantamweight"],
 ["Natália Silva","Women's Flyweight"],
 ["Mackenzie Dern","Women's Strawweight"]
]){
 const fighter={name,division,sport:"MMA",category:"Champion"};
 const belts=befnTitleBelts(fighter),reign=befnReign(fighter);
 assert.match(belts,/Documented UFC championships/,"belt missing for "+name);
 assert.match(reign,/title reign/,"reign missing for "+name);
 const duplicates=(belts.match(/class="befn-title-belt"/g)||[]).length;
 assert.equal(duplicates,1,"duplicate championship belts for "+name);
}
assert.equal(befnTitleBelts({name:"Carlos Ulberg",division:"Heavyweight",sport:"MMA"}),"",
 "former/unverified division must not be displayed as current title");
assert.equal(befnTitleBelts({name:"Kayla Harrison",division:"Women's Bantamweight",sport:"Boxing"}),"",
 "boxing must never show UFC belts");
console.log("PASS V3 UFC champion division normalization and documented belt/reign guard");
