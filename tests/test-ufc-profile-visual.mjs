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
import {checkDeploymentFreshness} from "../scripts/ufc-qa-freshness.mjs";

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
const v3SourcePath="data/ufc-fighter-v3.json";
const verifiedV3=fs.existsSync(v3SourcePath)?
 JSON.parse(fs.readFileSync(v3SourcePath,"utf8")):null;
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
   if(isLive){
    const result=await checkDeploymentFreshness({base,root});
    if(result.ok){
     console.log("Production HTML, JS, CSS and cohort data are current:",
      result.checked,"assets match this GitHub checkout");
     return;
    }
    throw Error("PRODUCTION OUT OF DATE: "+result.stale.map(x=>
     x.file+" ("+x.reason+")").join("; "));
   }
   const response=await fetch(base+"/index.html");
   if(response.ok)return;
   throw Error("Preview HTTP "+response.status);
  }catch(err){
   if(i===(isLive?7:39))throw err;
   if(i%4===0)console.warn("Deployment freshness pending:",String(err?.message||err).slice(0,800));
  }
  await delay(isLive?18000:250);
 }
 throw Error("Production readiness check did not pass");
}
function pushError(scope,error){failures.push(scope+": "+String(error?.message||error))}
async function checkProfile(page,profile,screen){
 const scope=screen+" | "+profile.name;
 checkedCount++;
 try{
  // The initial HTML contains legacy fighter cards. Reviewed UFC cohorts
  // hydrate asynchronously; never open a stale legacy profile while
  // the reviewed record is still being loaded.
  await page.waitForFunction(expected=>{
   const f=window.COMBAT_DATA?.fighters?.find(x=>x.id===expected.id);
   const ur=expected.ufcRecord||{};
   const bouts=(ur.wins||0)+(ur.losses||0)+(ur.draws||0)+(ur.noContests||0);
   const category=expected.category==="Roster"&&
    (!ur.complete||bouts<2||(expected.latest||[]).length<2)?
    "Unassessed":expected.category;
   return !!(f?.reviewedUfcProfile||f?.championReview)&&f.record===expected.record&&
    f.division===expected.division&&f.category===category&&
    JSON.stringify((f.latest||[]).map(x=>[x.date,x.opponent,x.outcome,x.method]))===
    JSON.stringify(expected.latest.map(x=>[x.date,x.opponent,x.outcome,x.method]));
  },profile,{timeout:18000});
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
  // V3 deliberately replaces the legacy post-fight widget with nine Recent
  // Performance tiles. Wait for its moved technical panel and tiles instead.
  await page.waitForFunction(()=>{
   const d=document.querySelector("#fighterDialog.befn-v3-dialog");
   return !!d?.querySelector(".dialog-bio .befn-v3-technical")&&
    !!d?.querySelector(".befn-v3-stat-panel .befn-v3-tiles");
  },null,{timeout:12000});
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
   const recentRows=[...(d?.querySelectorAll(".befn-v3-fights li")||[])]
    .map(row=>[
     row.querySelector("time")?.textContent?.trim()||"",
     row.querySelector(".befn-v3-opponent")?.textContent?.trim()||"",
     row.querySelector(".befn-power-result")?.textContent?.trim()||"",
     row.querySelector(".befn-v3-method")?.textContent?.trim()||""
    ]);
   const metrics=d?.querySelectorAll(".dialog-bio .befn-v3-technical .befn-power-metric").length??0;
   const credential=d?.querySelector(".befn-top-credentials .befn-credential-list");
   const tiles=[...(d?.querySelectorAll(".befn-v3-stat-panel .befn-v3-tiles > div")||[])];
   const historyRows=[...(d?.querySelectorAll(".befn-v3-fights li")||[])];
   const rect=d?.getBoundingClientRect();
   const rootWidth=document.documentElement.clientWidth;
   const content=d?.querySelector(".dialog-content");
   const viewportOverflow=document.documentElement.scrollWidth>rootWidth+4;
   return {
    identity:!!f,title,record:f?.record,division:f?.division,category:f?.category,
    metrics,recentRows,credentialsVisible:!!credential,performanceTiles:tiles.length,
    recentFiveCount:historyRows.length,historyV3:!!ins?.classList.contains("befn-v3"),
    noProvisionalRanks:!d?.querySelector(".befn-performance-highlights,.befn-v3-top-ten"),
    noLegacyTable:!d?.querySelector("table[data-befn-recent-results]"),
    publicLinks:[...(d?.querySelectorAll("a[href]")||[])].map(a=>a.getAttribute("href")),
    provenanceText:d?.querySelector(".dialog-content")?.textContent||"",
    rect:rect&&{left:rect.left,right:rect.right,width:rect.width},
    rootWidth,viewportOverflow,
    dialogClip:!!rect&&(rect.left< -4||rect.right>innerWidth+4),
    contentOverflow:!!content&&content.scrollWidth>content.clientWidth+4,
    portraitStatus:(()=>{
     const frame=d?.querySelector(".dialog-bio [data-fighter-portrait]");
     const im=frame?.querySelector("img");
     const fallback=frame?.querySelector(".befn-portrait-fallback");
     const styles=fallback?getComputedStyle(fallback):null;
     const imagePainted=!!im&&getComputedStyle(im).display!=="none"&&
      Number(getComputedStyle(im).opacity)>.05;
     const shown=!!fallback&&styles?.display!=="none"&&styles?.visibility!=="hidden"&&
      Number(styles?.opacity)>0.9&&!imagePainted&&
      fallback.getBoundingClientRect().width>0&&fallback.getBoundingClientRect().height>0;
     return {imgPresent:!!im,imageLoaded:!!im&&im.complete&&im.naturalWidth>0&&
      frame.classList.contains("is-loaded")&&imagePainted,fallbackVisible:shown,
      fallbackLabel:fallback?.textContent?.trim()||"",
      state:frame?.dataset.portraitState||"missing",framePresent:!!frame,
      photoVerified:!!f?.photoRightsVerified};
    })(),
    closeVisible:!!d?.querySelector("button#closeFighter"),
    renderedClassification:d?.querySelector(".befn-v3-status")?.textContent||"",
    championshipBelt:!!d?.querySelector(".befn-title-belts"),
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
  assert(details.historyV3,"UFC profile is not using the approved V3 design");
  assert.equal(details.metrics,5,"V3 header requires exactly five technical rating bars");
  assert.equal(details.performanceTiles,9,"V3 Recent Performance requires exactly nine tiles");
  const saved=verifiedV3?.schema===4?verifiedV3.fighters?.[normalized(profile.name)]:null;
  const vettedPerformance=Object.values(saved?.metrics||{}).some(m=>
   Number.isFinite(m.value)&&m.bouts>=3&&m.bouts<=5&&
   ((Number.isInteger(m.rank)&&m.rank>=1&&m.rank<=30)||
    (Number.isInteger(m.divisionRank)&&m.divisionRank>=1&&m.divisionRank<=30)));
  assert(details.noProvisionalRanks||vettedPerformance,
   "provisional rankings must not appear without qualifying V3 metric evidence");
  assert(details.noLegacyTable,"duplicated legacy fight table must not appear in V3");
  assert.equal(details.recentFiveCount,Math.min(profile.latest.length,5),
   "V3 recent fights must contain up to five verified UFC results");
  const sourcedRows=profile.latest.slice(0,5).map(x=>[x.date,x.opponent,x.outcome,x.method].map(String));
  assert.deepEqual(details.recentRows,sourcedRows,
   "V3 fight rows differ from the individually reviewed UFC results");
  // On mobile all outcome/method fields must fit within the dialog itself,
  // not merely exist in the DOM beyond the right-hand edge of the viewport.
  if(screen==="mobile"&&profile.latest.length){
   const mobile=await page.evaluate(()=>{
    const dialog=document.querySelector("#fighterDialog");
    const edge=dialog.getBoundingClientRect();
    return [...dialog.querySelectorAll(".befn-v3-fights li")].map(row=>{
     const item=row.getBoundingClientRect();
     const result=row.querySelector(".befn-power-result");
     const method=row.querySelector(".befn-v3-method");
     return {outcome:result?.textContent?.trim(),method:method?.textContent?.trim(),
      visible:[item,result?.getBoundingClientRect(),method?.getBoundingClientRect()]
       .every(r=>r&&r.width>4&&r.left>=edge.left-5&&r.right<=edge.right+5)};
    });
   });
   assert(mobile.every(x=>x.visible&&x.outcome&&x.method),
    "mobile UFC recent fight outcomes and methods must fit without sideways scrolling");
  }
  // A source URL by itself is not a verified credential. Athlete-reported
  // achievements, including unsupported credential kinds, earn no badge.
  const supportedCredentialKinds=new Set(["ncaa","bjj","adcc","sambo",
   "golden-gloves","olympic-judo"]);
  if((profile.credentials||[]).some(x=>supportedCredentialKinds.has(x?.kind)&&
    x?.verification!=="reported"&&x?.source?.startsWith("https://")))
   assert(details.credentialsVisible,"verified top credentials were not displayed");
  assert(details.closeVisible,"dialog close action missing");
  assert(!details.viewportOverflow,"document overflows horizontally");
  assert(!details.dialogClip,"fighter dialog extends beyond viewport");
  assert(!details.contentOverflow,"fighter profile content clips horizontally");
  if(isLive){
   assert.deepEqual(details.clippedElements,[],"important profile labels visibly clipped");
   assert.deepEqual(details.publicLinks,[],"fighter dialog must not show external research links");
   if(expectedCategory==="Champion")
    assert(details.championshipBelt,"verified UFC champion belt missing");
   else if(["Contender","Prospect"].includes(expectedCategory))
    assert(details.renderedClassification.includes(expectedCategory),
     "algorithmically assigned contender/prospect label missing");
  }
  assert(!/(?:source links|view stats source|how are .* calculated|evidence confidence|credential points|record caution|research snapshot|independently reviewed)/i.test(details.provenanceText),
   "public fighter dialog contains research or calculation commentary");
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
  // Keep QA screenshots for the entire dialog, not just the visible top.
  // This captures lower statistics, recent UFC results and credentials.
  const scroll=await dialog.evaluate(el=>{
   const max=Math.max(0,el.scrollHeight-el.clientHeight);
   if(max>24)el.scrollTop=el.scrollHeight;
   return {needed:max>24,max,top:el.scrollTop};
  });
  if(scroll.needed){
   assert(scroll.top>=scroll.max-6,"fighter dialog cannot scroll to its bottom");
   await page.screenshot({path:path.join(screenshots,safe(profile.name)+"-"+screen+"-bottom.png"),
    animations:"disabled",timeout:12000});
   const bottom=await dialog.evaluate(el=>({
    reached:Math.abs(el.scrollHeight-el.clientHeight-el.scrollTop)<=6,
    horizontalOverflow:el.scrollWidth>el.clientWidth+4
   }));
   assert(bottom.reached,"fighter dialog bottom is not accessible");
   assert(!bottom.horizontalOverflow,"fighter dialog content overflows horizontally at bottom");
   await dialog.evaluate(el=>{el.scrollTop=0});
  }
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
  // Production must display actual qualified statistics at both breakpoints,
  // not only a static navigation link or a stale unverified placeholder.
  try{
   await page.evaluate(()=>{
    document.querySelector("#fighterDialog")?.close();
    location.hash="#leaderboards";
    window.dispatchEvent(new Event("hashchange"));
   });
   const board=page.locator("[data-befn-v3-leaderboards]");
   await board.waitFor({state:"visible",timeout:12000});
   await page.waitForFunction(()=>document.querySelector("[data-befn-v3-leaderboards]")?.dataset.ready==="true",null,{timeout:12000});
   const options=await page.locator("#befn-board-metric option").count();
   assert.equal(options,12,"UFC statistical categories incomplete");
   const rows=await page.locator(".befn-board-list > li").count();
   assert(rows>=1&&rows<=30,"Expected 1–30 qualified leaderboard athletes");
   const unqualified=await board.evaluate(el=>[...el.querySelectorAll(".befn-board-name small")]
    .some(node=>!/\b[3-5] recorded UFC bouts\b/.test(node.textContent||"")));
   assert(!unqualified,"A leaderboard row shows fewer than 3 measured UFC bouts");
   const overflowing=await board.evaluate(el=>el.scrollWidth>el.clientWidth+3);
   assert(!overflowing,"UFC leaderboard horizontally overflows "+screen);
   await page.screenshot({path:path.join(screenshots,"ufc-leaderboards-"+screen+".png"),animations:"disabled",timeout:12000});
  }catch(err){pushError(screen+" | verified UFC leaderboard page",err)}
  await page.evaluate(()=>{
   location.hash="#fighters";
   window.dispatchEvent(new Event("hashchange"));
  });
  // Deterministic regression test: simulate a real broken portrait regardless
  // of which remote CDNs happen to be reachable on this CI runner. A labelled,
  // visible fallback must appear without replacing it with a wrong person's photo.
  const target=profiles[0];
  await page.evaluate(id=>{
   const hash="#fighter/"+encodeURIComponent(id);
   location.hash=hash;
   window.dispatchEvent(new Event("hashchange"));
  },target.id);
  try{
   await page.locator("#fighterDialog").waitFor({state:"visible",timeout:12000});
   const injected=await page.evaluate(()=>{
    const frame=document.querySelector("#fighterDialog .dialog-bio [data-fighter-portrait]");
    if(!frame)return false;
    let image=frame.querySelector("img");
    if(!image){image=document.createElement("img");image.alt="Photograph of test fighter";frame.appendChild(image)}
    image.src="data:image/png;base64,THIS_IS_NOT_A_VALID_IMAGE";
    return true;
   });
   assert(injected,"Broken portrait test could not locate the actual fighter photo widget");
   await page.waitForFunction(()=>{
    const frame=document.querySelector("#fighterDialog .dialog-bio [data-fighter-portrait]");
    const fallback=frame?.querySelector(".befn-portrait-fallback");
    const image=frame?.querySelector("img");
    return frame?.dataset.portraitState==="fallback"&&
     !frame.classList.contains("is-loaded")&&
     fallback?.textContent?.includes("Photo unavailable")&&
     fallback.getBoundingClientRect().width>=120&&
     fallback.getBoundingClientRect().height>=150&&
     (!image||image.classList.contains("is-error"));
   },null,{timeout:9000});
   await page.screenshot({path:path.join(screenshots,"broken-photo-fallback-"+screen+".png"),
    animations:"disabled",timeout:12000});
  }catch(err){pushError(screen+" | deterministic broken-photo regression",err)}
  await page.evaluate(()=>document.querySelector("#fighterDialog")?.close()).catch(()=>{});
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
