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
  "assets/fighter-insights.js":"console.log('reviewed fighters v2')",
  "assets/ufc-prospect-contender.js":"console.log('correct classifier')",
  "assets/fighter-power.css":".fighter { display:block }",
  "data/ufc-prospect-profiles.json":'{"fighters":{"fighter":{"name":"Sample"}}}'
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
 assert(result.ok);assert.equal(result.checked,5);assert.deepEqual(result.stale,[]);
});
test("new JSON with old HTML is rejected before browser checks",async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 const published={...f.contents,"index.html":"<html>OLD frontend without recent table marker</html>"};
 const result=await checkDeploymentFreshness({base:"https://example.org",root:f.root,
  fetcher:serve(published),files:expectedLiveFiles(f.root)});
 assert(!result.ok);assert.deepEqual(result.stale.map(x=>x.file),["index.html"]);
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
