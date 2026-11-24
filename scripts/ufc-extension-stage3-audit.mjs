#!/usr/bin/env node
/** Offline, read-only Stage 3 audit for the owner-approved UFC EXTENSION cohort (24 Nov 2026).
 *
 * The frozen 783-fighter cohort and its audit (scripts/ufc-36-month-stage3-progress.mjs) are untouched. This audit
 * covers only the fighters in data/ufc-extension-cohort-approval-20261124.json: UFC fighters with a BEFN profile who
 * are not in the 783. Each fighter lands in exactly one lane, certified or exception; the lanes total the cohort.
 *
 * A fighter is certified only when the SAME full-career gate the 783 use (evaluateCareerEvidence) passes on:
 *   - saved history: UFCalendar research rows tagged UFC with a result, up to the extension cutoff, minus feeder rows
 *     (a date whose cached UFC events are all Contender Series / Road to UFC, or a curated feeder row), plus the
 *     fighter's stats-file fights after the research snapshot (free results importer), so a later fight is not missed;
 *   - the fighter's register entry (data/ufc-independent-full-career-verification.json) for this cohort;
 * and, in addition:
 *   - no malformed or duplicated saved row; the entry's UFCStats fighter page belongs to no other register entry;
 *   - every fight in the fighter's stats file up to the cutoff is a register bout (what the profile shows is certified);
 *   - a fight only the results importer holds carries a second source, the event's Wikipedia article.
 * Nothing here calls a provider or writes collector-owned files.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {evaluateCareerEvidence,isAttestedOfficialUfcShowcase} from './ufc-36-month-stage3-progress.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const arr=x=>Array.isArray(x)?x:[];
const date=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x??''))?x:null;
const numId=x=>/^[1-9][0-9]{0,11}$/.test(String(x??''))?String(x):null;
const normal=x=>String(x??'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const tokens=v=>String(v??'').replace(/([a-z])([A-Z])/g,'$1 $2').normalize('NFKD').replace(/[̀-ͯ]/g,'')
 .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(':');
const sameName=(a,b)=>normal(a)===normal(b)||Boolean(tokens(a)&&tokens(a)===tokens(b));
const isFeederTitle=t=>/(?:contender\s+series|road\s+to\s+ufc|\bdwcs\b)/i.test(String(t||''));
const RESULTS=['win','loss','draw','no_contest'];
const OUTCOME={W:'win',L:'loss',D:'draw',NC:'no_contest'};
const dayGap=(a,b)=>Math.abs(Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000;
export const EXTENSION_SCOPE='ufc-extension-cohort';
export const cohortHash=slugs=>crypto.createHash('sha256').update(JSON.stringify([...slugs].sort())).digest('hex');

export function validateExtensionApproval(approval,base){
 const slugs=arr(approval?.approvedFighters);
 if(approval?.schema!==1||approval?.scope!==EXTENSION_SCOPE||approval?.status!=='approved'||approval?.approvedBy!=='user')
  throw Error('extension cohort not approved');
 if(!date(approval.evidenceCutoff)||!date(approval.approvedAt)||typeof approval.cohort!=='string')
  throw Error('extension cohort has no cutoff, date or name');
 if(slugs.length!==approval.approvedCount||new Set(slugs).size!==slugs.length||slugs.some(s=>typeof s!=='string'||!s))
  throw Error('invalid extension cohort list');
 if(approval.approvedRosterSha256!==cohortHash(slugs))throw Error('extension cohort hash mismatch');
 const frozen=new Set(arr(base?.approvedFighters));
 if(frozen.size!==783||approval.baseCohortSha256!==base.approvedRosterSha256)throw Error('extension not anchored to the 783');
 if(slugs.some(s=>frozen.has(s)))throw Error('extension overlaps the frozen 783 cohort');
 return slugs;
}

export function feederDatesFrom(bouts){
 const titles=new Map();
 for(const b of Object.values(bouts||{})){
  if(b?.org!=='ufc'||!date(b.eventDate)||!b.event)continue;
  if(!titles.has(b.eventDate))titles.set(b.eventDate,new Set());
  titles.get(b.eventDate).add(b.event);
 }
 return new Set([...titles].filter(([,t])=>t.size&&[...t].every(isFeederTitle)).map(([d])=>d));
}

/** Saved UFC history for one extension fighter (see the header). Newest first is not required by the gate. */
export function extensionHistory(slug,profile,statsFile,cutoff,feederDates,curated,entry=null){
 const rows=[],seen=new Set();
 for(const r of arr(profile?.recentHistory)){
  if(String(r?.promotion||'').toLowerCase()!=='ufc'||!RESULTS.includes(String(r?.result||'').toLowerCase()))continue;
  const d=date(r.date);
  if(!d||d>cutoff||(feederDates.has(d)&&!isAttestedOfficialUfcShowcase(entry,r)))continue;
  if(arr(curated).some(c=>c?.fighterSlug===slug&&String(c?.boutId)===String(r?.boutId)&&c?.date===d))continue;
  const key=r.source==='native'&&numId(r.boutId)?numId(r.boutId):d+'|'+normal(r.opponent);
  if(seen.has(key))continue;
  seen.add(key);rows.push(r);
 }
 const observed=date(profile?.observedOn)||'0000-00-00';
 for(const f of arr(statsFile?.fights)){
  if(!(f.date>observed&&f.date<=cutoff)||isFeederTitle(f.event))continue;
  if(rows.some(r=>dayGap(r.date,f.date)<=1&&sameName(r.opponent,f.opponent)))continue;
  rows.push({date:f.date,opponent:f.opponent,result:OUTCOME[f.outcome],promotion:'ufc',source:'results-importer',
   boutId:null,event:f.event});
 }
 return rows;
}

/** Shared context for judging careers against the saved caches. */
export function gateContext({research,progress,register,feeder,stats}){
 const fighters=register?.fighters||{};
 const pageOwners=new Map();
 for(const [s,e] of Object.entries(fighters)){
  const u=String(e?.fighterUrl||'').toLowerCase();
  if(u){if(!pageOwners.has(u))pageOwners.set(u,new Set());pageOwners.get(u).add(s);}
 }
 return {research,progress,fighters,stats,pageOwners,feederDates:feederDatesFrom(progress?.bouts),
  curated:arr(feeder?.schema===1?feeder.bouts:[])};
}

/** Reasons one fighter's career is NOT certified ([] = certified) for a cohort and its evidence cutoff.
 * requireResearch: the 24 Nov extension was built on saved UFCalendar research; the rolling cohort (weekly job) may
 * hold debutants with none, whose every fight then needs the Wikipedia second source. */
export function judgeCareer(slug,{cohort,cutoff,requireResearch=true},ctx){
 const reasons=[];
 const profile=ctx.research?.profiles?.[slug],entry=ctx.fighters[slug],file=ctx.stats(slug);
 if(requireResearch&&!profile)reasons.push('no_saved_research_history');
 if(!file)reasons.push('no_stats_file');
 if(!entry)reasons.push('no_register_entry');
 else{
  if(entry.cohort!==cohort||entry.evidenceCutoff!==cutoff)reasons.push('register_entry_not_for_this_cohort');
  const owners=ctx.pageOwners.get(String(entry.fighterUrl||'').toLowerCase());
  if(owners&&owners.size>1)reasons.push('ufcstats_page_shared_with_another_entry');
 }
 if(reasons.length)return reasons;
 const history=extensionHistory(slug,profile,file,cutoff,ctx.feederDates,ctx.curated,entry);
 const shown=arr(file.fights).filter(f=>f.date<=cutoff);
 // The latest fight the profile shows, leaving out a no-contest or draw that only UFCStats carries (a savedHistoryGap
 // bout): saved history cannot hold a bout it never recorded, so that bout cannot anchor the latest-fight check.
 const gapDays=arr(entry.bouts).filter(b=>b.savedHistoryGap===true).map(b=>b.date);
 const latest=shown.filter(f=>!(['NC','D'].includes(f.outcome)&&gapDays.some(d=>dayGap(d,f.date)<=1)))
  .map(f=>f.date).sort().at(-1)||null;
 const fp=new Set();
 const malformed=history.some(r=>{
  const k=date(r.date)+'|'+tokens(r.opponent);
  if(!date(r.date)||!tokens(r.opponent)||fp.has(k))return true;
  fp.add(k);return false;});
 if(malformed)reasons.push('malformed_saved_history');
 const proof=evaluateCareerEvidence(profile||{name:entry.fighterName},history,latest,cutoff,entry,ctx.progress?.bouts||{},cutoff);
 if(!proof.independentlyVerified)reasons.push(proof.rosterLatestPresent?'source_proof_fails_certification_gate':'latest_fight_not_in_saved_history');
 const bouts=arr(entry.bouts);
 // Owner, 24 Nov 2026: a fight only the free results importer holds (it reads UFCStats, the same source as the
 // register) needs a second source, the event's Wikipedia article, recorded on the matching register bout.
 const unconfirmed=history.filter(r=>r.source==='results-importer').filter(r=>!bouts.some(b=>
  dayGap(b.date,r.date)<=1&&b.result===r.result&&sameName(b.opponent,r.opponent)&&hasWikipedia(b)));
 if(unconfirmed.length)reasons.push('new_fight_without_second_source');
 const unlisted=shown.filter(f=>!bouts.some(b=>b.result===OUTCOME[f.outcome]&&
  (dayGap(b.date,f.date)<=1||(b.independentEventSourceDate&&dayGap(b.independentEventSourceDate,f.date)<=1))&&
  (sameName(b.opponent,f.opponent)||sameName(b.sourceOpponentName,f.opponent))));
 if(unlisted.length)reasons.push('profile_fight_not_in_register');
 return reasons;
}

export const hasWikipedia=b=>b?.secondSource==='wikipedia-event-article'&&
 /^https:\/\/en\.wikipedia\.org\/wiki\/\S+$/.test(String(b?.secondSourceUrl||''))&&Boolean(date(b?.secondSourceCheckedOn));

export function auditExtension(inputs){
 const {approval,base}=inputs;
 const slugs=validateExtensionApproval(approval,base);
 const cutoff=approval.evidenceCutoff;
 const ctx=gateContext(inputs);
 const certified=[],exceptions=[];
 for(const slug of slugs){
  const reasons=judgeCareer(slug,{cohort:approval.cohort,cutoff},ctx);
  if(reasons.length)exceptions.push({slug,reasons});
  else certified.push({slug,knownUfcBouts:arr(ctx.fighters[slug].bouts).length});
 }
 if(certified.length+exceptions.length!==slugs.length)throw Error('lanes do not partition the extension cohort');
 return {schema:1,scope:'ufc-extension-stage3-audit',cohort:approval.cohort,evidenceCutoff:cutoff,
  approvalHash:approval.approvedRosterSha256,
  totals:{approved:slugs.length,certified:certified.length,exceptions:exceptions.length},
  lanes:{certified,exceptions}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const statsDir=path.join(root,'data/ufc-stats/fighters');
 const r=auditExtension({
  approval:read('data/ufc-extension-cohort-approval-20261124.json'),
  base:read('data/ufc-36-month-roster-approval.json'),
  research:read('data/ufcalendar-fighter-research.json'),
  progress:read('data/ufcalendar-rich-progress.json'),
  register:read('data/ufc-independent-full-career-verification.json'),
  feeder:read('data/ufc-feeder-bout-evidence.json'),
  stats:slug=>{const p=path.join(statsDir,slug+'.json');return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):null;}
 });
 const qa=path.join(root,'qa');fs.mkdirSync(qa,{recursive:true});
 fs.writeFileSync(path.join(qa,'ufc-extension-stage3-audit.json'),JSON.stringify(r,null,2)+'\n');
 console.log('BEFN_UFC_EXTENSION_STAGE3='+JSON.stringify({...r.totals,
  exceptions:r.lanes.exceptions.map(e=>e.slug+':'+e.reasons.join('+'))}));
}
