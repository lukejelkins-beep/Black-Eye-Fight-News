/**
 * Cross-profile chronology and kimarite coverage for the frozen 190-rikishi
 * Sumo research cohort. Derives from existing fully paginated API caches.
 * No external requests, no licensing claims and NO career certification.
 * A source conflict is retained for review rather than silently selecting
 * either winner or winning technique.
 */
import {readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';

const ROOT='data/sumo/backfill/v1';
const read=async(p,otherwise=null)=>{try{return JSON.parse(await readFile(p,'utf8'))}catch(e){if(e.code==='ENOENT')return otherwise;throw e}};
const integer=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
export function sourceBoutKey(m){
  const sides=[Number(m.eastId),Number(m.westId)].sort((a,b)=>a-b);
  if(sides.some(x=>!integer(x))||sides[0]===sides[1]||
     !/^(18|19|20)\d{2}(01|03|05|07|09|11)$/.test(String(m.bashoId))||
     !Number.isSafeInteger(Number(m.day))||Number(m.day)<1||Number(m.day)>15)
    throw Error('Invalid career H2H bout identity/date');
  return [...sides,String(m.bashoId),Number(m.day),Number(m.matchNo)||0].join(':');
}
export function checkChronology(profiles,cohortIds){
  const cohort=new Set(cohortIds),readyIds=new Set(profiles.map(p=>Number(p.sourceId))),seen=new Map();
  let sourceAppearances=0,regularAppearances=0,forfeitAppearances=0;
  let techniqueKnownAppearances=0,missingTechniqueAppearances=0,specialAppearances=0;
  for(const p of profiles){
    const id=Number(p.sourceId);
    if(!cohort.has(id)||p.certification!=='not-started'||
       p.status!=='source-regular-bouts-reconciled-external-verification-pending')
      throw Error('Unqualified research profile in H2H chronology');
    let counted=0;
    for(const opponent of p.headToHead||[]){
      const other=Number(opponent.opponentId);
      if(!integer(other)||other===id||!Array.isArray(opponent.meetings)||
         !Array.isArray(opponent.playoffsAndTrialBouts)||opponent.meetings.length!==opponent.regularBouts)
        throw Error('Missing or invalid opponent chronology for '+id+' v '+other);
      const wins=opponent.meetings.filter(m=>m.winnerId===id).length;
      const losses=opponent.meetings.filter(m=>m.winnerId===other).length;
      if(wins!==opponent.wins||losses!==opponent.losses||
         wins+losses!==opponent.regularBouts)
        throw Error('H2H W-L not reconciled to source bouts for '+id+' v '+other);
      let known=0,forfeits=0,missing=0;
      for(const m of opponent.meetings){
        if(m.opponentId!==other||![id,other].includes(Number(m.winnerId)))
          throw Error('Invalid historical bout winner/opponent ID');
        const key=sourceBoutKey(m),tech=typeof m.kimarite==='string'?m.kimarite.trim():null;
        const kind=tech===null||tech===''?'technique-not-recorded':/^fusen/i.test(tech)?'forfeit':'kimarite';
        if(m.resultKind!==kind)throw Error('Incorrect missing/forfeit kimarite label');
        if(kind==='forfeit')forfeits++;
        else if(kind==='kimarite')known++;
        else missing++;
        const info={sourceId:id,winnerId:Number(m.winnerId),kimarite:tech||null,
          officialCorrection:!!m.officialCorrection};
        if(!seen.has(key))seen.set(key,[]);
        if(seen.get(key).some(x=>x.sourceId===id))
          throw Error('Duplicate H2H bout in one wrestler history');
        seen.get(key).push(info);
        regularAppearances++;
      }
      if(known!==opponent.techniqueKnown||forfeits!==opponent.forfeitCount||
         missing!==opponent.techniqueMissing)throw Error('Wrong technique coverage counters');
      techniqueKnownAppearances+=known;
      forfeitAppearances+=forfeits;
      missingTechniqueAppearances+=missing;
      specialAppearances+=opponent.playoffsAndTrialBouts.length;
      counted+=opponent.regularBouts;
    }
    if(counted!==p.boutHistory.regularBouts)
      throw Error('H2H chronology incomplete relative to complete career: '+id);
    sourceAppearances++;
  }
  const conflicts=[],counterpartGaps=[];
  const unique={known:0,forfeits:0,missing:0};
  for(const [key,copies] of seen){
    const entry=copies[0];
    if(entry.kimarite===null)unique.missing++;
    else if(/^fusen/i.test(entry.kimarite))unique.forfeits++;
    else unique.known++;
    const parts=key.split(':'),bothInCohort=readyIds.has(Number(parts[0]))&&readyIds.has(Number(parts[1]));
    if(copies.length>2||copies.some(c=>c.winnerId!==entry.winnerId||
       c.kimarite!==entry.kimarite)){
      conflicts.push({key,records:copies});
    }else if(bothInCohort&&copies.length===1){
      counterpartGaps.push({key,presentIn:copies[0].sourceId});
    }
  }
  return {schemaVersion:1,scope:'Completed API careers and source-derived H2H; not JSA-certified',
    cohortSize:cohort.size,profilesChecked:sourceAppearances,
    sourceRegularBoutAppearances:regularAppearances,
    uniqueSourceRegularBouts:seen.size,
    allTimePairComparisons:'Regular tournaments only; playoff and Mae-zumo results separately retained',
    h2hResultFields:['bashoId','day','division','matchNo','eastId','westId','winnerId','opponentId','outcome','kimarite','resultKind','sourceMatchKey'],
    techniqueCoverage:{sourceAppearances:{recorded:techniqueKnownAppearances,forfeits:forfeitAppearances,missing:missingTechniqueAppearances},
      uniqueRows:unique},
    specialBoutAppearances:specialAppearances,
    counterpartConflicts:conflicts.length,counterpartGaps:counterpartGaps.length,
    discrepancies:{conflicts:conflicts.slice(0,30),counterpartGaps:counterpartGaps.slice(0,30)},
    integrityStatus:conflicts.length||counterpartGaps.length?'needs-pair-reconciliation':'source-pair-reconciled',
    certified:0,notes:[
      'A win/loss tally is not enough; every historical bout retains the recorded kimarite or a missing/forfeit label',
      'Historical bouts are source-complete for a wrestler only if that full career passed the existing independent API totals audit',
      'Cross-fighter mismatches are preserved as exceptions, not silently marked verified',
      'JSA independent bout-by-bout certification remains outstanding'
    ]};
}
async function main(){
  const roster=await read('data/sumo/rikishi-index.json');
  if(roster?.count!==190)throw Error('Frozen Sumo roster mismatch');
  const profiles=[],missingProfiles=[];
  for(const w of roster.rikishi){
    const p=await read(join(ROOT,'profile-ready',w.sourceId+'.json'));
    if(!p){missingProfiles.push({sourceId:w.sourceId,name:w.shikonaEn,reason:'profile projection withheld pending source reconciliation'});continue;}
    profiles.push(p);
  }
  const audit=checkChronology(profiles,roster.rikishi.map(w=>w.sourceId));
  audit.missingProfiles=missingProfiles;
  audit.profilesNotYetCrosscheckReady=missingProfiles.length;
  if(missingProfiles.length) audit.integrityStatus='incomplete-profile-projections-require-review';
  const dest=join(ROOT,'h2h-chronology-coverage.json'),old=await read(dest);
  if(JSON.stringify(old)!==JSON.stringify(audit)){
    const tmp=dest+'.tmp';
    await writeFile(tmp,JSON.stringify(audit,null,2)+'\n');
    await rename(tmp,dest);
  }
  console.log(JSON.stringify({profiles:audit.profilesChecked,uniqueBouts:audit.uniqueSourceRegularBouts,
    kimarite:audit.techniqueCoverage.uniqueRows,conflicts:audit.counterpartConflicts,
    missingCounterparts:audit.counterpartGaps,certified:0}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
}
