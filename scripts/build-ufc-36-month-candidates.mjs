#!/usr/bin/env node
/**
 * UFC 36-month candidate manifest: local cached data only, no provider calls.
 * Keep the public V3 18-month audit independent until scope and retirement
 * checks have been verified. Do not treat this as proof of active UFC contract.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {auditUfcLastFive} from "./build-ufc-last-five-coverage.mjs";
import {isOfficialUfcEvent} from "./ufc-official-event-scope.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
function read(name,fallback){
 try{return JSON.parse(fs.readFileSync(path.join(root,name),"utf8"));}
 catch(e){if(e.code==="ENOENT")return fallback;throw e;}
}
/** Research review dates are authored in Melbourne local time.
 * Use that same calendar day for the rolling census and evidence cut-off,
 * including the UTC hours before Melbourne midnight. */
export function melbourneResearchDay(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Australia/Melbourne',
   year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const part=name=>parts.find(x=>x.type===name)?.value;
 return part('year')+'-'+part('month')+'-'+part('day');
}
export function candidateManifest(progress,research,postfight,champions,opts){
 const original=opts?.rosterReview||{};
 const supplement=opts?.evidenceReview?.asOf&&opts.evidenceReview.asOf<=opts.asOf?
   opts.evidenceReview:{};
 const originalValid=original.asOf&&original.asOf<=opts.asOf;
 // Only a directly verified, dated *official UFC* active-status record
 // can clear the old one-time 18–24m "check roster" flag. This never
 // dismisses a newer unknown bout, confirmed later MMA, or exit.
 const confirmedCurrent=new Set((supplement.confirmedCurrentRoster||[])
   .filter(e=>e?.status==="active"&&e.slug&&e.lastUfcFight&&
     /^https:\/\/www\.ufc\.com\/athlete\/[a-z0-9-]+$/.test(e.source||"")&&
     /^\d{4}-\d{2}-\d{2}$/.test(e.checkedAt||"")&&
     e.checkedAt<=opts.asOf&&e.lastUfcFight<=opts.asOf)
   .map(e=>e.slug+"|"+e.lastUfcFight));
 // Some verified non-UFC professional MMA outcomes are absent from the
 // UFCalendar career cache. Preserve them as a dated, source-backed exclusion
 // tied to the fighter's *exact* last official UFC bout. This is NOT used for
 // the public 18-month cohort and does not fabricate a cached provider bout.
 const independentlyVerifiedMma=(supplement.independentLaterMma||[])
   .filter(e=>e&&e.slug&&e.reason==="later_professional_mma_outside_ufc"&&
     /^https:\/\/\S+/.test(e?.evidence?.source||"")&&
     /^\d{4}-\d{2}-\d{2}$/.test(e.lastUfcFight||"")&&
     /^\d{4}-\d{2}-\d{2}$/.test(e.evidence?.date||"")&&
     e.evidence.date>e.lastUfcFight&&e.evidence.date<=opts.asOf&&
     /^\d{4}-\d{2}-\d{2}$/.test(e.checkedAt||"")&&e.checkedAt<=opts.asOf&&
     typeof e.evidence.opponent==="string"&&e.evidence.opponent.trim()&&
     typeof e.evidence.promotion==="string"&&e.evidence.promotion!=="ufc");
 const rosterReview={
   asOf:opts.asOf,
   excluded:[...(originalValid?original.excluded||[]:[]),
      ...(supplement.departures||[]),...independentlyVerifiedMma],
   reviewCandidates:originalValid?(original.reviewCandidates||[])
      .filter(row=>!confirmedCurrent.has(row.slug+"|"+row.lastUfcFight)):[]
 };
 const audit=auditUfcLastFive(progress,research,postfight,champions,
   {...opts,activityMonths:36,rosterReview,
    verifiedOtherBoutRulesets:supplement});
 // A complete event-list cursor does NOT establish that all fights were
 // indexed: cards discovered during the widened search can still lack details.
 // Fail closed until every completed official UFC event in this window has
 // its event-detail response cached. Exclude feeder events and future cards.
 const allOfficialEvents=Object.entries(progress?.eventIndex||{}).filter(([key,event])=>
   event?.org==="ufc"&&event.date>=audit.activityCutoff&&
   event.date<=opts.asOf&&
   ["completed","finished","final","ended"].includes(event.status)&&
   isOfficialUfcEvent(event.title));
 const missingDetails=allOfficialEvents.filter(([key])=>!progress?.eventDetails?.[key]);
 const indexed36=Number(progress?.historicalWindowMonthsUfc)>=36&&
   progress?.historicalComplete?.ufc===true;
 const complete=indexed36&&missingDetails.length===0;
 return {...audit,
   indexCompleteness:complete?"36_month_event_scan_complete":"36_month_event_scan_incomplete",
   officialCompletedEventsIndexed:allOfficialEvents.length,
   missingOfficialUfcEventDetails:missingDetails.length,
   missingOfficialEventKeys:missingDetails.slice(0,50).map(([key])=>key),
   verification:"candidate_list_only_contract_and_retirement_checks_pending",
   note:"Candidates have recent official UFC bouts and no newer confirmed non-UFC MMA fight in available cached observations. Unknown history, retirement and promotion affiliation require independent checks. Do not automatically publish or claim 36-month completeness."};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const asOf=process.argv[2]||melbourneResearchDay();
 const data=candidateManifest(
  read("data/ufcalendar-rich-progress.json",{}),
  read("data/ufcalendar-fighter-research.json",{}),
  read("data/ufc-postfight-metrics.json",{}),
  read("data/ufc-champion-profiles.json",{}),{
    asOf,
    upcoming:read("data/upcoming-cards.json",{}),
    verifiedMixedMma:read("data/ufc-verified-mixed-rules-mma.json",{}),
    rosterReview:read("data/ufc-18-to-24-month-review-2026-11-13.json",{}),
    evidenceReview:read("data/ufc-36-month-reviewed-evidence.json",{}),
    ranked:[
      read("data/ufc-ranked-profiles.json",{}),
      read("data/ufc-contender-profiles.json",{}),
      read("data/ufc-prospect-profiles.json",{})
    ]
  });
 const out=path.join(root,"data/ufc-36-month-candidates.json");
 fs.writeFileSync(out,JSON.stringify(data,null,2)+"\n","utf8");
 console.log("UFC 36-month candidate scan",JSON.stringify({
   indexCompleteness:data.indexCompleteness,
   candidates:data.summary.activeFighters,
   toReview:data.summary.latestPromotionReviewRequired,
   excludedLaterNonUfcMma:data.summary.excludedLaterNonUfcMma,
   missingOfficialUfcEventDetails:data.missingOfficialUfcEventDetails
 }));
}
