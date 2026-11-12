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
// Local checks are fast pre-publication QA. Supplying BEFN_PROFILE_QA_BASE
// verifies the real public deployment, not a local clone of the repository.
const liveBase=String(process.env.BEFN_PROFILE_QA_BASE||"").trim().replace(/\/+$/,"");
if(liveBase&&!/^https:\/\//i.test(liveBase))throw new Error("Live QA requires HTTPS");
const base=liveBase||"http://127.0.0.1:"+port;
const isLive=!!liveBase;
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
const server=isLive?null:spawn("python3",["-m","http.server",String(port),"--bind","127.0.0.1"],
 {cwd:root,stdio:"ignore"});
const failures=[],warnings=[],photos=[];
let checkedCount=0,readyForBrowser=false;
let browser;
const fingerprint=f=>JSON.stringify({
 id:f?.id,name:f?.name,record:f?.record,division:f?.division,
 category:f?.category,ufcRecord:f?.ufcRecord,latest:f?.latest,
 verifiedStats:f?.verifiedStats,credentials:f?.credentials,
 ranking:f?.ranking,review:f?.review
});
async function ready(){
 for(let i=0;i<(isLive?8:40);i++){
  try{
   const response=await fetch(base+"/index.html?befn_qa="+Date.now(),{
    headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error("Site HTTP "+response.status);
   if(!isLive)return;
   const missing=[];
   // An up-to-date JSON response can coexist with a stale CDN/HTML shell.
   // Require the actual page HTML to include the current, source-scoped
   // fight-history rendering and honest photo fallback code.
   const pageMarkup=await response.text();
   for(const required of ["data-befn-recent-results","fighterPortraitFallback",
     "befn-verified-fighter-portrait-fallback-v1"]){
    if(!pageMarkup.includes(required))missing.push("index.html missing "+required);
   }
   for(const cohort of cohorts){
    const file="data/ufc-"+cohort+"-profiles.json";
    const full=path.join(root,file);
    if(!fs.existsSync(full))continue;
    const local=JSON.parse(fs.readFileSync(full,"utf8"));
    const liveResponse=await fetch(base+"/"+file+"?befn_qa="+Date.now(),{
      headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(12000)});
    if(!liveResponse.ok){missing.push(file+" (HTTP "+liveResponse.status+")");continue}
    const published=await liveResponse.json().catch(()=>null);
    for(const [key,f] of Object.entries(local.fighters||{})){
     if(fingerprint(published?.fighters?.[key])!==fingerprint(f))
      missing.push(file+"/"+key);
    }
   }
   if(!missing.length){console.log("Production cohort freshness confirmed for "+profiles.length+" fighters");return}
   if(i===7)throw Error("PRODUCTION OUT OF DATE: "+missing.slice(0,12).join(", ")+
    (missing.length>12?" and "+(missing.length-12)+" more":""));
   console.log("Waiting for Render production publication: "+missing.length+" missing/stale profiles");
  }catch(err){
   if(i===7)throw err;
   if(i>0&&i%4===0)console.warn("Production readiness check:",String(err?.message||err));
  }
  await delay(isLive?18000:250);
 }
 throw new Error("Site preview server did not start");
}
function pushError(scope,error){failures.push(scope+": "+String(error?.message||error))}
async function checkProfile(page,profile,screen){
 const scope=screen+" | "+profile.name;
 checkedCount++;
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
  // Wait briefly for portrait requests to settle. A cached or slow image
  // must not be declared broken just because it was read instantly.
  if(isLive)await page.waitForFunction(()=>{
    const img=document.querySelector("#fighterDialog .dialog-bio img");
    return !img||img.complete;
   },null,{timeout:2500}).catch(()=>{});
  const details=await page.evaluate(id=>{
   const d=document.querySelector("#fighterDialog"),f=window.COMBAT_DATA?.fighters?.find(x=>x.id===id);
   const ins=d?.querySelector(".befn-profile-insights");
   const title=d?.querySelector(".dialog-top h2")?.textContent?.trim();
   const recentRows=[...(d?.querySelectorAll("table[data-befn-recent-results] tbody tr")||[])]
    .map(tr=>[...tr.querySelectorAll("td")].map(td=>td.textContent.trim()));
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
    metrics,recentRows,credentialsVisible:!!credential,postfightCells,coverageVisible,
    ratingSource:ratingSource?.getAttribute("href")||"",
    ratingSourceText:ins?.querySelector(".befn-rating-source-note")?.textContent||"",
    rect:rect&&{left:rect.left,right:rect.right,width:rect.width},
    rootWidth,viewportOverflow,
    dialogClip:!!rect&&(rect.left< -4||rect.right>innerWidth+4),
    contentOverflow:!!content&&content.scrollWidth>content.clientWidth+4,
    portraitStatus:(()=>{
     const frame=d?.querySelector(".dialog-bio [data-fighter-portrait]");
     const im=frame?.querySelector("img");
     const fallback=frame?.querySelector(".befn-portrait-fallback");
     const styles=fallback?getComputedStyle(fallback):null;
     const shown=!!fallback&&styles?.display!=="none"&&styles?.visibility!=="hidden"&&
      fallback.getBoundingClientRect().width>0&&fallback.getBoundingClientRect().height>0;
     return {imgPresent:!!im,imageLoaded:!!im&&im.complete&&im.naturalWidth>0&&
      frame.classList.contains("is-loaded"),fallbackVisible:shown,
      fallbackLabel:fallback?.textContent?.trim()||"",
      state:frame?.dataset.portraitState||"missing",framePresent:!!frame,
      photoVerified:!!f?.photoRightsVerified};
    })(),
    closeVisible:!!d?.querySelector("button#closeFighter"),
    renderedClassification:ins?.querySelector(".befn-scout-classification")?.textContent||"",
    sourceLinks:[...(ins?.querySelectorAll(".befn-rating-source-note a,.befn-credential-list a")||[])].map(x=>x.href),
    clippedElements:[...(ins?.querySelectorAll(".befn-profile-block h3,.befn-classifier-indices strong,.dialog-content > h3")||[])]
      .filter(x=>{const c=getComputedStyle(x);return (x.scrollWidth>x.clientWidth+5&&c.overflowX==="hidden")||
       (x.scrollHeight>x.clientHeight+5&&c.overflowY==="hidden")})
      .map(x=>x.tagName+":"+x.textContent.trim().slice(0,45)).slice(0,8)
   };
  },profile.id);
  assert(details.identity,"profile did not hydrate in shared data");
  assert.equal(details.title,profile.name,"dialog title wrong");
  assert.equal(details.record,profile.record,"record mismatch");
  assert.equal(details.division,profile.division,"division mismatch");
  // Incomplete reviewed roster entries remain visible but must NOT receive
  // an unsourced prospect/contender label. Their UI category is Unassessed.
  const record=profile.ufcRecord||{};
  const boutCount=(record.wins||0)+(record.losses||0)+(record.draws||0)+(record.noContests||0);
  const expectedCategory=profile.category==="Roster"&&
   (!record.complete||boutCount<2||(profile.latest||[]).length<2)?
   "Unassessed":profile.category;
  assert.equal(details.category,expectedCategory,"classification display mismatch");
  assert.equal(details.metrics,5,"expected exactly 5 rating rows");
  // Profile details may contain OTHER tables (including post-fight metrics).
  // Only the uniquely annotated fight-history table may be counted and audited.
  const sourcedRows=profile.latest.map(x=>[x.date,x.opponent,x.outcome,x.method].map(String));
  assert.deepEqual(details.recentRows,sourcedRows,
    "published fight-by-fight history differs from the individually sourced UFC results");
  assert(details.credentialsVisible,"credentials or missing-credential statement absent");
  if(expectedPostfight.has(normalized(profile.name))){
   assert.equal(details.postfightCells,11,"incomplete UFC post-fight metrics panel");
   assert(details.coverageVisible,"missing clear sample versus career totals label");
  }
  assert(details.closeVisible,"dialog close action missing");
  assert(!details.viewportOverflow,"document overflows horizontally");
  assert(!details.dialogClip,"fighter dialog extends beyond viewport");
  assert(!details.contentOverflow,"fighter profile content clips horizontally");
  if(isLive){
   assert.deepEqual(details.clippedElements,[],"important profile labels visibly clipped");
   for(const url of details.sourceLinks)
    assert(/^https:\/\//.test(url),"non-HTTPS source link in rendered fighter profile");
   assert(details.renderedClassification.includes(expectedCategory),
    "scouting classification missing in live profile dialog");
  }
  if(profile.verifiedStats)assert(details.ratingSource.startsWith("https://"),
    "verified statistical score lacks source link");
  if(!profile.verifiedStats)assert(/insufficient verified/i.test(details.ratingSourceText),
    "missing statistics must be labelled unrated");
  const portrait=details.portraitStatus;
  assert(portrait?.framePresent,"fighter portrait frame missing");
  assert(portrait.state==="image"||portrait.state==="fallback",
    "fighter portrait in an invalid display state");
  assert(portrait.imageLoaded||portrait.fallbackVisible,
    "BROKEN PORTRAIT UI: neither image nor fallback is visible");
  if(!portrait.imageLoaded){
   assert(portrait.fallbackVisible&&/Photo unavailable/i.test(portrait.fallbackLabel),
    "missing fighter image without labelled fallback");
   photos.push(scope+" | clear photo-unavailable fallback, portrait sourcing pending");
   if(portrait.photoVerified)pushError(scope,
    "VERIFIED PORTRAIT UNAVAILABLE: sourced, licensed image did not load");
  }
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
 readyForBrowser=true;
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 for(const [screen,viewport] of [
  ["desktop",{width:1366,height:900}],
  ["mobile",{width:390,height:844}]
 ]){
  const context=await browser.newContext({
   viewport,deviceScaleFactor:1,locale:"en-AU",timezoneId:"Australia/Melbourne",
   serviceWorkers:"block",extraHTTPHeaders:{"Cache-Control":"no-cache"}
  });
  const page=await context.newPage();
  page.setDefaultTimeout(12000);
  const pageErrors=[];
  page.on("pageerror",e=>pageErrors.push(e.message));
  // Cache-bust the HTML itself, not only the JSON fetches. This is critical
  // on Render's CDN: old HTML and fresh fighter JSON can otherwise mix.
  const freshEntry=base+"/?befn_profile_qa="+Date.now()+"#fighters";
  await page.goto(freshEntry,{waitUntil:"domcontentloaded",timeout:30000});
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
}catch(error){
 pushError(isLive?"Production readiness or live rendering":"Local browser rendering",error);
}finally{
 if(browser)await browser.close();
 if(server)server.kill("SIGTERM");
}
const report={
 checkedAt:new Date().toISOString(),
 description:isLive?"Automated checks against public production: source consistency, DOM, images, overflow and screenshots. Not independent factual or human visual approval.":"Local preview QA: DOM and screenshots, not independent human visual approval",
 mode:isLive?"production":"local",baseUrl:base,
 fighters:profiles.length,viewports:["desktop 1366px","mobile 390px"],
 expectedChecks:profiles.length*2,checks:checkedCount,readyForBrowser,failures,warnings,
 portraitCoveragePending:photos,
 sourceAccuracy:"Matching GitHub records proves publication consistency, not independent truth. Verify source URLs, portrait identity and image rights separately."
};
fs.writeFileSync(path.join(screenshots,"report.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({checked:report.checks,errors:failures.length,photoWarnings:photos.length,
 warnings:warnings.length},null,2));
for(const item of failures)console.error("FAIL",item);
for(const item of warnings)console.warn("NOTE",item);
if(photos.length)console.warn("Unverified or unavailable portraits show accessible fallbacks on",photos.length,"views. Portrait sourcing is still pending; inspect screenshots.");
if(failures.length)process.exitCode=1;
