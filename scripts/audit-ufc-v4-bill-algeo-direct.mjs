#!/usr/bin/env node
/* Read-only UFC career proof attempt for Bill Algeo.
 * Official UFC biography + ten independently source-linked fight pages.
 * Report native identities and evidence gaps; never call paid provider,
 * modify caches, or certify on a same-count/name match alone.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const norm=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const result=x=>({win:"win",w:"win",loss:"loss",l:"loss",draw:"draw",d:"draw",nc:"no_contest",no_contest:"no_contest"})[String(x||"").toLowerCase()]||null;
const dayDelta=(a,b)=>Math.round((Date.parse(a+"T00:00:00Z")-Date.parse(b+"T00:00:00Z"))/86400000);
const evidence=read("data/ufc-v4-bill-algeo-fight-evidence-20261114.json");
const approval=read("data/ufc-36-month-roster-approval.json");
const research=read("data/ufcalendar-fighter-research.json");
const progress=read("data/ufcalendar-rich-progress.json");
const postfight=read("data/ufc-postfight-metrics.json");
const slug=evidence.fighterSlug;
if(approval.status!=="approved"||approval.approvedFighters.length!==783||
  !approval.approvedFighters.includes(slug)||evidence.rosterAsOf!==approval.rosterAsOf)
  throw Error("BEFN_BILL_CAREER_INVALID_APPROVED_SNAPSHOT");
const profile=research.profiles?.[slug];
if(!profile||norm(profile.name)!==norm(evidence.fighterName))
  throw Error("BEFN_BILL_CAREER_FIGHTER_IDENTITY_UNRESOLVED");
const saved=(profile.recentHistory||[]).filter(r=>String(r.promotion||r.org||"").toLowerCase()==="ufc");
const metrics=new Map((postfight.fighters?.[slug]?.careerBouts||[]).map(r=>[String(r.boutId),r]));
const seen=new Set(),ids=new Set(),blockers=[],rows=[];
const expectedMetrics=["sigLanded","sigAttempted","knockdowns","takedowns","takedownAttempts","subAttempts","controlSec"];
for(const fight of evidence.bouts){
 const sourceId=fight.sourceFightPage?.match(/\/fight\/([0-9a-f]{16})\/?$/)?.[1];
 const refId=fight.ufcStatsFightReference?.match(/\/fight-details\/([0-9a-f]{16})$/)?.[1];
 if(!sourceId||sourceId!==refId){blockers.push("invalid_source_reference:"+fight.date);continue;}
 if(seen.has(refId))blockers.push("duplicate_source_bout:"+refId);seen.add(refId);
 const candidates=saved.filter(r=>Math.abs(dayDelta(r.date,fight.date))<=1&&
  norm(r.opponent)===norm(fight.opponent)&&result(r.result||r.outcome||r.status)===fight.result);
 if(candidates.length!==1)blockers.push("source_to_saved_ambiguous:"+fight.date+":"+fight.opponent);
 const savedRow=candidates.length===1?candidates[0]:null;
 const nativeId=String(savedRow?.boutId||"");
 if(!/^[1-9]\d+$/.test(nativeId)||seen.has("native:"+nativeId))blockers.push("native_id_not_unique:"+nativeId);
 seen.add("native:"+nativeId);if(nativeId)ids.add(nativeId);
 const native=progress.bouts?.[nativeId],measured=metrics.get(nativeId);
 if(native?.org!=="ufc"||/(contender series|road to ufc|dwcs)/i.test(native?.event||""))blockers.push("wrong_competition:"+nativeId);
 if(!native||Math.abs(dayDelta(native.eventDate,fight.date))>1)blockers.push("native_date_conflict:"+nativeId);
 const corners=native?[[native.a,native.b],[native.b,native.a]].filter(([self,other])=>
  self&&other&&(self.slug===slug||norm(self.name)===norm(profile.name))&&norm(other.name)===norm(fight.opponent)):[];
 if(corners.length!==1)blockers.push("native_fighter_opponent_collision:"+nativeId);
 const [self,other]=corners[0]||[];
 const winner=native?.result?.winnerId;
 const nativeResult=native?.status==="no_contest"||native?.result?.method==="no_contest"?"no_contest":
  native?.status==="draw"||(!winner&&native?.result?.method==="draw")?"draw":
  winner&&String(winner)===String(self?.id)?"win":
  winner&&String(winner)===String(other?.id)?"loss":null;
 if(nativeResult!==fight.result)blockers.push("native_outcome_conflict:"+nativeId);
 const lacking=expectedMetrics.filter(k=>!Number.isFinite(measured?.metrics?.[k]));
 if(lacking.length||!Number.isFinite(measured?.cageSec)||measured.cageSec<=0)blockers.push("missing_measured_stats:"+nativeId);
 rows.push({officialDate:fight.date,opponent:fight.opponent,result:fight.result,
  sourceFightPage:fight.sourceFightPage,ufcStatsFightReference:fight.ufcStatsFightReference,
  nativeId,nativeSavedDate:savedRow?.date||null,nativeFighterId:self?.id||null,
  nativeResult,event:native?.event||null,measured:Boolean(measured),missingMetrics:lacking});
}
const extras=saved.filter(r=>!rows.some(x=>String(r.boutId)===x.nativeId));
for(const extra of extras){
 const excluded=evidence.exclude.some(x=>x.date===extra.date&&
  norm(x.opponent)===norm(extra.opponent)&&result(extra.result)===x.result);
 if(!excluded)blockers.push("unreviewed_saved_ufc_row:"+extra.date+":"+extra.opponent);
}
const uniqueNumericIdentities=new Set(rows.map(x=>String(x.nativeFighterId||"")).filter(Boolean));
if(uniqueNumericIdentities.size!==1)blockers.push("numeric_fighter_identity_conflict");
if(rows.length!==evidence.bouts.length||ids.size!==evidence.bouts.length)blockers.push("source_vs_native_count_incomplete");
const out={schema:1,scope:"ufc-v4-bill-algeo-independent-source-native-reconciliation",
 asOf:approval.rosterAsOf,fighterSlug:slug,sourceCount:evidence.bouts.length,
 savedRows:saved.length,matchedNativeRows:rows.length,nativeFighterIds:[...uniqueNumericIdentities],
 certified:false,sourceCoverageAttested:false,blockers:[...new Set(blockers)],
 excludedNonUfc:extras,rows,
 note:"Offline reconciliation and fight link crosscheck only. Full independent completeness attestation remains separate from matching the known saved record; no paid provider requests or cache changes."};
fs.mkdirSync(path.join(root,"qa"),{recursive:true});
fs.writeFileSync(path.join(root,"qa/ufc-v4-bill-algeo-source-native-reconciliation.json"),JSON.stringify(out,null,2)+"\n");
console.log("BEFN_V4_BILL_ALGEO_DIRECT "+JSON.stringify({
 source:out.sourceCount,saved:out.savedRows,matched:out.matchedNativeRows,
 fighterIds:out.nativeFighterIds,blockers:out.blockers,
 bouts:out.rows.map(x=>({id:x.nativeId,date:x.officialDate,saved:x.nativeSavedDate,opp:x.opponent,
   source:x.ufcStatsFightReference,nativeResult:x.nativeResult,measured:x.measured,missing:x.missingMetrics}))}));
