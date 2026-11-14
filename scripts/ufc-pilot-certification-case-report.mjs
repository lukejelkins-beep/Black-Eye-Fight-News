#!/usr/bin/env node
/** Offline UFC.com biography reconciliation; never claims whole career certification. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const clean=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const tokens=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(':');
const result=s=>({win:'win',w:'win',loss:'loss',l:'loss',draw:'draw',d:'draw',nc:'no_contest',no_contest:'no_contest'})[String(s??'').toLowerCase()]||null;
const near=(a,b)=>/^\d{4}-\d{2}-\d{2}$/.test(String(a))&&/^\d{4}-\d{2}-\d{2}$/.test(String(b))&&
 Math.abs(Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))<=86400000;
const feederTitle=s=>/\b(?:dana\s+white[’']?s\s+)?contender\s+series\b|\bdwcs\b|\broad\s+to\s+ufc\b/i.test(String(s??''));
// Explicit UFC.com-vetted Korean given/family name order; do not generalize
// to unrelated homonymous fighters without independent event/fight evidence.
const reviewedOpponentAliases=new Set(['hyunsungpark|parkhyunsung']);
const sameOpponent=(a,b,exactNativeId)=>{
 const na=clean(a),nb=clean(b);
 if(!na||!nb)return false;
 if(na===nb||(tokens(a)&&tokens(a)===tokens(b)))return true;
 const alias=[na,nb].sort().join('|');
 // Middleweight Bruno Silva is a different athlete. Only source-confirmed
 // 2025-10-18 UFC Vancouver bout 83254 authorises this abbreviated name.
 if(alias==='brunogustavodasilva|brunosilva')
  return String(exactNativeId)==='83254';
 return reviewedOpponentAliases.has(alias);
};
export function comparePilot(official,profile,nativeBouts={}){
 const source=official?.bouts||[];
 const saved=(profile?.recentHistory||[]).filter(h=>String(h.promotion||h.org||'').toLowerCase()==='ufc'&&result(h.result||h.outcome||h.status));
 const seen=new Set(),matched=[],missing=[];
 for(const bout of source){
  const ix=saved.findIndex((h,i)=>!seen.has(i)&&near(bout.date,h.date)&&sameOpponent(bout.opponent,h.opponent,h.boutId)&&
   result(bout.result)===result(h.result||h.outcome||h.status));
  if(ix<0)missing.push({date:bout.date,opponent:bout.opponent,result:result(bout.result)});
  else {seen.add(ix);matched.push({date:bout.date,opponent:bout.opponent,nativeBoutId:String(saved[ix].boutId||'')});}
 }
 const extra=saved.flatMap((h,i)=>{
  if(seen.has(i))return [];
  const native=nativeBouts[String(h.boutId||'')]||{};
  const title=native.event||h.event||h.eventName||'';
  // Source biography may match two DISTINCT provider IDs for the SAME
  // event/opponent/outcome. Flag for identity reconciliation, not a new bout.
  const counterpart=source.find(b=>near(b.date,h.date)&&
   sameOpponent(b.opponent,h.opponent,h.boutId)&&
   result(b.result)===result(h.result||h.outcome||h.status));
  const matchedCounterpart=counterpart?matched.find(m=>near(m.date,counterpart.date)&&
   sameOpponent(m.opponent,counterpart.opponent,m.nativeBoutId)&&
   String(m.nativeBoutId)!==String(h.boutId||'')):null;
  return [{date:h.date,opponent:h.opponent,result:result(h.result||h.outcome||h.status),
   nativeBoutId:String(h.boutId||''),event:title,
   scope:matchedCounterpart?'duplicate_native_fight_identity_review':
    feederTitle(title)?'feeder_excluded_from_ufc_career':'requires_independent_official_event_review',
   ...(matchedCounterpart?{matchedAlternateNativeBoutId:matchedCounterpart.nativeBoutId}: {})}];
 });
 // Produce actionable saved-cache candidates for each missing official bout.
 // Candidates are never treated as recovered, verified, or certified.
 const missingWithCandidates=missing.map(bout=>{
  const candidates=saved.filter(h=>near(bout.date,h.date)&&
   sameOpponent(bout.opponent,h.opponent,h.boutId)).map(h=>({
    nativeBoutId:String(h.boutId||''),savedDate:h.date,
    savedResult:result(h.result||h.outcome||h.status),
    reviewReason:result(h.result||h.outcome||h.status)!==bout.result?
     'result_conflict':'same_opponent_date_unmatched_identity'
   }));
  return {...bout,savedCandidates:candidates};
 });
 return {officialCount:source.length,savedUfcLabeledRows:saved.length,matchedCount:matched.length,
  missingCount:missing.length,extraCount:extra.length,matched,
  missing:missingWithCandidates,extra};
}
export function buildPilotReport(approval,inventory,research,progress){
 if(approval?.status!=='approved'||approval.rosterAsOf!=='2026-11-14'||approval.approvedFighters?.length!==783||
    new Set(approval.approvedFighters).size!==783||inventory?.rosterAsOf!==approval.rosterAsOf)
  throw Error('Approved immutable 783-fighter roster and same-day official source evidence required');
 const slugs=['bruno-gustavo-da-silva','carlos-hernandez-7','park-hyun-sung'];
 const fighters={};
 for(const slug of slugs){
  if(!approval.approvedFighters.includes(slug)||!inventory.fighters?.[slug]?.sourceUrl?.startsWith('https://www.ufc.com/athlete/'))
   throw Error('Missing source-linked approved pilot: '+slug);
  fighters[slug]={name:inventory.fighters[slug].fighterName,officialSource:inventory.fighters[slug].sourceUrl,
   ...comparePilot(inventory.fighters[slug],research.profiles?.[slug],progress.bouts)};
 }
 const rows=Object.values(fighters);
 return {schema:1,scope:'ufc-official-three-pilot-certification-case-review',rosterAsOf:approval.rosterAsOf,
  status:'read_only_reconciliation_not_full_career_certification',
  summary:{pilots:rows.length,officialUfcBouts:rows.reduce((n,x)=>n+x.officialCount,0),
   matchedSaved:rows.reduce((n,x)=>n+x.matchedCount,0),missingSaved:rows.reduce((n,x)=>n+x.missingCount,0),
   extraUfcLabelledRows:rows.reduce((n,x)=>n+x.extraCount,0),newlyCertified:0},
  fighters,note:'UFC.com biography minimum-bout inventory is not exhaustive UFCStats fighter and fight-link proof. Resolve extra, feeder, identity and missing history; never certify from this report.'};
}
function main(){
 const report=buildPilotReport(read('data/ufc-36-month-roster-approval.json'),read('data/ufc-official-career-bout-inventory.json'),
  read('data/ufcalendar-fighter-research.json'),read('data/ufcalendar-rich-progress.json'));
 const target=path.join(root,'qa/ufc-pilot-certification-case-review.json');
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');
 console.log('BEFN_UFC_PILOT_CERTIFICATION='+JSON.stringify({summary:report.summary,
  fighters:Object.fromEntries(Object.entries(report.fighters).map(([slug,f])=>
   [slug,{official:f.officialCount,matched:f.matchedCount,missing:f.missing,extra:f.extra}]))}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
