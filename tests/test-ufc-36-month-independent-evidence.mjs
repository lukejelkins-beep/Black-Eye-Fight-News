import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {isOfficialUfcEvent} from "../scripts/ufc-official-event-scope.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const key=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]+/g,"");
const validDate=x=>{if(typeof x!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
 const d=new Date(x+"T00:00:00Z");return !Number.isNaN(d.getTime())&&
  d.toISOString().slice(0,10)===x;};
const https=x=>{try{const u=new URL(x);return u.protocol==="https:"&&!!u.hostname}
 catch{return false}};
const sports=new Set(["mma","boxing","kickboxing","muay-thai","grappling",
 "submission-grappling","bjj","wrestling","bare-knuckle-boxing"]);
const ended=new Set(["completed","draw","no_contest"]);

export function auditIndependentEvidence(ledger,research,progress){
 const errors=[],byRule={},seen=new Set(),today=ledger?.asOf;
 const add=(code,slug,detail)=>errors.push({code,slug,detail});
 if(ledger?.schema!==1||!validDate(today))add("schema_or_asof","","Invalid ledger schema/asOf");
 const fighters=ledger?.fighters||{};
 let count=0,matched=0;
 for(const [slug,rows] of Object.entries(fighters)){
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))add("invalid_slug",slug,"Invalid fighter slug");
  if(!Array.isArray(rows)||!rows.length){add("missing_rows",slug,"No reviewed bouts");continue}
  const profile=research?.profiles?.[slug];
  if(!profile)add("missing_fighter",slug,"No matching cached fighter");
  const history=Array.isArray(profile?.recentHistory)?profile.recentHistory:[];
  for(const row of rows){
   count++;
   const boutKey=slug+"|"+row.date+"|"+key(row.opponent);
   if(seen.has(boutKey))add("duplicate",slug,boutKey);
   seen.add(boutKey);
   if(!validDate(row.date)||validDate(today)&&row.date>today)
    add("invalid_fight_date",slug,String(row.date));
   if(!validDate(row.checkedAt)||validDate(today)&&row.checkedAt>today)
    add("invalid_checked_at",slug,String(row.checkedAt));
   if(!https(row.source))add("invalid_source",slug,String(row.source));
   if(!sports.has(row.ruleset))add("unknown_ruleset",slug,String(row.ruleset));
   if(typeof row.opponent!=="string"||!row.opponent.trim())
    add("missing_opponent",slug,String(row.opponent));
   const found=history.find(h=>h?.date===row.date&&key(h.opponent)===key(row.opponent));
   if(!found){add("unmatched_source",slug,String(row.date)+" / "+String(row.opponent));continue}
   matched++;
   const storedSport=String(found.sport||found.ruleset||"").toLowerCase();
   const storedOrg=String(found.promotion||found.org||"").toLowerCase();
   if(row.ruleset!=="mma"&&["mma","mixed-martial-arts"].includes(storedSport))
    add("contradictory_mma_ruleset",slug,String(row.date));
   if(row.ruleset==="mma"&&storedOrg==="ufc")
    add("official_ufc_marked_outside_mma",slug,String(row.date));
   byRule[row.ruleset]=(byRule[row.ruleset]||0)+1;
  }
 }
 const indexedLatest=new Map();
 for(const bout of Object.values(progress?.bouts||{})){
  if(bout?.org!=="ufc"||!ended.has(bout.status)||
    !isOfficialUfcEvent(bout.event)||!validDate(bout.eventDate)||
    validDate(today)&&bout.eventDate>today)continue;
  for(const side of ["a","b"]){
   const slug=bout[side]?.slug;
   if(slug&&(!indexedLatest.has(slug)||indexedLatest.get(slug)<bout.eventDate))
    indexedLatest.set(slug,bout.eventDate);
  }
 }
 // Positive roster status never waives a separate later MMA bout or exit.
 // Confirmations require a current official athlete page and exact indexed UFC date.
 const confirmations=ledger?.confirmedCurrentRoster||[];
 const seenCurrent=new Set();
 for(const item of confirmations){
  const slug=item?.slug||"";
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || seenCurrent.has(slug))
    add("duplicate_or_invalid_active_slug",slug,"Missing/duplicate slug");
  seenCurrent.add(slug);
  if(item?.status!=="active")add("invalid_active_status",slug,String(item?.status));
  if(!validDate(item?.lastUfcFight)||item.lastUfcFight>today)
    add("invalid_active_last_ufc",slug,String(item?.lastUfcFight));
  if(!validDate(item?.checkedAt)||item.checkedAt>today)
    add("invalid_active_checked_at",slug,String(item?.checkedAt));
  if(!/^https:\/\/www\.ufc\.com\/athlete\/[a-z0-9-]+$/.test(item?.source||""))
    add("invalid_active_official_source",slug,String(item?.source));
  if(indexedLatest.get(slug)!==item.lastUfcFight)
    add("stale_active_last_ufc",slug,"verified="+String(item.lastUfcFight)+
      " indexed="+String(indexedLatest.get(slug)));
  if((ledger?.departures||[]).some(d=>d.slug===slug&&d.lastUfcFight===item.lastUfcFight))
    add("conflicting_active_departure",slug,item.lastUfcFight);
 }
 const exits=ledger?.departures||[];
 for(const item of exits){
  if(!item?.slug||!validDate(item.lastUfcFight))
   add("invalid_departure",String(item?.slug),String(item?.lastUfcFight));
  if(!["confirmed_retired","confirmed_left_ufc"].includes(item.reason))
   add("invalid_departure_reason",String(item.slug),String(item.reason));
  if(!https(item?.evidence?.source))
   add("invalid_departure_source",String(item.slug),String(item?.evidence?.source));
  if(indexedLatest.get(item.slug)!==item.lastUfcFight)
   add("stale_departure_fight",String(item.slug),
    "saved="+String(item.lastUfcFight)+" indexed="+String(indexedLatest.get(item.slug)));
 }
 return {errors,summary:{fighters:Object.keys(fighters).length,bouts:count,
  exactHistoryMatches:matched,departures:exits.length,
  currentOfficialActive:confirmations.length,rulesets:byRule,
  indexedOfficialUfcAthletes:indexedLatest.size}};
}

test("real independently reviewed UFC evidence matches every saved fighter and UFC date",()=>{
 const result=auditIndependentEvidence(
  read("data/ufc-36-month-reviewed-evidence.json"),
  read("data/ufcalendar-fighter-research.json"),
  read("data/ufcalendar-rich-progress.json"));
 assert.deepEqual(result.errors,[],"Evidence QA issues: "+JSON.stringify(result.errors.slice(0,20)));
 assert.equal(result.summary.bouts,result.summary.exactHistoryMatches);
 console.log("BEFN independent evidence audit "+JSON.stringify(result.summary));
});

test("independent evidence audit fails closed for duplicate, mismatched and unverified facts",()=>{
 const progress={bouts:{"1":{org:"ufc",status:"completed",
  event:"UFC Fight Night: Example",eventDate:"2025-01-01",
  a:{slug:"example"},b:{slug:"rival"}}}};
 const history={profiles:{example:{recentHistory:[
  {date:"2025-06-01",opponent:"Exact Rival",result:"win",promotion:""}]}}};
 const valid={schema:1,asOf:"2026-11-13",fighters:{example:[{
  date:"2025-06-01",opponent:"Exact Rival",ruleset:"mma",
  promotion:"pfl",checkedAt:"2026-11-13",source:"https://example.org/verified"
 }]},departures:[{slug:"example",reason:"confirmed_left_ufc",
   lastUfcFight:"2025-01-01",evidence:{source:"https://example.org/exit"}}]};
 assert.deepEqual(auditIndependentEvidence(valid,history,progress).errors,[]);
 const broken=structuredClone(valid);
 broken.fighters.example.push({...broken.fighters.example[0],source:"not-a-url"});
 broken.fighters.example.push({...broken.fighters.example[0],
  opponent:"Different Fighter",ruleset:"unknown",date:"2027-01-01",
  checkedAt:"2027-01-01"});
 broken.departures[0].lastUfcFight="2024-12-31";
 const codes=new Set(auditIndependentEvidence(broken,history,progress).errors.map(e=>e.code));
 for(const required of ["duplicate","invalid_source","invalid_fight_date",
  "invalid_checked_at","unmatched_source","unknown_ruleset","stale_departure_fight"])
  assert(codes.has(required),"Expected "+required);
});

test("official status evidence must be current, exact-match and noncontradictory",()=>{
 const progress={bouts:{"11":{org:"ufc",status:"completed",event:"UFC Fight Night: Test",
  eventDate:"2025-01-01",a:{slug:"a"},b:{slug:"opponent"}}}};
 const base={schema:1,asOf:"2026-11-14",fighters:{},departures:[],
  confirmedCurrentRoster:[{slug:"a",lastUfcFight:"2025-01-01",status:"active",
   checkedAt:"2026-11-14",source:"https://www.ufc.com/athlete/valid"}]};
 assert.deepEqual(auditIndependentEvidence(base,{profiles:{}},progress).errors,[]);
 const bad=structuredClone(base);
 bad.confirmedCurrentRoster.push({...base.confirmedCurrentRoster[0],
  source:"https://example.org/fake",checkedAt:"2026-11-15",
  lastUfcFight:"2025-02-01"});
 bad.departures=[{slug:"a",lastUfcFight:"2025-01-01",reason:"confirmed_retired",
  evidence:{source:"https://example.org/retirement"}}];
 const codes=new Set(auditIndependentEvidence(bad,{profiles:{}},progress).errors.map(x=>x.code));
 for(const code of ["duplicate_or_invalid_active_slug","invalid_active_checked_at",
  "invalid_active_official_source","stale_active_last_ufc",
  "conflicting_active_departure"])assert(codes.has(code),code);
});
