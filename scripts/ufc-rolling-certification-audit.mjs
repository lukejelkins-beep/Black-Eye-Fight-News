#!/usr/bin/env node
/** Offline audit of the weekly rolling certification (owner standing rule, 24 Nov 2026).
 *
 * Re-checks what scripts/ufc-weekly-certification.py wrote to data/ufc-rolling-certification.json, from saved files
 * only (no network):
 *  - the standing approval exists and is the owner's; rolling-cohort members are in neither the frozen 783 nor the
 *    24 Nov extension cohort;
 *  - a member certified from scratch (base "ufc-rolling") passes the same per-fighter gate as the extension
 *    (judgeCareer), at its own evidence cutoff, research history optional (every other fight needs Wikipedia);
 *  - a rolled-forward career starts from a certificate that exists today with the same count and cutoff (the 783
 *    queue's certified lane, the extension audit, or the rolling base), and every bout added after it has a UFCStats
 *    fight link and a Wikipedia second source, and the fighter's profile holds exactly those fights in the window.
 * Run after the 783 queue and the extension audit. Writes qa/ufc-rolling-certification-audit.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gateContext,judgeCareer,hasWikipedia} from './ufc-extension-stage3-audit.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const arr=x=>Array.isArray(x)?x:[];
const date=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x??''))?x:null;
const normal=x=>String(x??'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const tokens=v=>String(v??'').replace(/([a-z])([A-Z])/g,'$1 $2').normalize('NFKD').replace(/[̀-ͯ]/g,'')
 .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(':');
const sameName=(a,b)=>normal(a)===normal(b)||Boolean(tokens(a)&&tokens(a)===tokens(b));
const dayGap=(a,b)=>Math.abs(Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000;
const OUTCOME={W:'win',L:'loss',D:'draw',NC:'no_contest'};
const UFCSTATS_FIGHT=/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/i;

export function validateStanding(standing){
 if(standing?.schema!==1||standing?.scope!=='ufc-standing-certification-rule'||standing?.status!=='approved'||
    standing?.approvedBy!=='user'||standing?.cohort!=='ufc-rolling'||standing?.rules?.newcomers!=='automatic'||
    standing?.rules?.secondSource!=='wikipedia-event-article')
  throw Error('no owner standing certification rule');
 return standing;
}

/** bases: certified slug -> {base, through, count} from the certificates that exist now. */
export function auditRolling({standing,state,frozen,extension,bases,aliases={},ctx}){
 validateStanding(standing);
 if(state?.schema!==1||state?.scope!=='ufc-rolling-certification'||state?.cohort!==standing.cohort)
  throw Error('not a rolling certification state');
 const frozenSet=new Set(frozen),extSet=new Set(extension);
 const statsOf=Object.fromEntries(Object.entries(aliases).map(([s,c])=>[c,s]));
 const certified=[],exceptions=[];
 for(const slug of Object.keys(state.members||{}))
  if(frozenSet.has(slug)||extSet.has(slug))throw Error(slug+' is already in another cohort');
 for(const [slug,c] of Object.entries(state.careers||{})){
  const reasons=[];
  const added=arr(c.added);
  if(!date(c.baseThrough)||!date(c.through)||c.through<c.baseThrough||!Number.isSafeInteger(c.baseCount))
   reasons.push('malformed_career');
  if(c.base==='ufc-rolling'){
   if(!state.members?.[slug])reasons.push('not_a_rolling_member');
   else reasons.push(...judgeCareer(slug,{cohort:'ufc-rolling',cutoff:c.baseThrough,requireResearch:false},ctx));
   if(arr(ctx.fighters[slug]?.bouts).length!==c.baseCount)reasons.push('base_count_mismatch');
  }else{
   const b=bases[slug];
   if(!b||b.base!==c.base||b.through!==c.baseThrough||b.count!==c.baseCount)reasons.push('base_certificate_changed');
  }
  const seen=new Set();
  for(const x of added){
   const k=x?.date+'|'+normal(x?.opponent);
   if(!date(x?.date)||x.date<=c.baseThrough||x.date>c.through||seen.has(k)||!['win','loss','draw','no_contest'].includes(x?.result)||
      !UFCSTATS_FIGHT.test(String(x?.fightUrl||''))||!hasWikipedia(x)){reasons.push('added_bout_without_two_sources');break;}
   seen.add(k);
  }
  const file=ctx.stats(statsOf[slug]||slug);
  if(!file)reasons.push('no_stats_file');
  else{
   const window=arr(file.fights).filter(f=>f.date>c.baseThrough&&f.date<=c.through&&!/contender\s+series|road\s+to\s+ufc/i.test(String(f.event||'')));
   const used=new Set();
   const ok=window.length===added.length&&window.every(f=>{
    const i=added.findIndex((x,j)=>!used.has(j)&&x.result===OUTCOME[f.outcome]&&dayGap(x.date,f.date)<=1&&
     (sameName(x.opponent,f.opponent)||sameName(x.sourceOpponentName,f.opponent)));
    if(i<0)return false;used.add(i);return true;});
   if(!ok)reasons.push('profile_fights_differ_from_rolled_bouts');
  }
  if(reasons.length)exceptions.push({slug,reasons});
  else certified.push({slug,count:c.baseCount+added.length,through:c.through});
 }
 return {schema:1,scope:'ufc-rolling-certification-audit',cohort:state.cohort,lastRun:state.lastRun,
  evidenceCutoff:state.evidenceCutoff,members:Object.keys(state.members||{}).length,
  pending:Object.keys(state.pending||{}).length,
  totals:{careers:Object.keys(state.careers||{}).length,certified:certified.length,exceptions:exceptions.length},
  lanes:{certified,exceptions}};
}

/** The current certificates: the 783 queue's certified lane and the extension audit. */
export function basesFrom(queue,progress,extAudit){
 const out={};
 for(const c of arr(queue?.lanes?.certified))
  out[c.slug]={base:'ufc-36-month-roster',through:progress?.summary?.certificationEvidenceCutoff,count:c.knownUfcBouts};
 for(const c of arr(extAudit?.lanes?.certified))
  out[c.slug]={base:extAudit.cohort,through:extAudit.evidenceCutoff,count:c.knownUfcBouts};
 return out;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const statsDir=path.join(root,'data/ufc-stats/fighters');
 const stats=slug=>{const p=path.join(statsDir,slug+'.json');return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):null;};
 const {STATS_ALIASES}=await import('./build-ufc-v4-certified-careers.mjs');
 const r=auditRolling({
  standing:read('data/ufc-standing-certification-approval.json'),
  state:read('data/ufc-rolling-certification.json'),
  frozen:read('data/ufc-36-month-roster-approval.json').approvedFighters,
  extension:read('data/ufc-extension-cohort-approval-20261124.json').approvedFighters,
  bases:basesFrom(read('qa/ufc-v4-certification-queue.json'),read('qa/ufc-36-month-stage3-progress.json'),
   read('qa/ufc-extension-stage3-audit.json')),
  aliases:STATS_ALIASES,
  ctx:gateContext({research:read('data/ufcalendar-fighter-research.json'),progress:read('data/ufcalendar-rich-progress.json'),
   register:read('data/ufc-independent-full-career-verification.json'),feeder:read('data/ufc-feeder-bout-evidence.json'),stats})
 });
 const qa=path.join(root,'qa');fs.mkdirSync(qa,{recursive:true});
 fs.writeFileSync(path.join(qa,'ufc-rolling-certification-audit.json'),JSON.stringify(r,null,2)+'\n');
 console.log('BEFN_UFC_ROLLING_CERTIFICATION='+JSON.stringify({...r.totals,members:r.members,pending:r.pending,
  exceptions:r.lanes.exceptions.map(e=>e.slug+':'+e.reasons.join('+'))}));
 if(r.lanes.exceptions.length)process.exitCode=1;
}
