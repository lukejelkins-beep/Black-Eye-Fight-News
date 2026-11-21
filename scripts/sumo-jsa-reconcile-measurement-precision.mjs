/**
 * Offline JSA vs Sumo API numeric-display reconciliation.
 * The JSA profile presents whole kg/cm; the API can hold decimal values.
 * This repairs *comparison classification*, never a source value,
 * historical observation, official match, or career certification.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {compareJsaListedMeasurement} from './sumo-jsa-public-spotcheck.mjs';
const ROOT='data/sumo/backfill/v1/jsa-public';
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const optional=async path=>{try{return await read(path)}catch(e){if(e.code==='ENOENT')return null;throw e;}};
export function precisionReconcileJsaSnapshot(w,original){
 if(!original)return null;
 if(Number(original.sourceId)!==Number(w.sourceId)||
    Number(original.officialNskId)!==Number(w.officialNskId))
  throw Error('Official profile identity does not match frozen roster for '+w.sourceId);
 const measurementComparisonDetails={
  height:compareJsaListedMeasurement(original.heightCm,w.heightCm),
  weight:compareJsaListedMeasurement(original.weightKg,w.weightKg)
 };
 const fields={...original.fieldComparisons,
  height:measurementComparisonDetails.height.match,
  weight:measurementComparisonDetails.weight.match};
 const prevStatus=String(original.status||'');
 // Do not turn a source without career totals or identity evidence into
 // a complete profile. Only reclassify existing field comparisons.
 let status=prevStatus;
 if(prevStatus==='field-disagreement'&&
    Object.values(fields).every(v=>v===true)&&original.career!=null)
  status='basic-fields-parsed';
 if(prevStatus==='basic-fields-parsed'&&
    Object.values(fields).some(v=>v===false))
  status='field-disagreement';
 return {...original,fieldComparisons:fields,measurementComparisonDetails,
  measurementComparisonMethod:'published-integer-precision',
  historicMeasurementsChanged:false,status};
}
async function save(path,doc){
 await mkdir(ROOT,{recursive:true});
 const temp=path+'.tmp';
 await writeFile(temp,JSON.stringify(doc,null,2)+'\n');
 await rename(temp,path);
}
async function main(){
 const roster=await read('data/sumo/rikishi-index.json');
 if(roster?.count!==190||roster.rikishi?.length!==190)
  throw Error('Frozen top-three Sumo cohort mismatch');
 let checked=0,updated=0,rounded=0,review=0,parsed=0;
 for(const w of roster.rikishi){
  const path=join(ROOT,'profiles',w.sourceId+'.json');
  const doc=await optional(path);
  if(!doc)continue;
  const next=precisionReconcileJsaSnapshot(w,doc);
  checked++;
  if(next.status==='basic-fields-parsed')parsed++;else review++;
  if(Object.values(next.measurementComparisonDetails).some(x=>
    x.method==='integer-display-rounding-compatible'))rounded++;
  if(JSON.stringify(next)!==JSON.stringify(doc)){await save(path,next);updated++;}
 }
 const path=join(ROOT,'summary.json'),summary=await optional(path);
 if(summary){
  const next={...summary,checked,pending:190-checked,
   parsedFields:parsed,fieldOrParsingReview:review,
   measurementPrecisionCompatibleProfiles:rounded,
   measurementPrecisionReconciliationVersion:1};
  if(JSON.stringify(summary)!==JSON.stringify(next))await save(path,next);
 }
 console.log(JSON.stringify({status:'offline-JSA-precision-reconciled',
  checked,roundedCompatibleProfiles:rounded,remainingFieldAndParserReviews:review,
  updated,certifiedCareers:0}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 main().catch(e=>{console.error(e);process.exitCode=1;});
