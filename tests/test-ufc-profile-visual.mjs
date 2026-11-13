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
const normalized=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]/g,"");
const v3Path=path.join(root,"data/ufc-fighter-v3.json");
const v3=fs.existsSync(v3Path)?JSON.parse(fs.readFileSync(v3Path,"utf8")):null;
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
const server=isLive?null:spawn(process.execPath,["scripts/responsive-preview-server.mjs"],
 {cwd:root,stdio:"ignore",env:{...process.env,PORT:String(port)}});
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
 const expectedV3=v3?.fighters[normalized(profile.name)];
 checkedCount++;
 try{
  // The initial HTML contains legacy fighter cards. Reviewed UFC cohorts
  // hydrate asynchronously; never open a stale legacy profile while
  // the reviewed record is still being loaded.
  await page.waitForFunction(expected=>{
   const f=window.COMBAT_DATA?.fighters?.find(x=>x.id===expected.id);
   const ur=expected.ufcRecord||{};
   const bouts=(ur.wins||0)+(ur.losses||0)+(ur.draws||0)+(ur.noContests||0);
   const category=expected.v3Category??(expected.category==="Roster"&&
    (!ur.complete||bouts<2||(expected.latest||[]).length<2)?
    "Unassessed":expected.category);
   return !!(f?.reviewedUfcProfile||f?.championReview)&&f.record===expected.record&&
    f.division===expected.division&&f.category===category&&
    JSON.stringify((f.latest||[]).map(x=>[x.date,x.opponent,x.outcome,x.method]))===
    JSON.stringify(expected.latest.map(x=>[x.date,x.opponent,x.outcome,x.method]));
  },{...profile,v3Category:expectedV3?.category},{timeout:18000});
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
  if(!expectedV3&&expectedPostfight.has(normalized(profile.name))){
   await page.waitForFunction(id=>
    !!document.querySelector("#fighterDialog .befn-profile-block[data-befn-postfight='"+CSS.escape(id)+"']"),
    profile.id,{timeout:12000});
  }
  if(expectedV3){
   const rendered=dialog.locator('.befn-v3');
   await rendered.waitFor();
   assert.equal(await rendered.locator('.befn-v3-fights li').count(),expectedV3.recent.length);
   assert((await rendered.locator('.befn-v3-score').textContent()).startsWith(String(expectedV3.power??'Unrated')));
   assert((await rendered.locator('.befn-v3-status').textContent()).includes(expectedV3.category));
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
   const postfight=ins?.querySelector(".befn-profile-block[data-befn-postfight]");
   const postfightCells=postfight?.querySelectorAll(".befn-postfight-stat")?.length??0;
   const recentFive=postfight?.querySelector(".befn-recent-five-coverage");
   const recentFiveCount=recentFive?.querySelectorAll("li.befn-postfight-bout").length??0;
   const recentFiveSummary=recentFive?.querySelector("summary")?.textContent?.trim()||"";
   const coverageVisible=postfight?.textContent?.includes("not career totals")??false;
   const rect=d?.getBoundingClientRect();
   const rootWidth=document.documentElement.clientWidth;
   const content=d?.querySelector(".dialog-content");
   const viewportOverflow=document.documentElement.scrollWidth>rootWidth+4;
   return {
    identity:!!f,title,record:f?.record,division:f?.division,category:f?.category,
    metrics,recentRows,credentialsVisible:!!credential,postfightCells,coverageVisible,
    recentFiveCount,recentFiveSummary,
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
    renderedClassification:ins?.querySelector(".befn-scout-classification")?.textContent||"",
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
  const expectedCategory=expectedV3?.category??(profile.category==="Roster"&&
   (!record.complete||boutCount<2||(profile.latest||[]).length<2)?
   "Unassessed":profile.category);
  assert.equal(details.category,expectedCategory,"classification display mismatch");
  assert.equal(details.metrics,5,"expected exactly 5 rating rows");
  // Profile details may contain OTHER tables (including post-fight metrics).
  // Only the uniquely annotated fight-history table may be counted and audited.
  const sourcedRows=profile.latest.map(x=>[x.date,x.opponent,x.outcome,x.method].map(String));
  assert.deepEqual(details.recentRows,sourcedRows,
    "published fight-by-fight history differs from the individually sourced UFC results");
  // Mobile must show the W/L result and method, not only the date/opponent.
  // A 680px desktop-only table could otherwise pass DOM checks while hiding
  // the final two columns beyond the phone's right edge.
  if(screen==="mobile"&&profile.latest.length){
   const mobileCells=await page.evaluate(()=>{
    const table=document.querySelector("#fighterDialog table[data-befn-recent-results]");
    const row=table?.querySelector("tbody tr");
    const view=table?.closest(".scroller")?.getBoundingClientRect();
    return {cells:[...(row?.cells||[])].map(cell=>{
     const box=cell.getBoundingClientRect(),style=getComputedStyle(cell);
     return {text:cell.textContent.trim(),visible:box.width>12&&box.height>5&&
      style.display!=="none"&&style.visibility!=="hidden"&&
      !!view&&box.left>=view.left-4&&box.right<=view.right+4};
    })};
   });
   assert.equal(mobileCells.cells.length,4,"mobile results must keep all four source fields");
   assert(mobileCells.cells.every(x=>x.visible),"mobile result and finish method must fit without sideways scrolling");
   assert(mobileCells.cells[2].text&&mobileCells.cells[3].text,
    "mobile UFC results must display outcome and method");
  }
  assert(details.credentialsVisible,"credentials or missing-credential statement absent");
  if(!expectedV3&&expectedPostfight.has(normalized(profile.name))){
   assert.equal(details.postfightCells,11,"incomplete UFC post-fight metrics panel");
   assert(details.coverageVisible,"missing clear sample versus career totals label");
   const latestUfcCount=Math.min((profile.latest||[]).length,5);
   assert.equal(details.recentFiveCount,latestUfcCount,
    "last-five UFC coverage panel must list every reviewed recent bout, including missing metrics");
   assert(details.recentFiveSummary.includes("/"+latestUfcCount),
    "last-five summary must use the reviewed UFC fight count, not the tracked sample size");
  }
  assert(details.closeVisible,"dialog close action missing");
  assert(!details.viewportOverflow,"document overflows horizontally");
  assert(!details.dialogClip,"fighter dialog extends beyond viewport");
  assert(!details.contentOverflow,"fighter profile content clips horizontally");
  if(isLive){
   assert.deepEqual(details.clippedElements,[],"important profile labels visibly clipped");
   assert.deepEqual(details.publicLinks,[],"fighter dialog must not show external research links");
   assert(details.renderedClassification.includes(expectedCategory),
    "scouting classification missing in live profile dialog");
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
 browser=await chromium.launch({executablePath:process.env.BEFN_QA_CHROME,headless:true,args:["--no-sandbox"]});
 for(const [screen,viewport] of [
  ["desktop",{width:1366,height:900}],
  ["mobile",{width:390,height:844}]
 ]){
  const context=await browser.newContext({
   viewport,hasTouch:screen==="mobile",deviceScaleFactor:1,locale:"en-AU",timezoneId:"Australia/Melbourne",
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
  if(v3){
   const boards=page.locator('[data-befn-v3-leaderboards]');
   await boards.locator('summary').click();
   await boards.locator('select').selectOption('submission');
   assert((await boards.innerText()).includes(v3.boards.find(b=>b.id==='submission').leaders[0].name));
   await boards.locator('select').selectOption('sapm');
   assert((await boards.innerText()).includes('lower is better'));
  }
  // Open a reviewed card through the live Fighter Profiles interface.
  await page.evaluate(()=>{document.querySelector('[data-nav="fighters"]')?.click()});
  await page.waitForTimeout(350);
  if(!await fighterGrid.count())pushError(screen,"Fighter Profiles grid missing");
  for(const f of profiles)await checkProfile(page,f,screen);
  if(v3){
   await page.evaluate(()=>{location.hash='#champions'});
   const fighter=page.locator('.fighter-hover-name').first();
   if(screen==='desktop')await fighter.hover();
   else await fighter.tap();
   const popup=page.locator('#fighter-photo-preview');
   await popup.waitFor({state:'visible'});
   const close=popup.getByRole('button',{name:'Close fighter photo'});
   await close.click();
   await popup.waitFor({state:'hidden'});
  }
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
