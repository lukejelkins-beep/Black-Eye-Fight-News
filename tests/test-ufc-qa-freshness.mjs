import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {checkDeploymentFreshness,expectedLiveFiles} from "../scripts/ufc-qa-freshness.mjs";

function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"befn-live-qa-"));
 const contents={
  "index.html":"<html>fresh reviewed UFC profile dialog</html>",
  "sw.js":"// network-first shell",
  "assets/fighter-insights.js":"console.log('reviewed fighters v2')",
  "assets/fighter-power-index.js":"console.log('power index')",
  "assets/ufc-prospect-contender.js":"console.log('correct classifier')",
  "assets/fighter-power.css":".fighter { display:block }",
  "data/ufc-prospect-profiles.json":'{"fighters":{"fighter":{"name":"Sample"}}}',
  "data/ufc-champion-profiles.json":'{"fighters":{}}',
  "data/ufc-contender-profiles.json":'{"fighters":{}}',
  "data/ufc-roster-profiles.json":'{"fighters":{}}',
  "data/ufc-fighter-v3.json":'{"schema":4,"scope":"ufc-only","fighters":{}}'
 };
 for(const [file,body] of Object.entries(contents)){
  fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});
  fs.writeFileSync(path.join(root,file),body);
 }
 return {root,contents};
}
function serve(contents){
 return async url=>{
  const file=new URL(url).pathname.slice(1);
  return Object.hasOwn(contents,file)?
   new Response(contents[file],{status:200}):
   new Response("Not Found",{status:404});
 };
}
test("all matching deployed source assets pass",async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 const result=await checkDeploymentFreshness({base:"https://example.org",root:f.root,
  fetcher:serve(f.contents),files:expectedLiveFiles(f.root)});
 assert(result.ok);assert.equal(result.checked,11);assert.deepEqual(result.stale,[]);
});
test("new JSON with old HTML is rejected before browser checks",async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 const published={...f.contents,"index.html":"<html>OLD frontend without recent table marker</html>"};
 const result=await checkDeploymentFreshness({base:"https://example.org",root:f.root,
  fetcher:serve(published),files:expectedLiveFiles(f.root)});
 assert(!result.ok);assert.deepEqual(result.stale.map(x=>x.file),["index.html"]);
});
test("old UFC V3 performance JSON fails closed even if HTML and reviewed cohorts are current",async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 const stale={...f.contents,"data/ufc-fighter-v3.json":'{"schema":3,"fighters":{}}'};
 const result=await checkDeploymentFreshness({base:"https://example.org",root:f.root,
  fetcher:serve(stale),files:expectedLiveFiles(f.root)});
 assert(!result.ok);
 assert.deepEqual(result.stale.map(x=>x.file),["data/ufc-fighter-v3.json"]);
});
test("old classifier JS while JSON and HTML are current is rejected",async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 const published={...f.contents,"assets/ufc-prospect-contender.js":"old classifier"};
 const result=await checkDeploymentFreshness({base:"https://example.org",root:f.root,
  fetcher:serve(published),files:expectedLiveFiles(f.root)});
 assert(!result.ok);assert.deepEqual(result.stale.map(x=>x.file),["assets/ufc-prospect-contender.js"]);
});
test("missing deployed profile data fails accurately",async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 const published={...f.contents};delete published["data/ufc-prospect-profiles.json"];
 const result=await checkDeploymentFreshness({base:"https://example.org",root:f.root,
  fetcher:serve(published),files:expectedLiveFiles(f.root)});
 assert(!result.ok);assert.equal(result.stale[0].reason,"HTTP 404");
});
test("only HTTPS production sites can qualify",async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 await assert.rejects(()=>checkDeploymentFreshness({base:"http://example.org",
  root:f.root,fetcher:serve(f.contents)}),/HTTPS/);
});

test("missing core source file cannot silently pass release QA",async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 fs.rmSync(path.join(f.root,"index.html"));
 assert.throws(()=>expectedLiveFiles(f.root),/REQUIRED UFC RELEASE FILE MISSING.*index\.html/);
});
test("an empty file list is not a passing comparison",async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 await assert.rejects(()=>checkDeploymentFreshness({base:"https://example.org",root:f.root,
  fetcher:serve(f.contents),files:[]}),/No production files/);
});
test("stale PWA worker is detected independently of fresh fighter data",async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 const published={...f.contents,"sw.js":"// stale cache-first worker"};
 const result=await checkDeploymentFreshness({base:"https://example.org",root:f.root,
  fetcher:serve(published),files:expectedLiveFiles(f.root)});
 assert(!result.ok);assert.deepEqual(result.stale.map(x=>x.file),["sw.js"]);
});
