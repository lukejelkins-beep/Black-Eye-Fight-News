/* Browser-level UFC profile QA for every reviewed athlete and both breakpoints.
 * Checks the actual DOM (not just JSON), captures screenshots, and fails on
 * missing profile content, broken navigation or horizontal clipping.
 * Fighter-photo network failures are reported separately: external CDNs may
 * block CI, and a passing test must never imply that reuse rights are cleared.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import {chromium} from "playwright";

const root=process.cwd();
const port=Number(process.env.BEFN_PROFILE_QA_PORT||8765);
const base="http://127.0.0.1:"+port;
const screenshots=path.join(root,"qa/ufc-profile-screenshots");
const cohorts=["champion","ranked","contender","prospect","roster"];
const profileStatsSource="data/ufc-postfight-metrics.json";
const normalized=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]/g,"");
const expectedPostfight=new Set();
if(fs.existsSync(profileStatsSource)){
 const raw=JSON.parse(fs.readFileSync(profileStatsSource,"utf8"));
 if(raw.schema===1&&raw.scope==="ufc-only"){
  for(const f of Object.values(raw.fighters||{}))
   if(f?.name&&f.trackedBouts>0)expectedPostfight.add(normalized(f.name));
 }
}
const profiles=[];
for(const cohort of cohorts){
 const file=path.join(root,"data/ufc-"+cohort+"-profiles.json");
 if(!fs.existsSync(file))continue;
 const data=JSON.parse(fs.readFileSync(file,"utf8"));
 for(const f of Object.values(data.fighters||{}))profiles.push(f);
}
assert(profiles.length>=11,"UFC champion baseline missing");
fs.mkdirSync(screenshots,{recursive:true});
const slug=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const safe=x=>slug(x).slice(0,90)||"unknown";
const server=spawn("python3",["-m","http.server",String(port),"--bind","127.0.0.1"],
 {cwd:root,stdio:"ignore"});
const failures=[],warnings=[],photos=[];
let browser;
async function ready(){
 for(let i=0;i<40;i++){
  try{const x=await fetch(base+"/index.html");if(x.ok)return}catch{}
  await delay(250);
 }
 throw new Error("Local site preview server did not start");
}
function pushError(scope,error){failures.push(scope+": "+String(error?.message||error))}
async function checkProfile(page,profile,screen){
 const scope=screen+" | "+profile.name;
 try{
  await page.evaluate(id=>{
   const hash="#fighter/"+encodeURIComponent(id);
   if(location.hash!==hash)location.hash=hash;
   else window.dispatchEvent(new Event("hashchange"));
  },profile.id);
  const dialog=page.locator("#fighterDialog");
  await dialog.waitFor({state:"visible",timeout:12000});
  await page.waitForFunction(id=>{
   const d=document.querySelector("#fighterDialog");
   return !!d?.open&&!!d.querySelector(".befn-profile-insights[data-befn-profile='"+CSS.escape(id)+"']");
  },profile.id,{timeout:12000});
  if(expectedPostfight.has(normalized(profile.name))){
   await page.waitForFunction(id=>
    !!document.querySelector("#fighterDialog .befn-profile-block[data-befn-postfight='"+CSS.escape(id)+"']"),
    profile.id,{timeout:12000});
  }
  const details=await page.evaluate(id=>{
   const d=document.querySelector("#fighterDialog"),f=window.COMBAT_DATA?.fighters?.find(x=>x.id===id);
   const ins=d?.querySelector(".befn-profile-insights");
   const title=d?.querySelector(".dialog-top h2")?.textContent?.trim();
   const recent=d?.querySelectorAll(".data-table tbody tr").length??0;
   const metrics=ins?.querySelectorAll(".befn-power-metric").length??0;
   const credential=ins?.querySelector(".befn-credential-list,.befn-credential-empty");
   const ratingSource=ins?.querySelector(".befn-rating-source-note a");
   const postfight=ins?.querySelector(".befn-profile-block[data-befn-postfight]");
   const postfightCells=postfight?.querySelectorAll(".befn-postfight-stat")?.length??0;
   const coverageVisible=postfight?.textContent?.includes("tracked-sample totals, not career totals")??false;
   const rect=d?.getBoundingClientRect();
   const rootWidth=document.documentElement.clientWidth;
   const content=d?.querySelector(".dialog-content");
   const viewportOverflow=document.documentElement.scrollWidth>rootWidth+4;
   return {
    identity:!!f,title,record:f?.record,division:f?.division,category:f?.category,
    metrics,recent,credentialsVisible:!!credential,postfightCells,coverageVisible,
    ratingSource:ratingSource?.getAttribute("href")||"",
    ratingSourceText:ins?.querySelector(".befn-rating-source-note")?.textContent||"",
    rect:rect&&{left:rect.left,right:rect.right,width:rect.width},
    rootWidth,viewportOverflow,
    dialogClip:!!rect&&(rect.left< -4||rect.right>innerWidth+4),
    contentOverflow:!!content&&content.scrollWidth>content.clientWidth+4,
    portrait:!!d?.querySelector(".dialog-bio img"),
    portraitStatus:(()=>{const im=d?.querySelector(".dialog-bio img");return im?{src:im.src,loaded:im.complete&&im.naturalWidth>0}:null})(),
    closeVisible:!!d?.querySelector("button#closeFighter")
   };
  },profile.id);
  assert(details.identity,"profile did not hydrate in shared data");
  assert.equal(details.title,profile.name,"dialog title wrong");
  assert.equal(details.record,profile.record,"record mismatch");
  assert.equal(details.division,profile.division,"division mismatch");
  assert.equal(details.category,profile.category,"category mismatch");
  assert.equal(details.metrics,5,"expected exactly 5 rating rows");
  assert.equal(details.recent,profile.latest.length,"recent results do not match sourced data");
  assert(details.credentialsVisible,"credentials or missing-credential statement absent");
  if(expectedPostfight.has(normalized(profile.name))){
   assert.equal(details.postfightCells,11,"incomplete UFC post-fight metrics panel");
   assert(details.coverageVisible,"missing clear sample versus career totals label");
  }
  assert(details.closeVisible,"dialog close action missing");
  assert(!details.viewportOverflow,"document overflows horizontally");
  assert(!details.dialogClip,"fighter dialog extends beyond viewport");
  assert(!details.contentOverflow,"fighter profile content clips horizontally");
  if(profile.verifiedStats)assert(details.ratingSource.startsWith("https://"),
    "verified statistical score lacks source link");
  if(!profile.verifiedStats)assert(/insufficient verified/i.test(details.ratingSourceText),
    "missing statistics must be labelled unrated");
  if(!details.portraitStatus?.loaded)photos.push(scope+" | image missing/not loaded in CI");
  await page.screenshot({path:path.join(screenshots,safe(profile.name)+"-"+screen+".png"),
   animations:"disabled",timeout:12000});
  // Verify the close control is clickable, not merely present.
  await page.locator("#closeFighter").click({timeout:5000});
  await dialog.waitFor({state:"hidden",timeout:5000});
 }catch(error){
  pushError(scope,error);
  try{await page.screenshot({path:path.join(screenshots,"FAILED-"+safe(profile.name)+"-"+screen+".png"),
   animations:"disabled",timeout:6000})}catch{}
  await page.evaluate(()=>document.querySelector("#fighterDialog")?.close()).catch(()=>{});
 }
}
try{
 await ready();
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 for(const [screen,viewport] of [
  ["desktop",{width:1366,height:900}],
  ["mobile",{width:390,height:844}]
 ]){
  const context=await browser.newContext({
   viewport,deviceScaleFactor:1,locale:"en-AU",timezoneId:"Australia/Melbourne"
  });
  const page=await context.newPage();
  page.setDefaultTimeout(12000);
  const pageErrors=[];
  page.on("pageerror",e=>pageErrors.push(e.message));
  await page.goto(base+"/#fighters",{waitUntil:"domcontentloaded",timeout:30000});
  await page.waitForFunction(ids=>
   ids.every(id=>window.COMBAT_DATA?.fighters?.some(f=>f.id===id)),
   profiles.map(x=>x.id),{timeout:30000});
  const fighterGrid=page.locator("#fighterGrid");
  await fighterGrid.waitFor({state:"visible",timeout:12000});
  // Open a reviewed card through the live Fighter Profiles interface.
  await page.evaluate(()=>{document.querySelector('[data-nav="fighters"]')?.click()});
  await page.waitForTimeout(350);
  if(!await fighterGrid.count())pushError(screen,"Fighter Profiles grid missing");
  for(const f of profiles)await checkProfile(page,f,screen);
  if(pageErrors.length)warnings.push(screen+" | console script errors: "+pageErrors.slice(0,4).join(" | "));
  await context.close();
 }
}finally{
 if(browser)await browser.close();
 server.kill("SIGTERM");
}
const report={
 checkedAt:new Date().toISOString(),
 description:"Automated desktop/mobile DOM and screenshot QA, not an independent human visual approval",
 fighters:profiles.length,viewports:["desktop 1366px","mobile 390px"],
 checks:profiles.length*2,failures,warnings,
 portraitNetworkWarnings:photos,
 sourceAccuracy:"Source facts and image rights require separate AI/human review"
};
fs.writeFileSync(path.join(screenshots,"report.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({checked:report.checks,errors:failures.length,photoWarnings:photos.length,
 warnings:warnings.length},null,2));
for(const item of failures)console.error("FAIL",item);
for(const item of warnings)console.warn("NOTE",item);
if(photos.length)console.warn("Portrait CDN/reuse checks pending on",photos.length,"views; inspect uploaded screenshots.");
if(failures.length)process.exitCode=1;
