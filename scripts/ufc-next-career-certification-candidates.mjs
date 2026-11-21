#!/usr/bin/env node
/** Read-only certification candidate triage excluding the three official-pilot exceptions.
 * Does not infer career completeness or write collector-owned caches.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
export const EXCEPTIONS=new Set(['bruno-gustavo-da-silva','carlos-hernandez-7','park-hyun-sung']);
export function triage(approval,foundation,research,progress){
 if(approval?.status!=='approved'||approval?.approvedFighters?.length!==783||
  new Set(approval.approvedFighters).size!==783||
  foundation?.scope!=='ufc-only-v4-stat-foundation'||foundation?.population!==783)
  throw Error('Approved 783-fighter V4 snapshot required');
 const cases=[];
 for(const slug of approval.approvedFighters){
  if(EXCEPTIONS.has(slug))continue;
  const f=foundation.fighters?.[slug]||{};
  const p=research.profiles?.[slug]||{};
  const h=(p.recentHistory||[]).filter(x=>String(x.promotion||x.org||'').toLowerCase()==='ufc');
  const nativeIds=h.map(x=>String(x.boutId||'')).filter(Boolean);
  const checked=progress.ufcApprovedFullFightSearchChecks?.[slug]||{};
  const identity=progress.ufcFullCareerHistoryChecks?.[slug]||{};
  const blockers=[
   ...(f.independentlyCertifiedCareer?[]:['independent_exhaustive_official_fight_links_required']),
   ...(checked.status==='checked'?[]:['numeric_fight_index_not_complete']),
   ...(identity.status==='checked'?[]:['native_identity_not_checked']),
   ...(f.careerCoverageStatus==='provider_history_discrepancy'?['provider_history_discrepancy']:[]),
   ...(new Set(nativeIds).size!==nativeIds.length?['duplicate_native_ids']:[]),
   ...(!h.length?['no_saved_ufc_history']:[])
  ];
  cases.push({slug,name:p.name||slug,savedUfcRows:h.length,
   knownCareerBouts:f.knownCareerBouts??null,uniqueSavedNativeIds:new Set(nativeIds).size,
   fullIndexStatus:checked.status||'not_attempted',identityStatus:identity.status||'not_attempted',
   providerExplicitUntruncated:p.ufcTimeline?.providerTruncatedFlag===false,
   blockers,independentlyCertified:f.independentlyCertifiedCareer===true});
 }
 cases.sort((a,b)=>
  Number(b.fullIndexStatus==='checked')-Number(a.fullIndexStatus==='checked')||
  Number(b.identityStatus==='checked')-Number(a.identityStatus==='checked')||
  Number(b.providerExplicitUntruncated)-Number(a.providerExplicitUntruncated)||
  b.uniqueSavedNativeIds-a.uniqueSavedNativeIds||a.slug.localeCompare(b.slug));
 return {schema:1,scope:'ufc-v4-nonpilot-independent-certification-triage',
  status:'offline_candidate_selection_not_certification',population:783,
  excludedExceptions:[...EXCEPTIONS],candidateCount:cases.length,
  certifiedByThisReport:0,candidates:cases,
  note:'Ranking is for source-by-source independent verification, never proof of completeness. Requires official fighter and every fight detail link, native identity/outcome reconciliation, and statistics coverage before certification.'};
}
function main(){
 const out=triage(read('data/ufc-36-month-roster-approval.json'),
  read('qa/ufc-v4-stat-foundation.json'),read('data/ufcalendar-fighter-research.json'),
  read('data/ufcalendar-rich-progress.json'));
 const dest=path.join(root,'qa/ufc-v4-nonpilot-certification-triage.json');
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,JSON.stringify(out,null,2)+'\n');
 console.log('BEFN_V4_NONPILOT_TRIAGE '+JSON.stringify({candidateCount:out.candidateCount,
  top10:out.candidates.slice(0,10).map(x=>({slug:x.slug,known:x.knownCareerBouts,
   index:x.fullIndexStatus,identity:x.identityStatus,blockers:x.blockers}))}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
