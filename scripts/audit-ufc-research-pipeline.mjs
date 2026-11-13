#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const OWNERS={"A-F":"a-f","G-L":"g-l","M-R":"m-r","S-Z":"s-z","PRIORITY":"priority"};
const COHORTS=["champion","ranked","contender","prospect","roster"];
const norm=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const read=(name,fallback={})=>{const p=path.join(root,name);return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,"utf8")):fallback};
/**
 * Read-only assessment of how many UFC roster gaps exist AND how useful
 * prior targeted history requests actually were. Does not fetch any API data.
 */
export function auditLastFiveCoverage({coverage={},progress={},postfight={},v3={}}={}){
 const athletes=Array.isArray(coverage?.fighters)?coverage.fighters:[];
 const done=progress?.ufcHistoricalSearchDone||{};
 const search={attempted:0,foundCompletedMatches:0,zeroCompletedMatches:0,
  unresolvedSlug404:0,otherCached:0,unsearched:0,newUniqueBoutIdsIndexed:0,
  totalCompletedMatches:0};
 const gaps=[];
 const sum={activeFighters:athletes.length,withFiveKnown:0,withFiveUfcBoutIds:0,
  withFiveRecordedOutcomes:0,withThreeMeasured:0,needHistoryCheck:0,
  needStats:0,knownBoutsMissingIds:0,recordedOutcomesMissing:0,
  shiftedDateAliasesJoined:Number.isInteger(coverage?.summary?.shiftedDateAliasesJoined)?coverage.summary.shiftedDateAliasesJoined:null,
  researchedCurrentGaps:0,unsearchedCurrentGaps:0};
 for(const f of athletes){
  const recent=Array.isArray(f?.recent)?f.recent.slice(0,5):[];
  const ids=recent.filter(b=>b.boutId);
  const outcomes=recent.filter(b=>["W","L","D","NC"].includes(b.outcome));
  if(recent.length===5)sum.withFiveKnown++;
  if(recent.length===5&&ids.length===5&&new Set(ids.map(x=>String(x.boutId))).size===5)sum.withFiveUfcBoutIds++;
  if(recent.length===5&&outcomes.length===5)sum.withFiveRecordedOutcomes++;
  if(f.measuredCount>=3)sum.withThreeMeasured++;
  if(f.needsHistoryCheck)sum.needHistoryCheck++;
  if(f.needsStats)sum.needStats++;
  sum.knownBoutsMissingIds+=recent.length-ids.length;
  sum.recordedOutcomesMissing+=recent.length-outcomes.length;
  const state=done[f.slug];
  const searched=!!state;
  if(searched){
   search.attempted++;
   if(state.status==="unresolved_slug_404")search.unresolvedSlug404++;
   else if(state.status==="no_completed_ufc_matches"||state.matchedWinnerBouts===0)
    search.zeroCompletedMatches++;
   else if(Number.isInteger(state.matchedWinnerBouts)&&state.matchedWinnerBouts>0){
    search.foundCompletedMatches++;
    search.totalCompletedMatches+=state.matchedWinnerBouts;
    if(Number.isInteger(state.newIndexedBouts)&&state.newIndexedBouts>=0)
     search.newUniqueBoutIdsIndexed+=state.newIndexedBouts;
   }else search.otherCached++;
  }else search.unsearched++;
  if(f.needsHistoryCheck||f.needsStats){
   searched?sum.researchedCurrentGaps++:sum.unsearchedCurrentGaps++;
   gaps.push({name:f.name,slug:f.slug,champion:f.champion===true,
    upcoming:f.upcoming===true,ranked:f.ranked===true,
    recentKnown:recent.length,knownBoutIds:ids.length,
    measuredBouts:f.measuredCount||0,historyQueried:searched,
    searchStatus:state?.status||(searched?"done":"unsearched"),
    lastUfcFight:f.lastUfcFight||null,
    needHistory:!!f.needsHistoryCheck,needStats:!!f.needsStats});
  }
 }
 const ranked=gaps.sort((a,b)=>Number(b.champion)-Number(a.champion)||
  Number(b.upcoming)-Number(a.upcoming)||Number(b.ranked)-Number(a.ranked)||
  Number(!b.historyQueried)-Number(!a.historyQueried)||
  String(b.lastUfcFight).localeCompare(String(a.lastUfcFight))||
  a.slug.localeCompare(b.slug));
 const boards=Array.isArray(v3?.boards)?Object.fromEntries(v3.boards.map(b=>
  [b.id,b.eligible]).filter(([_,v])=>Number.isInteger(v)&&v>=0)):{};
 const provider=progress?.provider||{};
 return {schema:1,asOf:coverage?.asOf||null,activityCutoff:coverage?.activityCutoff||null,
  note:"Offline audit of saved provider observations, not independent UFC result verification. Fewer than five known results may be correct for rookies.",
  coverage:sum,targetedSearch:search,
  apiBudgetSnapshot:{collectorStatus:progress?.status||"unknown",
   providerUsedAtLastStart:Number.isInteger(provider.usedAtStart)?
    provider.usedAtStart:null,monthlyBeFnResearchCeiling:27000,
   lastSavedCalls:Number.isInteger(progress?.lastCalls)?progress.lastCalls:null,
   snapshotAt:progress?.lastRun||null},
  observedStatBouts:Number.isFinite(postfight?.metricBouts)?postfight.metricBouts:null,
  publishedV3Fighters:Number.isInteger(v3?.population)?v3.population:null,
  perMetricEligibleFighters:boards,
  quarantinedNameAliases:Array.isArray(v3?.identityReviewPending)?
   v3.identityReviewPending.length:null,
  priorityGaps:ranked.slice(0,25)};
}
export function recentHistoryStatus(f){
 const last=Array.isArray(f?.latest)?f.latest:[];
 const u=f?.ufcRecord;
 const known=!!u?.complete&&[u.wins,u.losses,u.draws,u.noContests??0].every(n=>Number.isInteger(n)&&n>=0);
 const career=known?u.wins+u.losses+u.draws+(u.noContests??0):null;
 const expected=career===null?null:Math.min(5,career);
 const issues=[];
 if(last.length>5)issues.push("too_many_fights");
 if(new Set(last.map(x=>x.date+":"+norm(x.opponent))).size!==last.length)issues.push("duplicate_bouts");
 if(expected===null)issues.push("ufc_only_career_count_not_verified");
 else if(last.length!==expected)issues.push("missing_recent_fights");
 return {careerUfcBouts:career,expectedRecentBouts:expected,recordedRecentBouts:last.length,issues};
}
export function audit({cohorts=[],queue={},workers={}}={}){
 const profiles=new Map(),duplicates=[],missing=[],uncertain=[];
 for(const cohort of cohorts)for(const [slug,f] of Object.entries(cohort.fighters||{})){
  const k=norm(f.name);
  if(profiles.has(k)){duplicates.push(f.name);continue}
  const h=recentHistoryStatus(f);profiles.set(k,{name:f.name,slug,history:h});
  if(h.issues.includes("missing_recent_fights"))missing.push({name:f.name,slug,...h});
  if(h.issues.includes("ufc_only_career_count_not_verified"))uncertain.push({name:f.name,slug});
 }
 const byWorker={};
 for(const [owner,suffix] of Object.entries(OWNERS)){
  const w=workers[owner]||{},entries=Object.values(w.fighters||{}),states={};
  for(const f of entries){const key=f.status||"unknown";states[key]=(states[key]||0)+1;}
  byWorker[owner]={historicalQueueLength:queue.historicalCounts?.[owner]??null,
   researchNotes:entries.length,states,lastUpdated:w.updatedOn??null};
 }
 return {schema:1,generatedAt:new Date().toISOString(),
  note:"Repo-only audit. NOT production QA or independent source truth.",
  counts:{reviewedProfiles:profiles.size,candidateBacklog:queue.candidateCount??null,
   priorityEntrants:queue.newCardEntrants?.length??null,
   postFightRefresh:queue.postFightRefreshCandidates?.length??null,
   previewQueueSize:queue.candidates?.length??null,
   unassignedHistorical:queue.unassignedHistoricalCandidates?.length??null,
   fullHistoricalQueue:queue.historicalCounts?Object.values(queue.historicalCounts).reduce((a,b)=>a+b,0):null,
   recentFiveFullyAuditable:profiles.size-missing.length-uncertain.length,
   recentFiveMissing:missing.length,ufcCareerCountUnverified:uncertain.length,
   duplicateProfiles:duplicates.length},
  byWorker,historyGaps:missing,missingUfcRecord:uncertain,duplicates,
  liveVerification:"not_checked_by_this_script"};
}
export function main(){
 const queue=read("data/ufc-profile-research-queue.json");
 const cohorts=COHORTS.map(x=>read("data/ufc-"+x+"-profiles.json",null)).filter(Boolean);
 const workers=Object.fromEntries(Object.entries(OWNERS).map(([o,s])=>
  [o,read("data/ufc-research-workers/"+s+".json")]));
 return {...audit({cohorts,queue,workers}),
  lastFive:auditLastFiveCoverage({
   coverage:read("data/ufc-last-five-coverage.json"),
   progress:read("data/ufcalendar-rich-progress.json"),
   postfight:read("data/ufc-postfight-metrics.json"),
   v3:read("data/ufc-fighter-v3.json")
  })
 };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=main(),c=result.counts,u=result.lastFive,output=path.join(root,"qa/ufc-research-pipeline-report.json");
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(result,null,2)+"\n");
 const summary=["## UFC fighter research pipeline","","| Metric | Count |","|---|---:|",
  ["Reviewed repository profiles",c.reviewedProfiles],
  ["Unverified backlog",c.candidateBacklog],
  ["Full historical worker pool",c.fullHistoricalQueue],
  ["Unassigned non-alphabetic historical names",c.unassignedHistorical],
  ["Priority upcoming-card entrants",c.priorityEntrants],
  ["Reviewed with auditable last five",c.recentFiveFullyAuditable],
  ["Profiles missing UFC-only career count",c.ufcCareerCountUnverified],
  ["Known incomplete last-five histories",c.recentFiveMissing]
 ].map(x=>Array.isArray(x)?"| "+x[0]+" | "+(x[1]??"unknown")+" |":x).join("\n")+
 "\n\n## UFC last-five source effectiveness (offline)\n\n"+
 ["Metric","Current value"].join(" | ")+"\n|---|---:|\n"+
 [
  ["Active fighters in saved coverage",u.coverage.activeFighters],
  ["Five recorded UFC results",u.coverage.withFiveKnown],
  ["Five results with known unique bout IDs",u.coverage.withFiveUfcBoutIds],
  ["UTC/local-day UFC history aliases safely reconciled",u.coverage.shiftedDateAliasesJoined],
  ["Three or more measured UFC bouts",u.coverage.withThreeMeasured],
  ["History enquiries still needed",u.coverage.needHistoryCheck],
  ["Active fighters yet to receive targeted history search",u.targetedSearch.unsearched],
  ["Targeted searches with at least one UFC match",u.targetedSearch.foundCompletedMatches],
  ["Targeted searches with zero UFC completed matches",u.targetedSearch.zeroCompletedMatches],
  ["Provider slug 404 responses held in negative cache",u.targetedSearch.unresolvedSlug404],
  ["New unique UFC bout IDs added by targeted search",u.targetedSearch.newUniqueBoutIdsIndexed],
  ["UFC post-fight bouts with saved measured rounds",u.observedStatBouts],
  ["Tracked UFC data calls in the last collector run",u.apiBudgetSnapshot.lastSavedCalls],
  ["Provider calls used at most recent collector start",u.apiBudgetSnapshot.providerUsedAtLastStart]
 ].map(([k,v])=>"| "+k+" | "+(v??"unknown")+" |").join("\n")+
 "\n\nRead-only progress measurements; incomplete careers and unavailable API fields are not filled with guesses.\n"+
 "\nLive Render deployment and browser QA must be checked separately.\n";
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
 console.log(summary);
 if(c.recentFiveMissing||c.duplicateProfiles)process.exitCode=1;
}