/* Browser-level UFC profile QA for every reviewed athlete and both breakpoints.
 * Checks the actual DOM (not just JSON), captures screenshots, and fails on
 * missing profile content, broken navigation or horizontal clipping.
 * Fighter-photo network failures are reported separately: external CDNs may
 * block CI, and a passing test must never imply that reuse rights are cleared.
 *
 * Run locally the way CI does (.github/workflows/validate-ufc-profiles.yml): build the inputs, make Playwright
 * importable, then run this file. It serves the repository root itself.
 *   node scripts/build-ufc-last-five-coverage.mjs && node scripts/build-ufc-fighter-v3.mjs
 *   npm install --no-save --no-package-lock playwright@1.56.1 && npx playwright install chromium
 *   node tests/test-ufc-profile-visual.mjs
 * Without Playwright in node_modules it stops with ERR_MODULE_NOT_FOUND, which is not a test failure.
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
// Stats-build files, resolved the way the page does (data/ufc-stats/names.json: normalised name to slug).
const statsNames=JSON.parse(fs.readFileSync(path.join(root,"data/ufc-stats/names.json"),"utf8")).names||{};
// The page replaces a reviewed record with the overall record (data/ufc-overall-records.json: the saved record plus
// UFC fights since) once the stats names have loaded (applyOverall in assets/fighter-insights.js). For a fighter with a
// fight newer than their reviewed file (Ciryl Gane and Kayla Harrison, 14 Nov 2026) the two differ - Gane 14-2 (1 NC)
// reviewed, 15-2 (1 NC) overall - so a check that accepted only the reviewed record timed out whenever the swap came
// first (caught by the hydration-state message on 2026-11-24). Both records are correct; either is accepted.
const overallFile=JSON.parse(fs.readFileSync(path.join(root,"data/ufc-overall-records.json"),"utf8"));
const overallShared=new Set((overallFile.sharedNames||[]).map(normalized));
const overallRecordText=r=>r.W+"–"+r.L+(r.D?"–"+r.D:"")+(r.NC?" ("+r.NC+" NC)":"");
function acceptedRecords(profile){
 const key=normalized(profile.name),slug=statsNames[key],o=slug&&!overallShared.has(key)?overallFile.records?.[slug]:null;
 return [...new Set([profile.record,...(o?[overallRecordText(o)]:[])])];
}
function statsFileFor(name){
 const slug=statsNames[normalized(name)];
 const file=slug&&path.join(root,"data/ufc-stats/fighters",slug+".json");
 return file&&fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")):null;
}
const nameWords=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .replace(/ł/g,"l").replace(/Ł/g,"L").replace(/ø/g,"o").replace(/Ø/g,"O").replace(/đ/g,"d").replace(/ß/g,"ss")
 .toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>1);
const sharesNameWord=(a,b)=>{const w=new Set(nameWords(a));return nameWords(b).some(x=>w.has(x))};
const STATS_METHOD_LABEL={ko:"KO/TKO",sub:"Submission",dec:"Decision",draw:"Draw",nc:"No contest",dq:"DQ"};
// The kind of finish in a reviewed profile's wording ("TKO R1 3:11", "Split decision R3"), or "" when unclear.
function reviewedMethodKind(text){
 const t=String(text||"").toLowerCase();
 if(/no contest/.test(t))return "nc";
 if(/submission/.test(t))return "sub";
 if(/decision/.test(t))return "dec";
 if(/draw/.test(t))return "draw";
 if(/disqualif|\bdq\b/.test(t))return "dq";
 if(/\bt?ko\b/.test(t))return "ko";
 return "";
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
  // If the reviewed record never arrives, say which field differs instead of a bare timeout.
  const hydrationState=expected=>page.evaluate(expected=>{
   const f=window.COMBAT_DATA?.fighters?.find(x=>x.id===expected.id);
   if(!f)return {missing:true};
   const pick=x=>JSON.stringify((x||[]).map(y=>[y.date,y.opponent,y.outcome,y.method]));
   return {reviewed:!!(f.reviewedUfcProfile||f.championReview),record:[f.record,expected.record],
    division:[f.division,expected.division],category:[f.category,expected.category],
    latest:pick(f.latest)===pick(expected.latest)?"same":[pick(f.latest).slice(0,160),pick(expected.latest).slice(0,160)]};
  },expected);
  await page.waitForFunction(expected=>{
   const f=window.COMBAT_DATA?.fighters?.find(x=>x.id===expected.id);
   const ur=expected.ufcRecord||{};
   const bouts=(ur.wins||0)+(ur.losses||0)+(ur.draws||0)+(ur.noContests||0);
   const category=expected.category==="Roster"&&
    (!ur.complete||bouts<2||(expected.latest||[]).length<2)?
    "Unassessed":expected.category;
   return !!(f?.reviewedUfcProfile||f?.championReview)&&expected.records.includes(f.record)&&
    f.division===expected.division&&f.category===category&&
    JSON.stringify((f.latest||[]).map(x=>[x.date,x.opponent,x.outcome,x.method]))===
    JSON.stringify(expected.latest.map(x=>[x.date,x.opponent,x.outcome,x.method]));
  },{...profile,records:acceptedRecords(profile)},{timeout:18000}).catch(async e=>{
   throw new Error(e.message+" | hydration state: "+JSON.stringify(await hydrationState(profile).catch(()=>"unavailable")));
  });
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
  // Profile design A (owner, 2026-11-25): a hero rating or recent-form panel, the tab bar, and the nine Recent
  // Performance tiles moved into the Stats tab. The Ratings card holds only the ratings that have a value, so it is
  // no longer waited for (a fighter with none has no card).
  await page.waitForFunction(()=>{
   const d=document.querySelector("#fighterDialog.befn-pro-dialog");
   return !!d?.querySelector("[data-befn-pro-rating] .befn-pro-score")&&
    !!d?.querySelector(".befn-pa-tabs [role=tab]")&&
    !!d?.querySelector(".befn-pro-stats .befn-pro-tiles");
  },null,{timeout:12000});
  // A fighter in the stats build first shows a placeholder ("—") while their stats file loads; count the rating
  // bars only once the real card is in (rating model 2026-11, PR #453: the live site is slower than a local server).
  if(statsFileFor(profile.name))await page.waitForFunction(()=>{
   const t=document.querySelector("#fighterDialog .befn-pro-score .befn-v3-score")?.textContent?.trim();
   return !!t&&t!=="—";
  },null,{timeout:12000});
  // The five recent fights are redrawn from the stats file once that file has loaded, a moment after the rating card
  // fills (the live site is slower than a local server). Wait for the rows themselves to settle on the stats file's
  // five, so a read in between is not reported as a mismatch (live runs on 2026-11-25 failed on a different fighter
  // each time). If the page never settles the wait times out and the assertion below reports the real difference.
  if(statsFileFor(profile.name))await page.waitForFunction(expected=>{
   const rows=[...document.querySelectorAll("#fighterDialog .befn-v3-fights li")].map(r=>[
    r.querySelector("time")?.textContent?.trim()||"",r.querySelector(".befn-v3-opponent")?.textContent?.trim()||""]);
   return rows.length===expected.length&&rows.every((r,i)=>r[0]===expected[i][0]&&r[1]===expected[i][1]);
  },statsFileFor(profile.name).fights.slice(0,5).map(f=>[f.date,f.opponent]),{timeout:12000}).catch(()=>{});
  // Wait briefly for portrait requests to settle. A cached or slow image
  // must not be declared broken just because it was read instantly. This applies to local runs too: many
  // portraits are hotlinked, and on a slow network a mid-load frame was reported as "neither image nor fallback".
  await page.waitForFunction(()=>{
    const img=document.querySelector("#fighterDialog .befn-pro-photo img");
    return !img||img.complete;
   },null,{timeout:2500}).catch(()=>{});
  const details=await page.evaluate(id=>{
   const d=document.querySelector("#fighterDialog"),f=window.COMBAT_DATA?.fighters?.find(x=>x.id===id);
   const ins=d?.querySelector(".befn-profile-insights");
   const title=d?.querySelector(".befn-pro-hero h2")?.textContent?.trim();
   const recentRows=[...(d?.querySelectorAll(".befn-v3-fights li")||[])]
    .map(row=>[
     row.querySelector("time")?.textContent?.trim()||"",
     row.querySelector(".befn-v3-opponent")?.textContent?.trim()||"",
     row.querySelector(".befn-power-result")?.textContent?.trim()||"",
     row.querySelector(".befn-v3-method")?.textContent?.trim()||""
    ]);
   const metrics=d?.querySelectorAll(".befn-pro-ratings .befn-pro-meter").length??0;
   const credential=d?.querySelector(".befn-top-credentials .befn-credential-list");
   const tiles=[...(d?.querySelectorAll(".befn-pro-stats .befn-pro-tiles > div")||[])];
   const historyRows=[...(d?.querySelectorAll(".befn-v3-fights li")||[])];
   const rect=d?.getBoundingClientRect();
   const rootWidth=document.documentElement.clientWidth;
   const content=d?.querySelector(".befn-pro-body");
   const viewportOverflow=document.documentElement.scrollWidth>rootWidth+4;
   return {
    identity:!!f,title,record:f?.record,division:f?.division,category:f?.category,
    metrics,recentRows,credentialsVisible:!!credential,performanceTiles:tiles.length,
    recentFiveCount:historyRows.length,historyV3:!!ins?.classList.contains("befn-pro-insights"),
    noProvisionalRanks:!d?.querySelector(".befn-performance-highlights,.befn-v3-top-ten"),
    noLegacyTable:!d?.querySelector("table[data-befn-recent-results]"),
    // Related news (assets/related-news.js, .rn-block) links out to the stories by design (owner, 2026-11-24); every
    // other link in the dialog must still be absent.
    // The amateur career card's per-result "Source" links (assets/amateur-credentials.js) are shown by design (owner,
    // 2026-11-25: "a 'Source' link" on every result); they are checked on their own below.
    publicLinks:[...(d?.querySelectorAll("a[href]")||[])].filter(a=>!a.closest(".rn-block")&&!a.matches("a.befn-am-source")).map(a=>a.getAttribute("href")),
    amateurSourceLinks:[...(d?.querySelectorAll("a.befn-am-source")||[])].map(a=>({href:a.getAttribute("href"),target:a.getAttribute("target"),rel:a.getAttribute("rel")||""})),
    relatedNewsLinks:[...(d?.querySelectorAll(".rn-block a[href]")||[])].map(a=>a.getAttribute("href")),
    provenanceText:d?.querySelector(".befn-pro-body")?.textContent||"",
    rect:rect&&{left:rect.left,right:rect.right,width:rect.width},
    rootWidth,viewportOverflow,
    dialogClip:!!rect&&(rect.left< -4||rect.right>innerWidth+4),
    contentOverflow:!!content&&content.scrollWidth>content.clientWidth+4,
    portraitStatus:(()=>{
     const frame=d?.querySelector(".befn-pro-photo [data-fighter-portrait]");
     const im=frame?.querySelector("img");
     const fallback=frame?.querySelector(".befn-portrait-fallback");
     const styles=fallback?getComputedStyle(fallback):null;
     // "Painted" also needs the frame on screen: an image inside a hidden frame keeps its own display and opacity.
     const frameBox=frame?.getBoundingClientRect();
     const imagePainted=!!im&&getComputedStyle(im).display!=="none"&&
      Number(getComputedStyle(im).opacity)>.05&&!!frameBox&&frameBox.width>0&&frameBox.height>0;
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
    // Design A: classification and the Fighters hub stage are pills under the record.
    renderedClassification:d?.querySelector(".befn-pa-pills")?.textContent||"",
    formStage:d?.querySelector(".befn-pa-pills .befn-form-chip")?.textContent||"",
    placeholderText:["Not rated","No credentials listed","No title history listed","Unassessed"].filter(w=>(d?.innerText||"").includes(w)),
    championshipBelt:!!d?.querySelector(".befn-title-belts"),
    clippedElements:[...(d?.querySelectorAll(".befn-pro-card h3,.befn-pro-hero h2,.befn-pro-meter-head,.befn-profile-block h3,.befn-classifier-indices strong")||[])]
      .filter(x=>{const c=getComputedStyle(x);return (x.scrollWidth>x.clientWidth+5&&c.overflowX==="hidden")||
       (x.scrollHeight>x.clientHeight+5&&c.overflowY==="hidden")})
      .map(x=>x.tagName+":"+x.textContent.trim().slice(0,45)).slice(0,8)
   };
  },profile.id);
  assert(details.identity,"profile did not hydrate in shared data");
  assert.equal(details.title,profile.name,"dialog title wrong");
  assert(acceptedRecords(profile).includes(details.record),"record mismatch: "+details.record+" not in "+acceptedRecords(profile).join(" / "));
  assert.equal(details.division,profile.division,"division mismatch");
  // Incomplete reviewed roster entries remain visible but must NOT receive
  // an unsourced prospect/contender label. Their UI category is Unassessed.
  const record=profile.ufcRecord||{};
  const boutCount=(record.wins||0)+(record.losses||0)+(record.draws||0)+(record.noContests||0);
  const expectedCategory=profile.category==="Roster"&&
   (!record.complete||boutCount<2||(profile.latest||[]).length<2)?
   "Unassessed":profile.category;
  assert.equal(details.category,expectedCategory,"classification display mismatch");
  assert(details.historyV3,"UFC profile is not using the sumo-style profile design");
  // Rating model 2026-11: a fighter rated by the stats build shows Results, Striking, Wrestling, Grappling and Recent
  // form (each skill includes its own defence since 2026-11-24). Design A (owner, 2026-11-25): a rating with no value
  // is left out rather than shown as "Not rated", so the card holds at most five bars, each with a value.
  assert(details.metrics<=5,"Ratings card holds at most five rating bars");
  assert.deepEqual(details.placeholderText,[],"profile shows a placeholder or Unassessed");
  assert.equal(details.performanceTiles,9,"V3 Recent Performance requires exactly nine tiles");
  const saved=verifiedV3?.schema===4?verifiedV3.fighters?.[normalized(profile.name)]:null;
  const vettedPerformance=Object.values(saved?.metrics||{}).some(m=>
   Number.isFinite(m.value)&&m.bouts>=3&&m.bouts<=5&&
   ((Number.isInteger(m.rank)&&m.rank>=1&&m.rank<=30)||
    (Number.isInteger(m.divisionRank)&&m.divisionRank>=1&&m.divisionRank<=30)));
  assert(details.noProvisionalRanks||vettedPerformance,
   "provisional rankings must not appear without qualifying V3 metric evidence");
  assert(details.noLegacyTable,"duplicated legacy fight table must not appear in V3");
  // Since #433 the five recent fights come from the fighter's stats file wherever the stats build holds the fighter
  // (kept current by the results import; a reviewed profile is only as new as the day it was checked, and words a
  // method differently). So for those fighters the dialog must show exactly the stats file's rows, and every reviewed
  // fight inside that window must still be there, with the same outcome, opponent and kind of finish. A fighter the
  // stats build does not hold keeps the original rule: the reviewed rows, exactly.
  const statsFile=statsFileFor(profile.name);
  if(!statsFile){
   assert.equal(details.recentFiveCount,Math.min(profile.latest.length,5),
    "V3 recent fights must contain up to five verified UFC results");
   const sourcedRows=profile.latest.slice(0,5).map(x=>[x.date,x.opponent,x.outcome,x.method].map(String));
   assert.deepEqual(details.recentRows,sourcedRows,
    "V3 fight rows differ from the individually reviewed UFC results");
  }else{
   const shown=statsFile.fights.slice(0,5);
   assert.equal(details.recentFiveCount,shown.length,
    "V3 recent fights must contain up to five UFC results from the stats file");
   assert.deepEqual(details.recentRows.map(r=>r.slice(0,3)),shown.map(f=>[f.date,f.opponent,f.outcome]),
    "V3 fight rows differ from the fighter's stats file");
   details.recentRows.forEach((r,i)=>assert(
    String(r[3]).startsWith(STATS_METHOD_LABEL[shown[i].method]||"\u0000"),
    "method text '"+r[3]+"' does not match the stats file's "+shown[i].method+" for "+shown[i].opponent));
   const oldestShown=shown.at(-1)?.date||"";
   for(const r of profile.latest.slice(0,5)){
    if(Date.parse(r.date)<Date.parse(oldestShown)-86400000)continue;   // pushed out of the five by newer fights
    // One opponent per fighter per date, so date and outcome pin the bout; the names must still share a word, which
    // allows "Jose Miguel Delgado" / "Jose Delgado" and an accent ("Błachowicz") but not a different opponent.
    const hit=statsFile.fights.find(f=>f.outcome===r.outcome&&sharesNameWord(f.opponent,r.opponent)&&
     Math.abs(Date.parse(f.date)-Date.parse(r.date))<=86400000);
    assert(hit,"reviewed fight is not in the stats file: "+r.date+" "+r.opponent+" "+r.outcome);
    const kind=reviewedMethodKind(r.method);
    if(kind)assert.equal(hit.method,kind,"reviewed and stats methods disagree for "+r.date+" "+r.opponent);
   }
  }
  // On mobile all outcome/method fields must fit within the dialog itself,
  // not merely exist in the DOM beyond the right-hand edge of the viewport.
  if(screen==="mobile"&&profile.latest.length){
   // Design A: the full fight cards (with round by round) are under the Fights tab; the Overview has compact rows.
   const overview=await page.evaluate(()=>{
    const dialog=document.querySelector("#fighterDialog"),edge=dialog.getBoundingClientRect();
    return [...dialog.querySelectorAll(".befn-pa-panel[data-pa-panel=overview] .befn-pa-fight")].map(row=>{
     const r=row.getBoundingClientRect();
     return r.width>4&&r.left>=edge.left-5&&r.right<=edge.right+5&&!!row.querySelector(".befn-pa-chip")?.textContent.trim();
    });
   });
   assert(overview.length&&overview.every(Boolean),"mobile Overview recent fights must fit without sideways scrolling");
   await page.locator('#fighterDialog .befn-pa-tabs [data-pa-tab="fights"]').click({timeout:5000});
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
   await page.locator('#fighterDialog .befn-pa-tabs [data-pa-tab="overview"]').click({timeout:5000});
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
   assert(details.amateurSourceLinks.every(l=>/^https:\/\//.test(l.href)&&l.target==="_blank"&&/\bnoopener\b/.test(l.rel)),
    "amateur career source links must be https and open safely in a new tab: "+JSON.stringify(details.amateurSourceLinks.filter(l=>!(/^https:\/\//.test(l.href)&&l.target==="_blank"&&/\bnoopener\b/.test(l.rel)))));
   assert(details.relatedNewsLinks.every(h=>/^https:\/\//.test(h)),"related-news links must be https: "+details.relatedNewsLinks.join(" "));
   if(expectedCategory==="Champion")
    assert(details.championshipBelt,"verified UFC champion belt missing");
   // Since the Fighters hub (2026-11-24) the stage chip from data/ufc-fighter-form.json is the one classification
   // where a Form entry exists; the older label shows only without one.
   else if(details.formStage)
    assert(/^(Champion|Title contender|Contender|Slipping|Rising star|Prospect|Breakout|Inactive|Established)$/.test(details.formStage),
     "unknown Fighters hub stage: "+details.formStage);
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
  // The Fighters page: the all-sports grid on a deployment before 28 Nov 2026, or a sport's Fighters hub after
  // ("Front page only" navigation: #fighters with no saved sport opens the last sport's hub, MMA on a first visit).
  const fightersPage=page.locator("#fighterGrid, [data-befn-fighters-hub], [data-befn-boxing-hub]").first();
  await fightersPage.waitFor({state:"visible",timeout:12000});
  // Open a reviewed card through the live Fighter Profiles interface.
  await page.evaluate(()=>{document.querySelector('[data-nav="fighters"]')?.click()});
  await page.waitForTimeout(350);
  if(!await page.locator("#fighterGrid, [data-befn-fighters-hub], [data-befn-boxing-hub]").count())pushError(screen,"Fighters page missing");
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
   // Stage 5 boards: 6 rating boards (Results added by #453, Defence folded into the skills on 2026-11-24)
   // + 16 statistic boards, one picker.
   const options=await page.locator("#befn-board-metric option").count();
   assert.equal(options,22,"UFC leaderboard choices incomplete");
   const rows=await page.locator(".befn-board-list > li").count();
   assert(rows>=1&&rows<=30,"Expected 1–30 qualified leaderboard athletes");
   // Default board is the BEFN rating, which needs 5 fights with full stats.
   const unqualified=await board.evaluate(el=>[...el.querySelectorAll(".befn-board-name small")]
    .some(node=>{const m=(node.textContent||"").match(/\b(\d+) UFC fights with full stats\b/);return !m||Number(m[1])<5;}));
   assert(!unqualified,"A rating leaderboard row shows fewer than 5 UFC fights with full stats");
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
    const frame=document.querySelector("#fighterDialog .befn-pro-photo [data-fighter-portrait]");
    if(!frame)return false;
    let image=frame.querySelector("img");
    if(!image){image=document.createElement("img");image.alt="Photograph of test fighter";frame.appendChild(image)}
    image.src="data:image/png;base64,THIS_IS_NOT_A_VALID_IMAGE";
    return true;
   });
   assert(injected,"Broken portrait test could not locate the actual fighter photo widget");
   await page.waitForFunction(()=>{
    const frame=document.querySelector("#fighterDialog .befn-pro-photo [data-fighter-portrait]");
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
