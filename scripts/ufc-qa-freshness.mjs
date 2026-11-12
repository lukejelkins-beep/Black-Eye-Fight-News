/* Compare the actual public static assets against the checkout under test.
 * Correct JSON + STALE JavaScript or HTML can yield a false-positive source
 * verdict, so every required frontend asset is independently hashed.
 */
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";

export const CRITICAL_PRODUCTION_FILES=Object.freeze([
 "index.html",
 "sw.js",
 "assets/fighter-insights.js",
 "assets/ufc-prospect-contender.js",
 "assets/fighter-power-index.js",
 "assets/fighter-power.css",
 "data/ufc-champion-profiles.json",
 "data/ufc-ranked-profiles.json",
 "data/ufc-contender-profiles.json",
 "data/ufc-prospect-profiles.json",
 "data/ufc-roster-profiles.json"
]);
export const REQUIRED_PRODUCTION_FILES=Object.freeze([
 "index.html","sw.js","assets/fighter-insights.js",
 "assets/ufc-prospect-contender.js","assets/fighter-power-index.js",
 "assets/fighter-power.css","data/ufc-champion-profiles.json",
 "data/ufc-contender-profiles.json","data/ufc-prospect-profiles.json",
 "data/ufc-roster-profiles.json"
]);
const sha=x=>createHash("sha256").update(x).digest("hex");
export function expectedLiveFiles(root){
 const missing=REQUIRED_PRODUCTION_FILES.filter(file=>
  !fs.existsSync(path.join(root,file)));
 if(missing.length)throw new Error("REQUIRED UFC RELEASE FILE MISSING FROM GITHUB CHECKOUT: "+missing.join(", "));
 return CRITICAL_PRODUCTION_FILES.filter(file=>
  fs.existsSync(path.join(root,file)));
}
export async function checkDeploymentFreshness({base,root,fetcher=fetch,files=expectedLiveFiles(root)}){
 if(!/^https:\/\//.test(base))throw new Error("Production QA must use HTTPS");
 if(!Array.isArray(files)||!files.length)throw new Error("No production files were provided for QA");
 const checked=await Promise.all(files.map(async file=>{
  const local=fs.readFileSync(path.join(root,file));
  const url=base.replace(/\/+$/,"")+"/"+file+"?befn_qa="+Date.now();
  try{
   const response=await fetcher(url,{
    headers:{"Cache-Control":"no-cache","Pragma":"no-cache"},
    signal:AbortSignal.timeout(12000)
   });
   if(!response.ok)return {file,ok:false,reason:"HTTP "+response.status};
   const remote=Buffer.from(await response.arrayBuffer());
   if(sha(local)!==sha(remote))
    return {file,ok:false,reason:"deployed file differs from repository HEAD"};
   return {file,ok:true};
  }catch(err){
   return {file,ok:false,reason:String(err?.message||err).slice(0,160)};
  }
 }));
 return {ok:checked.every(x=>x.ok),checked:checked.length,stale:checked.filter(x=>!x.ok)};
}
