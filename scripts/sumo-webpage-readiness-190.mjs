/**
 * Audit the fields required by the Sumo web UI, without generating false
 * pictures, flags, weigh-ins, ranks or career certificates.
 * This is a coverage/readiness report, not an approval to publish.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {originCountry} from '../assets/sumo-data.mjs';
const ROOT='data/sumo/backfill/v1';
const DEST=join(ROOT,'webpage-readiness.json');
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const optional=async path=>{try{return await read(path)}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const pos=n=>Number.isFinite(Number(n))&&Number(n)>0;
export function approvedPortrait(photo){
 return !!photo&&photo.approved===true&&
  /^assets\/sumo-photos\/[a-zA-Z0-9_-]+\.(webp|png|jpg|jpeg)$/.test(String(photo.path||''))&&
  typeof photo.license==='string'&&!!photo.license.trim()&&
  typeof photo.credit==='string'&&!!photo.credit.trim();
}
export function webpageReadinessRow(w,p,photo,official){
 if(!p||Number(p.sourceId)!==Number(w.sourceId)||
   Number(p.officialNskId)!==Number(w.officialNskId)||
   p.certification!=='not-started'||p.releaseGates?.certified!==false)
  throw Error('Untrusted or premature Sumo profile '+w.sourceId);
 const country=originCountry(p.identity?.birthplace);
 const fields={
  identity:!!p.shikonaEn&&!!p.identity?.shikonaJp&&!!p.identity?.stable&&
   !!p.identity?.birthDate,
  countryFlag:!!country?.flag,
  currentRank:!!p.current?.rank,
  currentListedHeightWeight:pos(p.current?.heightCm)&&pos(p.current?.weightKg),
  officialCurrentListing:!!p.currentOfficialMeasurement&&
   p.currentOfficialMeasurement.snapshotType==='current-listed-weight-not-dated-weigh-in'&&
   p.currentOfficialMeasurement.measurementDateKnown===false,
  careerRecord:!Number.isNaN(Number(p.career?.wins))&&
   !Number.isNaN(Number(p.career?.losses))&&pos(p.career?.basho),
  historicalWeightGraph:Array.isArray(p.measurements)&&p.measurements.length>0&&
   p.measurements.every(m=>/^(18|19|20)\d{2}(01|03|05|07|09|11)$/.test(String(m.bashoId))&&
     pos(m.weightKg)&&!!m.sourceUrl),
  careerRankGraph:Array.isArray(p.rankTimeline)&&p.rankTimeline.length>0&&
   p.rankTimeline.every(r=>/^(18|19|20)\d{2}(01|03|05|07|09|11)$/.test(String(r.bashoId))&&!!r.rank),
  tournamentResults:Array.isArray(p.perBasho)&&p.perBasho.length>0,
  fullBoutPagination:p.boutHistory?.fullPagination===true&&
   Number.isSafeInteger(Number(p.boutHistory?.regularBouts)),
  opponentHeadToHead:Array.isArray(p.headToHead)&&p.headToHead.length>0,
  kimariteWinsLosses:Array.isArray(p.kimarite?.wins)&&Array.isArray(p.kimarite?.losses),
  recentPerformance:Array.isArray(p.recentPerformance)&&p.recentPerformance.length>0,
  officiallyPublishedCareerTotals:!!official?.career,
  publishedJsaBashoChecks:!!official?.bashoReconciliation&&
   official.bashoReconciliation.discrepantBasho===0&&
   official.bashoReconciliation.comparedBasho>0,
  authorisedPortrait:approvedPortrait(photo),
  fullCareerCertified:p.releaseGates?.certified===true
 };
 const dataFields=['identity','countryFlag','currentRank','currentListedHeightWeight',
  'careerRecord','historicalWeightGraph','careerRankGraph','tournamentResults',
  'fullBoutPagination','opponentHeadToHead','kimariteWinsLosses','recentPerformance'];
 return {sourceId:w.sourceId,name:w.shikonaEn,division:p.current?.rank?.split(' ')[0]||null,
  dataFieldsReady:dataFields.every(k=>fields[k]),
  missingDataFields:dataFields.filter(k=>!fields[k]),
  fields,photoStatus:fields.authorisedPortrait?'approved-local-asset':'awaiting-approved-photo',
  verificationStatus:'research-sources-collected-career-not-certified',
  certification:'not-started'};
}
export function summarizeWebpageReadiness(rows){
 if(rows.length!==190||new Set(rows.map(x=>x.sourceId)).size!==190)
  throw Error('Expected exact frozen 190 rikishi');
 const names=Object.keys(rows[0].fields);
 const fieldCounts=Object.fromEntries(names.map(name=>[name,rows.filter(r=>r.fields[name]).length]));
 return {schemaVersion:1,cohort:190,scope:'Research-only webpage readiness, NOT production or career certification',
  completeDataFields:rows.filter(x=>x.dataFieldsReady).length,
  fieldCounts,missingByField:Object.fromEntries(names.map(name=>[name,
   rows.filter(r=>!r.fields[name]).map(r=>r.sourceId)])),
  certifiedProfiles:0,
  approvedForProduction:false,
  note:'Every missing field is explicit. No inferred current-basho weigh-ins, flags, portraits, image rights or career certifications.',
  rows};
}

/**
 * User-approved 15 Nov 2026 change: trust source-complete Sumo API histories
 * for non-production profile development. Preserve strict career-result
 * certificates separately, do not hide errors, and do not grant publication.
 * Uses cached records only; no paid/external calls.
 */
export function buildApiTrustedReadiness(webReport,sourceAudit,strict,spotchecks=null){
 const rows=webReport?.rows||[],cases=sourceAudit?.cases||[],certs=strict?.rows||[];
 const unique=xs=>new Set(xs.map(x=>Number(x.sourceId))).size===190;
 if(webReport?.cohort!==190||sourceAudit?.cohortSize!==190||
    strict?.cohortSize!==190||strict?.strictAuditSuccessful!==true||
    rows.length!==190||cases.length!==190||certs.length!==190||
    !unique(rows)||!unique(cases)||!unique(certs))
  throw Error('API-trusted decision requires matching frozen 190-profile source and strict checkpoints');
 const auditById=new Map(cases.map(x=>[Number(x.sourceId),x]));
 const strictById=new Map(certs.map(x=>[Number(x.sourceId),x]));
 const legacy=spotchecks?.bySourceId||{};
 const decisions=rows.map(r=>{
  const source=auditById.get(Number(r.sourceId));
  const independent=strictById.get(Number(r.sourceId));
  if(!source||!independent)throw Error('Missing matching Sumo source identity '+r.sourceId);
  const blockers=[];
  if(!r.dataFieldsReady)blockers.push('missing-core-display-fields');
  if(source.readyForExternalCrosscheck!==true||source.stagesCompleted!==6||
     (source.errors||[]).length||source.boutLedger?.missingWinner!==0)
   blockers.push('source-integrity-review');
  const spot=legacy[String(r.sourceId)];
  const reviewFlags=[];
  if(spot?.status==='requires-reconciliation')
   reviewFlags.push('legacy-JSA-spotcheck-needs-current-cutoff-review');
  if(!r.fields?.authorisedPortrait)reviewFlags.push('licensed-photo-or-placeholder-only');
  const apiTrusted=blockers.length===0;
  return {sourceId:r.sourceId,name:r.name,
   nonProductionPreviewStatus:apiTrusted?'api-trusted-preview-ready':'targeted-integrity-review',
   sourceMethod:'completed-Sumo-API-cache-with-documented-JSA-correction-overlays',
   strictCareerResultsCertified:independent.careerResultsCertified===true,
   fullProfileCertified:false,productionReleaseApproved:false,
   blockers,reviewFlags,missingDataFields:r.missingDataFields||[]};
 });
 const ready=decisions.filter(x=>x.nonProductionPreviewStatus==='api-trusted-preview-ready').length;
 return {schemaVersion:1,methodology:'API-trusted with targeted integrity checks',
  decisionDate:'2026-11-15',
  scope:'Research branch and isolated website development only',
  cohortSize:190,apiTrustedReadyForNonProductionPreview:ready,
  integrityBlocked:190-ready,strictCareerResultsCertified:certs.filter(x=>x.careerResultsCertified).length,
  strictCareerResultsStillBlocked:certs.filter(x=>!x.careerResultsCertified).length,
  existingStrictEvidenceUnchanged:true,
  legacySpotcheckReviewProfiles:decisions.filter(x=>x.reviewFlags.includes('legacy-JSA-spotcheck-needs-current-cutoff-review')).length,
  missingLicensedPortraits:decisions.filter(x=>x.reviewFlags.includes('licensed-photo-or-placeholder-only')).length,
  fullProfilesCertified:0,productionReleaseApproved:false,
  decisionRules:[
   'Use full API pagination and internal W-L/H2H/identity checks for development rather than demanding independent JSA proof on every profile',
   'Keep original raw API data immutable; retain independently verified corrections and all existing strict certificates',
   'Keep unknown ranks, historical weigh-ins, absences and kimarite unknown; never infer missing values',
   'Flag material API integrity failures and historic JSA snapshot discrepancies without treating a missing independent source as an API error',
   'Use licensed portraits only; placeholders otherwise; no permission inferred for public API redistribution or site release'
  ],rows:decisions};
}

async function main(){
 const roster=await read('data/sumo/rikishi-index.json');
 if(roster?.count!==190||roster.rikishi?.length!==190)
  throw Error('Invalid frozen Sumo cohort');
 const photos=await optional('data/sumo/approved-photos.json')||{bySourceId:{}};
 const results=[];
 for(const w of roster.rikishi){
  const profile=await read(join(ROOT,'profile-ready',w.sourceId+'.json'));
  const official=await optional(join(ROOT,'jsa-public','profiles',w.sourceId+'.json'));
  results.push(webpageReadinessRow(w,profile,
    photos.bySourceId?.[String(w.sourceId)]||null,official));
 }
 const report=summarizeWebpageReadiness(results);
 const sourceAudit=await read(join(ROOT,'audit.json'));
 const strict=await read(join(ROOT,'career-certification-strict.json'));
 const spotchecks=await optional(join(ROOT,'jsa-reconciliation.json'));
 const apiTrusted=buildApiTrustedReadiness(report,sourceAudit,strict,spotchecks);
 await mkdir(ROOT,{recursive:true});
 const text=JSON.stringify(report,null,2)+'\n';
 const prior=await readFile(DEST,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(prior!==text){const temp=DEST+'.tmp';await writeFile(temp,text);await rename(temp,DEST);}
 const trustedDest=join(ROOT,'api-trusted-readiness.json');
 const trustedText=JSON.stringify(apiTrusted,null,2)+'\n';
 const trustedPrior=await readFile(trustedDest,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(trustedPrior!==trustedText){const temp=trustedDest+'.tmp';await writeFile(temp,trustedText);await rename(temp,trustedDest);}
 console.log(JSON.stringify({apiTrustedPreviewReady:apiTrusted.apiTrustedReadyForNonProductionPreview,
  targetedIntegrityReview:apiTrusted.integrityBlocked,
  historicalJsaSpotchecksToReview:apiTrusted.legacySpotcheckReviewProfiles,
  strictCareerResultsCertified:apiTrusted.strictCareerResultsCertified,productionApproved:false}));
 console.log(JSON.stringify({profiles:190,coreDataReady:report.completeDataFields,
  approvedPhotos:report.fieldCounts.authorisedPortrait,
  countryFlags:report.fieldCounts.countryFlag,
  JSA:report.fieldCounts.officiallyPublishedCareerTotals,certified:0}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 main().catch(e=>{console.error(e);process.exitCode=1;});
