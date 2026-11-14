#!/usr/bin/env node
/** Offline source-URL review only: no full career attestation and no API calls. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const norm=x=>String(x??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const nameTokens=x=>String(x??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/([a-z])([A-Z])/g,'$1 $2').split(/[^a-z0-9]+/).filter(Boolean).sort().join(':');
const outcome=x=>({win:'win',w:'win',loss:'loss',l:'loss',draw:'draw',d:'draw',nc:'no_contest',no_contest:'no_contest'})[String(x??'').toLowerCase()]||null;
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x??''))&&!Number.isNaN(Date.parse(x+'T00:00:00Z'));
const close=(a,b)=>validDate(a)&&validDate(b)&&Math.abs(Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))<=86400000;
const knownAliases=new Set(['hyunsungpark|parkhyunsung']);
const nameMatches=(a,b,day,slug,bid)=>{
 const na=norm(a),nb=norm(b),pair=[na,nb].sort().join('|');
 if(!na||!nb)return false;
 if(na===nb||(nameTokens(a)&&nameTokens(a)===nameTokens(b)))return true;
 if(pair==='brunogustavodasilva|brunosilva')
  return slug==='park-hyun-sung'&&day==='2025-10-18'&&['38150','83254'].includes(String(bid));
 return knownAliases.has(pair);
};
const sourceKey=r=>[r.date,norm(r.opponent),outcome(r.result)].join('|');
export function auditThreePilotSources(approval,official,evidence,research,progress){
 if(approval?.schema!==1||approval.scope!=='ufc-36-month-roster'||approval.status!=='approved'||
    approval.rosterAsOf!=='2026-11-14'||approval.approvedFighters?.length!==783||
    new Set(approval.approvedFighters).size!==783||
    official?.scope!=='ufc-official-career-bout-inventory'||official.rosterAsOf!==approval.rosterAsOf||
    evidence?.scope!=='ufc-independent-three-pilot-source-link-review'||evidence.rosterAsOf!==approval.rosterAsOf||
    evidence.sourceCoverageAttested!==false||evidence.fullCareerIndependentlyCertified!==false)
  throw Error('Immutable approved roster and fail-closed separate source research required');
 if(!/^[0-9a-f]{40}$/.test(evidence.source?.commit||''))throw Error('Unpinned historical third-party source');
 const keys=Object.keys(evidence.fighters||{}).sort();
 const pilots=['bruno-gustavo-da-silva','carlos-hernandez-7','park-hyun-sung'].sort();
 if(JSON.stringify(keys)!==JSON.stringify(pilots))throw Error('Unexpected source pilot identity cohort');
 const summary={fighters:3,officialBiographicalBouts:0,sourceLinkedBoutRows:0,exactSourceInventoryMatches:0,
  sourceInventoryMismatch:0,savedHistoryMatches:0,officialRowsMissingFromSavedHistory:0,
  additionalSavedNativeRows:0,savedDuplicateIdentityCases:0,
  incompleteIndependentFullCareers:3,independentlyCertifiedFullCareers:0};
 const out={};
 for(const slug of pilots){
  if(!approval.approvedFighters.includes(slug))throw Error('Source athlete not approved');
  const f=evidence.fighters[slug],bio=official.fighters?.[slug];
  if(!f||!bio||f.ufcComUrl!==bio.sourceUrl||
    !/^https:\/\/ufcstats\.com\/fighter-details\/[0-9a-f]{16}$/.test(f.ufcStatsFighterUrl))
   throw Error('Official fighter source identity mismatch: '+slug);
  const external=f.bouts||[],bibouts=bio.bouts||[];
  if(!external.length||external.length!==bibouts.length||
    new Set(external.map(x=>x.fightUrl)).size!==external.length||
    new Set(external.map(sourceKey)).size!==external.length)throw Error('Source row total or duplicate bout identity');
  const bad=external.filter(x=>!validDate(x.date)||!norm(x.opponent)||!outcome(x.result)||
    !/^https:\/\/ufcstats\.com\/fight-details\/[0-9a-f]{16}$/.test(x.fightUrl)||
    !bibouts.some(b=>sourceKey(b)===sourceKey(x)));
  const missingOfficial=bibouts.filter(x=>!external.some(b=>sourceKey(b)===sourceKey(x)));
  if(bad.length||missingOfficial.length)throw Error('Independent fight-detail URLs not mapped to exact official UFC biography: '+slug);
  const history=(research.profiles?.[slug]?.recentHistory||[]).filter(h=>
    String(h.promotion||h.org||'').toLowerCase()==='ufc'&&h.source==='native'&&outcome(h.result));
  const seen=new Set(), matched=[], missing=[];
  for(const b of external){
   const ix=history.findIndex((h,i)=>!seen.has(i)&&close(b.date,h.date)&&
     nameMatches(b.opponent,h.opponent,b.date,slug,h.boutId)&&outcome(b.result)===outcome(h.result));
   if(ix<0)missing.push({date:b.date,opponent:b.opponent,sourceFightUrl:b.fightUrl,result:outcome(b.result)});
   else {seen.add(ix);matched.push({date:b.date,opponent:b.opponent,
     sourceFightUrl:b.fightUrl,nativeFightId:String(history[ix].boutId)})}
  }
  const extras=history.flatMap((h,i)=>{
   if(seen.has(i))return [];
   const otherMatch=external.find(b=>close(b.date,h.date)&&
     nameMatches(b.opponent,h.opponent,b.date,slug,h.boutId)&&outcome(b.result)===outcome(h.result));
   return [{date:h.date,opponent:h.opponent,nativeFightId:String(h.boutId),
     status:otherMatch?'possible_duplicate_native_identity':'requires_official_event_review',
     ...(otherMatch?{correspondingSourceFightUrl:otherMatch.fightUrl}:{})}];
  });
  summary.officialBiographicalBouts+=bibouts.length;
  summary.sourceLinkedBoutRows+=external.length;
  summary.exactSourceInventoryMatches+=matched.length;
  summary.savedHistoryMatches+=matched.length;
  summary.officialRowsMissingFromSavedHistory+=missing.length;
  summary.additionalSavedNativeRows+=extras.length;
  summary.savedDuplicateIdentityCases+=extras.filter(x=>x.status==='possible_duplicate_native_identity').length;
  out[slug]={fighterUrl:f.ufcStatsFighterUrl,ufcComUrl:f.ufcComUrl,
   officialUfcBoutCount:bibouts.length,sourceLinkedBoutCount:external.length,
   nativeMatches:matched.length,missingSaved:missing,
   extraSaved:extras,sourceLinkReconciliation:'source_bout_links_are_not_full_listing_attestation'};
 }
 return {schema:1,scope:'ufc-three-pilot-independent-source-link-qa',
  rosterAsOf:approval.rosterAsOf,sourceCommit:evidence.source.commit,
  status:'exact_bout_url_correlated_not_exhaustive_career_certification',
  summary,fighters:out,
  note:'24 independently URL-linked UFCStats-derived source rows (22 unique fights due shared opponents) and 24 UFC.com official-biography records crosschecked; this does NOT independently attest a complete official UFCStats fighter listing as of 2026-11-14. Verify native duplicate 38150/83254 before career certification.'};
}
function main(){
 const out=auditThreePilotSources(read('data/ufc-36-month-roster-approval.json'),
  read('data/ufc-official-career-bout-inventory.json'),
  read('data/ufc-three-pilot-source-linked-evidence.json'),
  read('data/ufcalendar-fighter-research.json'),read('data/ufcalendar-rich-progress.json'));
 const file=path.join(root,'qa/ufc-three-pilot-source-link-audit.json');
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,JSON.stringify(out,null,2)+'\n');
 console.log('BEFN_UFC_THREE_PILOT_SOURCE_QA='+JSON.stringify({summary:out.summary,
   fighters:Object.fromEntries(Object.entries(out.fighters).map(([slug,f])=>
      [slug,{official:f.officialUfcBoutCount,nativeMatches:f.nativeMatches,missingSaved:f.missingSaved,extraSaved:f.extraSaved}]))}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
