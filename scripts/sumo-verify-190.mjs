/**
 * Independent BEFN Sumo research-cache integrity gate.
 * This is NOT external historical verification or JSA certification.
 * Produces a stable, testable report from downloaded source pages only.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {unrankedDebutEvidence} from './sumo-backfill-190.mjs';
import {applyOfficialBoutCorrections} from './sumo-official-bout-corrections.mjs';
import {authoritativeCareerTotals} from './sumo-official-career-totals.mjs';
const ROOT='data/sumo/backfill/v1';
const REQUIRED=['profile','stats','measurements','ranks','shikonas','matches'];
const banzuke=/^(Yokozuna|Ozeki|Sekiwake|Komusubi|Maegashira|Juryo|Makushita|Sandanme|Jonidan|Jonokuchi)\s+[1-9]\d{0,2}\s+(East|West)$/;
const basho=/^(18|19|20)\d{2}(01|03|05|07|09|11)$/;
const read=async (file,fallback=null)=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
export function auditRikishi(w,cache,officialCorrectionEvidence=null,officialCareerSnapshot=null){
  if(!cache)return {sourceId:w.sourceId,name:w.shikonaEn,status:'not-attempted',readyForExternalCrosscheck:false,errors:[],warnings:[],stagesCompleted:0,counts:{weights:0,ranks:0,matches:0}};
  const errors=[],warnings=[],id=Number(w.sourceId);
  if(cache.rikishiId!==id)errors.push('cache-identity');
  if(w.officialNskId&&cache.nskId&&Number(cache.nskId)!==Number(w.officialNskId))errors.push('nsk-identity');
  if(cache.certification!=='not-started')errors.push('unexpected-certification-status');
  if(!cache.researchOnly)errors.push('missing-research-only-guard');
  for(const s of REQUIRED){
    if(!cache.stages?.[s])errors.push('missing-stage-'+s);
    if(cache.stages?.[s]?.complete===false&&(cache.stages[s].attempts||0)>=3)warnings.push('blocked-stage-'+s);
  }
  const allComplete=REQUIRED.every(s=>cache.stages?.[s]?.complete===true);
  const profile=cache.data?.profile,stats=cache.data?.stats;
  if(cache.stages?.profile?.complete){
    if(!profile||Number(profile.id)!==id)errors.push('source-profile-identity');
    if(w.officialNskId&&profile?.nskId&&Number(profile.nskId)!==Number(w.officialNskId))errors.push('profile-official-identity');
    if(profile?.currentRank&&w.currentRank&&profile.currentRank!==w.currentRank)warnings.push('current-banzuke-snapshot-drift');
  }
  if(cache.stages?.stats?.complete){
    if(!stats||stats.rikishi_id!=null&&Number(stats.rikishi_id)!==id)errors.push('source-career-totals-identity');
    if(stats?.totalWins!=null&&stats?.totalLosses!=null&&stats?.totalMatches!=null&&
       Number(stats.totalWins)+Number(stats.totalLosses)!==Number(stats.totalMatches))warnings.push('career-total-reconciliation');
  }
  for(const stage of ['measurements','ranks','shikonas','matches']){
    const arr=cache.data?.[stage];
    if(!Array.isArray(arr)){errors.push(stage+'-array-missing');continue;}
    if(cache.stages?.[stage]?.complete&&cache.stages[stage].total!==null&&arr.length!==cache.stages[stage].total){
      errors.push(stage+'-pagination-count-mismatch');
    }
    const ids=new Set(),dated=new Set();
    for(const item of arr){
      if(item.rikishiId!=null&&Number(item.rikishiId)!==id)errors.push(stage+'-wrong-rikishi-id');
      const key=item.id!=null?String(item.id):
        stage==='matches'?[item.bashoId,item.day,item.matchNo,item.eastId,item.westId].join(':'):
        JSON.stringify(item);
      if(ids.has(key))errors.push(stage+'-duplicate-record');
      ids.add(key);
      if(stage!=='matches'){
        if(!basho.test(String(item.bashoId||'')))errors.push(stage+'-invalid-basho-date');
        else if(dated.has(item.bashoId))errors.push(stage+'-duplicate-basho');
        dated.add(item.bashoId);
      } else {
        if(!basho.test(String(item.bashoId||'')))warnings.push('match-date-format');
        if(item.eastId!=null&&item.westId!=null&&Number(item.eastId)!==id&&Number(item.westId)!==id)
          errors.push('match-opponent-identity');
      }
      if(stage==='ranks'&&!['Mae-zumo','Banzuke-gai'].includes(item.rank)&&!banzuke.test(String(item.rank||'')))errors.push('malformed-rank-value');
      if(stage==='measurements'&&item.weight!=null&&(!Number.isFinite(Number(item.weight))||Number(item.weight)<=0))errors.push('invalid-historical-weight');
      if(stage==='measurements'&&item.height!=null&&(!Number.isFinite(Number(item.height))||Number(item.height)<=0))errors.push('invalid-historical-height');
    }
    if(allComplete&&stage==='ranks'&&!arr.length)errors.push('rank-history-empty');
    if(allComplete&&stage==='matches'&&!arr.length&&Number(stats?.totalMatches)>0)errors.push('match-history-empty');
  }
  // Preserve all career records including Mae-zumo and tie-break playoffs.
  // The upstream career-stat total counts regular tournament bouts only.
  // This reconciles Ura's 772 raw records to 763 (2 Mae-zumo + 7 day-16)
  // and Asanoyama's 667 to 665 (2 day-16 playoff bouts).
  const official=applyOfficialBoutCorrections(w,cache,officialCorrectionEvidence);
  if(official.errors.length)errors.push('unverified-official-bout-correction');
  const allMatches=official.matches;
  const regularMatches=allMatches.filter(m=>m.division!=='Mae-zumo'&&
    Number.isInteger(Number(m.day))&&Number(m.day)>=1&&Number(m.day)<=15);
  const specialMatches=allMatches.filter(m=>m.division==='Mae-zumo'||Number(m.day)>15);
  // Keep a lossless reconciliation of historical bout rows vs the provider's
  // aggregate W-L totals. An out-of-sync aggregate is an explicit exception,
  // not permission to delete a sourced bout.
  const boutsWithWinner=regularMatches.filter(m=>
    Number.isSafeInteger(Number(m.winnerId))&&Number(m.winnerId)>0);
  const boutLedger={
    regularRows:regularMatches.length,
    wins:boutsWithWinner.filter(m=>Number(m.winnerId)===id).length,
    losses:boutsWithWinner.filter(m=>Number(m.winnerId)!==id).length,
    missingWinner:regularMatches.length-boutsWithWinner.length,
    specialRows:specialMatches.length,
    apiStatsWins:stats?.totalWins??null,
    apiStatsLosses:stats?.totalLosses??null,
    apiStatsMatches:stats?.totalMatches??null
  };
  boutLedger.winDifference=stats?.totalWins==null?null:boutLedger.wins-Number(stats.totalWins);
  boutLedger.lossDifference=stats?.totalLosses==null?null:boutLedger.losses-Number(stats.totalLosses);
  boutLedger.totalDifference=stats?.totalMatches==null?null:boutLedger.regularRows-Number(stats.totalMatches);
  const effectiveTotals=authoritativeCareerTotals(w,cache,boutLedger,officialCareerSnapshot);
  boutLedger.authoritativeWins=effectiveTotals.selected.wins;
  boutLedger.authoritativeLosses=effectiveTotals.selected.losses;
  boutLedger.authoritativeMatches=effectiveTotals.selected.matches;
  boutLedger.authoritativeSource=effectiveTotals.source;
  if(effectiveTotals.independentlyResolvedSourceDifference)
    warnings.push('api-career-summary-lag-independent-JSA-ledger-agreement');
  if(cache.stages?.matches?.complete&&boutLedger.missingWinner>0)
    errors.push('match-winner-missing');
  // A matching total alone is insufficient: verify every reported win and
  // loss against the individually sourced regular bouts before readiness.
  if(cache.stages?.matches?.complete&&Number.isFinite(effectiveTotals.selected.wins)&&boutLedger.wins!==effectiveTotals.selected.wins)
    errors.push('career-win-count-mismatch');
  if(cache.stages?.matches?.complete&&Number.isFinite(effectiveTotals.selected.losses)&&boutLedger.losses!==effectiveTotals.selected.losses)
    errors.push('career-loss-count-mismatch');
  if(cache.stages?.matches?.complete&&Number.isFinite(effectiveTotals.selected.matches)){
    if(regularMatches.length<effectiveTotals.selected.matches)errors.push('match-history-shortfall');
    if(regularMatches.length>effectiveTotals.selected.matches)errors.push('career-regular-bout-count-mismatch');
  }
  // Both Mae-zumo (debut trials) and Banzuke-gai (off-chart) are authentic
  // non-ranked basho states; they must be retained but not counted as formal ranks.
  const formalRanks=(cache.data?.ranks||[]).filter(x=>!['Mae-zumo','Banzuke-gai'].includes(x.rank));
  const documentedDebut=unrankedDebutEvidence(cache);
  const permittedDebutGap=!!documentedDebut&&
    cache.stages?.ranks?.unrankedDebut?.bashoId===documentedDebut.bashoId&&
    formalRanks.length+1===Number(stats?.basho);
  if(cache.stages?.ranks?.complete&&stats?.basho!=null&&
     formalRanks.length!==Number(stats.basho)&&!permittedDebutGap){
    errors.push('rank-history-basho-count-mismatch');
  }
  if(permittedDebutGap)warnings.push('documented-unranked-debut-basho');
  const uniqueErrors=[...new Set(errors)],uniqueWarnings=[...new Set(warnings)];
  const status=!allComplete?'still-collecting':uniqueErrors.length?'source-integrity-exception':'source-collected-needs-independent-verification';
  return {
    sourceId:id,name:w.shikonaEn,status,readyForExternalCrosscheck:allComplete&&!uniqueErrors.length,
    errors:uniqueErrors,warnings:uniqueWarnings,stagesCompleted:REQUIRED.filter(s=>cache.stages?.[s]?.complete).length,
    counts:{weights:cache.data?.measurements?.length||0,ranks:cache.data?.ranks?.length||0,matches:allMatches.length,regularMatches:regularMatches.length,specialMatches:specialMatches.length,formalRanks:formalRanks.length},
    boutLedger,effectiveCareerTotals:effectiveTotals,appliedOfficialBoutCorrections:official.applied,careerCertified:false
  };
}
export function crossCheckOfficial(w,cache,evidence){
  if(!cache?.data?.profile||!evidence)return null;
  const p=cache.data.profile,s=cache.data.stats;
  const id=Number(w.sourceId),nsk=Number(w.officialNskId);
  const base='https://www.sumo.or.jp/EnSumoDataRikishi/profile/'+nsk+'/';
  const identityVerified=
    Number(p.id)===id&&Number(p.nskId)===nsk&&
    Number(evidence.sumoApiId)===id&&Number(evidence.officialNskId)===nsk&&
    evidence.officialProfileUrl===base&&
    p.heya===evidence.stable&&p.currentRank===evidence.currentRank;
  const measurementsVerified=identityVerified&&
    Number(p.height)===Number(evidence.heightCm)&&
    Number(p.weight)===Number(evidence.weightKg);
  const totalsMatch=s&&s.totalWins!=null&&s.totalLosses!=null&&s.totalAbsences!=null?
    Number(s.totalWins)===Number(evidence.record.wins)&&
    Number(s.totalLosses)===Number(evidence.record.losses)&&
    Number(s.totalAbsences)===Number(evidence.record.absences):false;
  const sourceTotals=s?{
    wins:s.totalWins,losses:s.totalLosses,absences:s.totalAbsences
  }:null;
  return {
    sourceId:id,name:w.shikonaEn,officialSource:evidence.officialProfileUrl,
    officialAsOf:evidence.officialAsOf,
    identityVerified,measurementsVerified,careerTotalsMatchAtSourceSnapshots:totalsMatch,
    sourceTotals,officialTotals:evidence.record,
    note:totalsMatch?'Totals matched the provided official snapshot':
      'Totals differ between source captures. Reconcile result-cutoff dates before certification.'
  };
}
async function main(){
  const cohort=await read('data/sumo/rikishi-index.json');
  if(cohort?.count!==190||cohort.rikishi?.length!==190)throw Error('Frozen 190-rikishi cohort mismatch');
  const spotchecks=await read(join(ROOT,'jsa-spotchecks.json'),{bySourceId:{}});
  const correctionManifest=await read(join(ROOT,'official-bout-corrections.json'),{bySourceId:{}});
  const audited=[],officialComparisons=[];
  for(const w of cohort.rikishi){
    const doc=await read(join(ROOT,'rikishi',w.sourceId+'.json'));
    const publicSnapshot=await read(join(ROOT,'jsa-public','profiles',w.sourceId+'.json'),null);
    audited.push(auditRikishi(w,doc,correctionManifest,publicSnapshot));
    const checked=crossCheckOfficial(w,doc,spotchecks.bySourceId?.[String(w.sourceId)]);
    if(checked)officialComparisons.push(checked);
  }
  const overview={
    schemaVersion:1,scope:'Research API response integrity only — NEVER a JSA or full-career certificate',
    cohortSize:190,certified:0,
    notAttempted:audited.filter(x=>x.status==='not-attempted').length,
    collecting:audited.filter(x=>x.status==='still-collecting').length,
    integrityException:audited.filter(x=>x.status==='source-integrity-exception').length,
    sourceReady:audited.filter(x=>x.readyForExternalCrosscheck).length,
    officiallyCorrectedSourceBouts:audited.reduce((n,x)=>n+(x.appliedOfficialBoutCorrections?.length||0),0),
    officiallyResolvedCareerStatsLags:audited.filter(x=>x.effectiveCareerTotals?.independentlyResolvedSourceDifference).length,
    records:{weight:audited.reduce((a,b)=>a+b.counts.weights,0),rank:audited.reduce((a,b)=>a+b.counts.ranks,0),matches:audited.reduce((a,b)=>a+b.counts.matches,0)},
    independentJsaSpotchecks:{
      identityVerified:officialComparisons.filter(x=>x.identityVerified).length,
      measurementsVerified:officialComparisons.filter(x=>x.measurementsVerified).length,
      currentRecordMatches:officialComparisons.filter(x=>x.careerTotalsMatchAtSourceSnapshots).length,
      comparisons:officialComparisons
    },
    pendingExternalChecks:['JSA identity/current profile','JSA/independent chronological career crosscheck',
      'Published height and weight provenance','Cross-source fight-history totals','Photo licensing'],
    cases:audited.filter(x=>x.errors.length||x.warnings.length||x.readyForExternalCrosscheck).slice(0,190)
  };
  const path=join(ROOT,'audit.json'),before=await read(path);
  if(JSON.stringify(before)!==JSON.stringify(overview)){
    await mkdir(ROOT,{recursive:true});
    const tmp=path+'.tmp';
    await writeFile(tmp,JSON.stringify(overview,null,2)+'\n');
    await rename(tmp,path);
  }
  console.log(JSON.stringify({sourceReady:overview.sourceReady,collecting:overview.collecting,notAttempted:overview.notAttempted,integrityException:overview.integrityException,records:overview.records,certified:0}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  main().catch(e=>{console.error(e);process.exitCode=1;});
}
