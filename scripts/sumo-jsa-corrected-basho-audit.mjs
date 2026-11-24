/**
 * Offline JSA tournament W-L reconciliation using already independently
 * evidenced official bout corrections in the derived research ledger.
 * Raw Sumo API pages and official snapshots are never overwritten by a guess.
 * Does not make HTTP calls and does NOT certify wrestler careers.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {applyOfficialBoutCorrections} from './sumo-official-bout-corrections.mjs';
import {reconcileJsaBashoResults,cohortCurrentBasho} from './sumo-jsa-public-spotcheck.mjs';
const ROOT='data/sumo/backfill/v1';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const optional=async p=>{try{return await read(p)}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const save=async(p,d)=>{await mkdir(join(ROOT,'jsa-public','profiles'),{recursive:true});
 const tmp=p+'.tmp';await writeFile(tmp,JSON.stringify(d,null,2)+'\n');await rename(tmp,p);};
export function auditCorrectedJsaTournament(w,official,api,manifest,activeBashoId=null){
 if(!official||!api)return null;
 if(Number(official.sourceId)!==Number(w.sourceId)||
   Number(official.officialNskId)!==Number(w.officialNskId)||
   String(official.url)!=='https://www.sumo.or.jp/EnSumoDataRikishi/profile/'+w.officialNskId+'/')
   throw Error('Mismatched official identity '+w.sourceId);
 if(!Array.isArray(official.officialBashoRecords))
   throw Error('Missing official tournament observations '+w.sourceId);
 const applied=applyOfficialBoutCorrections(w,api,manifest);
 if(applied.errors.length)throw Error('Official correction validation failed '+w.sourceId+': '+applied.errors.join(','));
 const adjusted={...api,data:{...api.data,matches:applied.matches}};
 const report=reconcileJsaBashoResults(official.officialBashoRecords,adjusted,official.officialAsOf,activeBashoId);
 return {...official,
   bashoReconciliation:{...report,ledgerProvenance:applied.applied.length?
     'sumo-api-bouts-plus-verified-official-outcome-overlays':'unaltered-sumo-api-bouts',
     officialOutcomeOverlays:applied.applied,
     rawSourceMatchesChanged:false,
     careerCertified:false}};
}
async function main(){
 const roster=await read('data/sumo/rikishi-index.json');
 if(roster?.count!==190||roster.rikishi?.length!==190)throw Error('Unexpected 190-rikishi roster');
 const manifest=await read(join(ROOT,'official-bout-corrections.json'));
 let checked=0,repaired=0,changed=0,historicalCompared=0,disagreements=0;
 for(const w of roster.rikishi){
  const dest=join(ROOT,'jsa-public','profiles',w.sourceId+'.json');
  const official=await optional(dest);
  if(!official)continue;
  const source=await read(join(ROOT,'rikishi',w.sourceId+'.json'));
  const result=auditCorrectedJsaTournament(w,official,source,manifest,cohortCurrentBasho(roster));
  checked++;
  if(result.bashoReconciliation.officialOutcomeOverlays.length)repaired++;
  historicalCompared+=result.bashoReconciliation.comparedBasho;
  disagreements+=result.bashoReconciliation.discrepantBasho;
  if(JSON.stringify(official)!==JSON.stringify(result)){
   await save(dest,result);changed++;
  }
 }
 const summaryPath=join(ROOT,'jsa-public','summary.json');
 const summary=await optional(summaryPath);
 if(summary){
  const updated={...summary,historicalBashoCompared:historicalCompared,
    historicalDiscrepancies:disagreements,
    officialOutcomeOverlaysUsed:repaired};
  if(JSON.stringify(summary)!==JSON.stringify(updated))await save(summaryPath,updated);
 }
 console.log(JSON.stringify({checked,rewritten:changed,profilesWithOfficialCorrections:repaired,
   historicalBashoCompared:historicalCompared,unresolvedHistoricalDiscrepancies:disagreements,
   certifiedCareers:0}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 main().catch(e=>{console.error(e);process.exitCode=1;});
