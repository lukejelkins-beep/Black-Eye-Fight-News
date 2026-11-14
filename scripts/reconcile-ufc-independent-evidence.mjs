#!/usr/bin/env node
/**
 * Offline crosswalk for separately obtained, authorized UFCStats evidence.
 * Never downloads URLs or asserts complete coverage based on matching known fights.
 * Does NOT write the authoritative independent certification register.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const norm=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9]/g,'');
const validDate=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\d$/.test(s)&&
 !Number.isNaN(Date.parse(s+'T00:00:00Z'));
const outcome=s=>({w:'win',win:'win',l:'loss',loss:'loss',d:'draw',
 draw:'draw',nc:'no_contest',no_contest:'no_contest'})[String(s??'').toLowerCase()]||null;
const fighterUrl=s=>/^https:\/\/ufcstats\.com\/fighter-details\/[0-9a-f]{12,}$/i.test(String(s??''));
const fightUrl=s=>/^https:\/\/ufcstats\.com\/fight-details\/[0-9a-f]{12,}$/i.test(String(s??''));
const key=r=>[r.date,norm(r.opponent),outcome(r.result)].join('|');
const unique=rows=>new Set(rows.map(key)).size===rows.length;
const dateDelta=(a,b)=>Math.abs((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000);
const matches=(a,b)=>norm(a.opponent)===norm(b.opponent)&&outcome(a.result)===outcome(b.result)&&dateDelta(a.date,b.date)<=1;
function validateListing(e){
 if(!e||!fighterUrl(e.fighterUrl)||!Array.isArray(e.bouts)||!e.bouts.length||
   !e.bouts.every(b=>validDate(b?.date)&&norm(b?.opponent)&&outcome(b?.result)&&fightUrl(b?.fightUrl))||
   !unique(e.bouts))return false;
 return true;
}
export function reconcileIndependentEvidence(approval,research,evidence){
 const slugs=approval?.approvedFighters;
 if(approval?.status!=='approved'||approval.rosterAsOf!=='2026-11-14'||
    !Array.isArray(slugs)||slugs.length!==783||new Set(slugs).size!==783)
   throw Error('Immutable approved 783-fighter snapshot required');
 if(evidence?.schema!==1||evidence?.scope!=='ufc-authorized-independent-source-export'||
   evidence.rosterAsOf!==approval.rosterAsOf||
   !evidence?.accessProvenance||typeof evidence.accessProvenance!=='string')
   throw Error('Explicit approved source-export provenance required');
 const cases=[],seen=new Set();
 for(const entry of evidence.fighters||[]){
   const slug=entry?.slug;
   if(!slugs.includes(slug)||seen.has(slug))throw Error('Unknown or duplicated fighter slug');
   seen.add(slug);
   if(!validateListing(entry)){
     cases.push({slug,status:'invalid_source_listing',reason:'Missing source bout fields, URLs, or unique identities'});
     continue;
   }
   const saved=(research?.profiles?.[slug]?.recentHistory||[])
     .filter(x=>String(x.promotion||x.org||'').toLowerCase()==='ufc'&&
       validDate(x.date)&&norm(x.opponent)&&outcome(x.result||x.outcome||x.status))
     .map(x=>({...x,result:x.result||x.outcome||x.status}));
   const source=entry.bouts;
   const missingFromSaved=source.filter(s=>!saved.some(x=>matches(s,x)));
   const absentFromSource=saved.filter(s=>!source.some(x=>matches(s,x)));
   const sourceDuplicateFightUrls=new Set(source.map(x=>x.fightUrl)).size!==source.length;
   const sourceListed=(new Set(source.map(x=>key(x)))).size===source.length;
   const needsReview=missingFromSaved.length||absentFromSource.length||sourceDuplicateFightUrls||!sourceListed;
   cases.push({slug,status:needsReview?'reconciliation_required':'chronology_matches_known_history',
     fighterUrl:entry.fighterUrl,sourceBoutCount:source.length,savedBoutCount:saved.length,
     missingFromSaved:missingFromSaved.map(x=>({date:x.date,opponent:x.opponent,result:outcome(x.result),fightUrl:x.fightUrl})),
     absentFromSource:absentFromSource.map(x=>({date:x.date,opponent:x.opponent,result:outcome(x.result)})),
     sourceCoverageAttested:false,
     note:'Matching the known archive cannot alone establish an exhaustive independently certified UFC career; a separate human completeness review and strict Stage 3 gate are required.'});
 }
 const counts={invalid:cases.filter(x=>x.status==='invalid_source_listing').length,
   mismatched:cases.filter(x=>x.status==='reconciliation_required').length,
   matchedKnownHistory:cases.filter(x=>x.status==='chronology_matches_known_history').length};
 return {schema:1,scope:'ufc-independent-source-evidence-reconciliation',
   rosterAsOf:approval.rosterAsOf,status:'offline_not_certification',
   importedFighters:cases.length,summary:counts,cases,
   note:'No internet access performed. Never automatically set sourceCoverageAttested or modify independent certification registry.'};
}
function main(){
 const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
 const file=path.join(root,'data/ufc-authorized-independent-source-export.json');
 if(!fs.existsSync(file)){
   console.log('BEFN_SOURCE_IMPORT no permitted source export present; requests=0; certifications=0');
   return;
 }
 const output=reconcileIndependentEvidence(read('data/ufc-36-month-roster-approval.json'),
   read('data/ufcalendar-fighter-research.json'),
   read('data/ufc-authorized-independent-source-export.json'));
 const target=path.join(root,'qa/ufc-independent-source-reconciliation.json');
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n');
 console.log('BEFN_SOURCE_IMPORT '+JSON.stringify(output.summary));
 if(process.env.GITHUB_STEP_SUMMARY)
   fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
     '\nIndependent source export crosswalk (no network): '+
     JSON.stringify(output.summary)+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
