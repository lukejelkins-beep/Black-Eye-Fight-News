/**
 * BEFN Sumo strict historical-career-results verification (research only).
 * This is the single decision register downstream of the existing 190-person
 * source preflight. It never rewrites source documents or publishes profiles.
 *
 * A passed result verifies complete regular-bout career W/L against an
 * independent JSA per-basho ledger, official career totals, historical ranks,
 * independent source identity and reciprocal matchup integrity.
 * It DOES NOT independently verify every kimarite, historical weigh-in or
 * licensed photograph. Those remain separate full-profile release gates.
 */
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {cohortCurrentBasho} from './sumo-jsa-public-spotcheck.mjs';
import {documentedDebutRankGap,supplementalHistoricalBashoCoverage,independentHistoricalRankCoverage,independentlyVerifiedCurrentBashoCutoff,proveZeroCareerAbsencesFromCompleteBasho,independentlyCorroboratedProfileWeightForCareerOnly} from './sumo-certification-preflight-190.mjs';

const ROOT='data/sumo/backfill/v1';
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const validId=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const goodInt=x=>x!==null&&x!==undefined&&Number.isSafeInteger(Number(x))&&Number(x)>=0;
const sum=(arr,field)=>arr.reduce((n,r)=>n+Number(r[field]||0),0);
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');

export function strictCareerAudit({w,p,raw,official,weight,preflight,sourceAudit,h2h,activeBasho}){
 const fail=[],add=(condition,reason)=>{if(!condition)fail.push(reason);};
 const id=Number(w?.sourceId);
 const ident=validId(id)&&validId(w?.officialNskId)&&validId(w?.sumoDbId);
 add(ident,'frozen-source-identity');
 add(!!preflight&&Number(preflight.sourceId)===id&&
  preflight.classification==='candidate-for-strict-audit'&&
  Array.isArray(preflight.blockers)&&preflight.blockers.length===0,
  'preflight-prerequisites-not-met');
 add(!!p&&Number(p.sourceId)===id&&Number(p.officialNskId)===Number(w?.officialNskId)&&
  p.certification==='not-started'&&p.releaseGates?.certified===false,
  'projected-profile-identity-or-state');
 add(!!raw&&Number(raw.rikishiId)===id&&Number(raw.nskId)===Number(w?.officialNskId)&&
  raw.researchOnly===true&&raw.certification==='not-started'&&
  ['profile','stats','measurements','ranks','shikonas','matches'].every(k=>
    raw.stages?.[k]?.complete===true),
  'incomplete-source-pagination-or-identity');
 add(!!sourceAudit&&Number(sourceAudit.sourceId)===id&&
   sourceAudit.readyForExternalCrosscheck===true&&
   Array.isArray(sourceAudit.errors)&&sourceAudit.errors.length===0&&
   sourceAudit.boutLedger?.missingWinner===0,
   'source-audit-or-native-bout-ledger-failed');
 const b=p?.boutHistory||{}, matches=raw?.data?.matches||[], per=p?.perBasho||[];
 add(b.fullPagination===true&&b.rawSourceImmutable===true&&
  goodInt(b.regularBouts)&&goodInt(b.otherBouts)&&
  b.totalRawBouts===matches.length&&b.totalRawBouts===b.regularBouts+b.otherBouts&&
  b.regularWins+b.regularLosses===b.regularBouts&&
  sum(per,'scheduledBoutRows')===b.regularBouts&&
  sum(per,'wins')===b.regularWins&&sum(per,'losses')===b.regularLosses&&
  per.every(x=>goodInt(x.wins)&&goodInt(x.losses)&&goodInt(x.scheduledBoutRows)&&
   x.wins+x.losses===x.scheduledBoutRows),
  'full-per-basho-and-regular-bout-ledger-reconciliation');
 add(goodInt(p?.career?.wins)&&goodInt(p?.career?.losses)&&goodInt(p?.career?.absences)&&
  p.career.wins===b.regularWins&&p.career.losses===b.regularLosses&&
  sourceAudit?.boutLedger?.authoritativeWins===p.career.wins&&
  sourceAudit?.boutLedger?.authoritativeLosses===p.career.losses,
  'career-totals-not-backed-by-source-ledger');
 const history=p?.rankTimeline||[];
 const evidencedDebutGap=documentedDebutRankGap(p,official);
 add(history.length>0&&Array.isArray(p?.rankHistoryGaps)&&
  (p.rankHistoryGaps.length===0||evidencedDebutGap)&&
  history.every(r=>/^(18|19|20)\d{2}(01|03|05|07|09|11)$/.test(String(r.bashoId))&&
  typeof r.rank==='string'&&r.rank.length>4),
  'dated-career-rank-history-incomplete');
 const j=official||{},basic=j.fieldComparisons||{},bh=j.bashoReconciliation||{},rank=j.rankReconciliation||{};
 const profileWeightReview=independentlyCorroboratedProfileWeightForCareerOnly(w,p,j,weight);
 add(Number(j.sourceId)===id&&Number(j.officialNskId)===Number(w?.officialNskId)&&
  j.url==='https://www.sumo.or.jp/EnSumoDataRikishi/profile/'+w.officialNskId+'/'&&
  /^[a-f0-9]{64}$/.test(String(j.rawHtmlSha256||''))&&
  basic.name===true&&basic.stable===true&&basic.rankGrade===true&&
  (Object.values(basic).every(x=>x!==false)||profileWeightReview.passed),
  'independent-official-profile-identity-or-fields');
 const sumoDbPublished=weight?.careerRecordCrosscheck||null;
 const independentCareer=sumoDbPublished?.career||null;
 const exactIndependent=sumoDbPublished?.identityVerified===true&&
  sumoDbPublished?.originalMeasurementsUnchanged===true&&
  sumoDbPublished?.independentOfApi===true&&
  /^[a-f0-9]{64}$/.test(String(sumoDbPublished.rawHtmlSha256||''))&&
  sumoDbPublished.sourceUrl==='https://sumodb.sumogames.de/Rikishi.aspx?r='+w?.sumoDbId&&
  independentCareer?.absences!==null&&independentCareer?.absences!==undefined&&
  independentCareer.wins===p?.career?.wins&&
  independentCareer.losses===p?.career?.losses&&
  independentCareer.absences===p?.career?.absences;
 // If JSA explicitly publishes any component, it takes precedence. Use an
 // independent SumoDB three-part record only to fill unpublished components,
 // and still require agreement with all completed JSA per-basho outcomes.
 const jsaCareerPresent=j.career!=null;
 const currentCutoff=independentlyVerifiedCurrentBashoCutoff(p,j,activeBasho);
 const zeroAbsenceProof=proveZeroCareerAbsencesFromCompleteBasho(p,j,weight,activeBasho);
 const jsaWLMatches=jsaCareerPresent&&(
  j.career.wins===p?.career?.wins&&j.career.losses===p?.career?.losses||
  currentCutoff.passed||zeroAbsenceProof.passed);
 const jsaAbsencePresent=jsaCareerPresent&&j.career.absences!=null;
 const basis=jsaWLMatches&&jsaAbsencePresent&&
  j.career.absences===p?.career?.absences?'published-JSA-career-WLA':
  zeroAbsenceProof.passed?
   'source-complete-ranked-basho-prove-zero-native-absences':
  exactIndependent&&(!jsaCareerPresent||jsaWLMatches)&&
   (!jsaAbsencePresent||j.career.absences===p?.career?.absences)?
   'separate-SumoDB-career-WLA-plus-published-JSA-basho':null;
 add(!!basis,'independent-published-career-wins-losses-absences');
 const prior=per.filter(x=>x.bashoId!==activeBasho&&x.scheduledBoutRows>0);
 const historicalProof=supplementalHistoricalBashoCoverage(p,official,weight,activeBasho);
 const officialPer=new Map((j.officialBashoRecords||[]).map(x=>[x.bashoId,x]));
 add(historicalProof.passed&&
  bh.discrepantBasho===0&&bh.agreeingBasho===bh.comparedBasho&&
  (historicalProof.baselineJsa!==true||
    prior.every(x=>{const o=officialPer.get(x.bashoId);return o?.wins===x.wins&&o?.losses===x.losses;}))&&
  (bh.unmatchedOfficialBasho||[]).every(x=>{
   const o=officialPer.get(x);return o&&o.wins===0&&o.losses===0;
  })&&
  bh.rawSourceMatchesChanged===false,
  'independent-official-completed-tournament-results');
 const rankCoverage=independentHistoricalRankCoverage(p,j,weight);
 const originalOfficialCoverage=rankCoverage.evidenceBasis==='JSA-dated-ranks';
 const additionalRankMatches=rankCoverage.independentAdditional;
 // Preflight and strict audit share the same >=75% date-exact source
 // requirement. An unavailable JSA rank table is never called corroborated.
 add(rankCoverage.passed,'independent-official-banzuke-rank-coverage');
 const birth=weight?.identityRecheck?.identityEvidence||weight?.identityEvidence||{};
 add(Number(weight?.sourceId)===id&&Number(weight?.officialNskId)===Number(w?.officialNskId)&&
  Number(weight?.sumoDbId)===Number(w?.sumoDbId)&&
  birth.valid===true&&birth.birthDateStatus==='match'&&
  Array.isArray(weight.datedEvidence)&&weight.datedEvidence.length>0&&
  p?.measurementCoverage?.conflictingOverlaps?.length===0,
  'independent-source-identity-or-measurement-conflict');
 const chronology=p?.headToHead||[];
 add(h2h?.cohortSize===190&&h2h.profilesChecked===190&&
  h2h.counterpartConflicts===0&&h2h.counterpartGaps===0&&
  h2h.integrityStatus==='source-pair-reconciled'&&
  sum(chronology,'regularBouts')===b.regularBouts&&
  chronology.every(x=>x.meetings?.length===x.regularBouts&&
    x.wins+x.losses===x.regularBouts&&x.meetings.every(m=>
     validId(m.winnerId)&&typeof m.kimarite==='string'&&
     m.kimarite.trim().length>0&&m.resultKind!=='technique-not-recorded')),
  'complete-native-h2h-or-kimarite-provenance');
 const blockers=[...new Set(fail)];
 const careerResultsCertified=blockers.length===0;
 const sources={
  api:'https://www.sumo-api.com/api/rikishi/'+id,
  jsa:j.url||null,
  historicalMeasurements:weight?.sourcePageUrl||
    weight?.sources?.sumodb?.url||null
 };
 return {
  sourceId:id,name:w?.shikonaEn||null,
  status:careerResultsCertified?'career-results-strictly-certified':'strict-audit-blocked',
  careerResultsCertified,
  careerTotalsEvidenceBasis:careerResultsCertified?basis:null,
  datedJsaCareerCutoffReconciled:careerResultsCertified&&currentCutoff.passed,
  datedJsaCareerCutoffEvidence:careerResultsCertified&&currentCutoff.passed?
   currentCutoff:null,
  zeroAbsenceIndependentlyProvedByAllRankedBasho:
   careerResultsCertified&&zeroAbsenceProof.passed,
  zeroAbsenceCompletedBashoCompared:careerResultsCertified&&zeroAbsenceProof.passed?
   zeroAbsenceProof.completedBashoProven:0,
  documentedNoPublishedNumberedDebutRank:evidencedDebutGap,
  independentlyCrosscheckedOlderBashoFromSumoDB:careerResultsCertified?
    historicalProof.otherSourceBasho:0,
  independentlyCrosscheckedOlderRanksFromSumoDB:careerResultsCertified&&
    !originalOfficialCoverage?additionalRankMatches:0,
  rankHistoryEvidenceBasis:careerResultsCertified?rankCoverage.evidenceBasis:null,
  missingDebutRankPreservedAsNull:evidencedDebutGap,
  independentlyVerifiedBy:careerResultsCertified?[
    basis==='published-JSA-career-WLA'?'JSA published W-L-A':
    zeroAbsenceProof.passed?'Full independent numbered-rank basho W-L proving native zero absences':
    'SumoDB published W-L-A',
    'JSA completed tournament W-L',
    rankCoverage.evidenceBasis==='SumoDB-dated-ranks-JSA-historical-ranks-unavailable'?
      'SumoDB dated banzuke ranks (JSA historical ranks unavailable)':
      rankCoverage.evidenceBasis==='JSA-dated-ranks'?
       'JSA dated banzuke ranks':'JSA and SumoDB dated banzuke ranks',
    'SumoDB matching wrestler identity'
  ]:[],
  sourceNativeBoutLedgerReconciled:careerResultsCertified,
  independentlyCorroboratedWeightOnlyProfileConflict:careerResultsCertified&&profileWeightReview.passed,
  retainedWeightProfileDifference:profileWeightReview.passed?{
   officialJsaWeightKg:profileWeightReview.officialJsaWeightKg,
   unmodifiedSourceApiProfileWeightKg:profileWeightReview.preservedRawApiProfileWeightKg,
   currentProfileWeightCertified:false}:null,
  independentBoutByBoutKimariteCertified:false,
  historicalWeightTimelineCertified:false,
  fullProfileCertified:false,
  releaseApproved:false,
  blockers,
  checks:{regularBouts:b.regularBouts??0,
   completedTournamentResultsCrosschecked:bh.comparedBasho??0,
   historicalRanksCrosschecked:rank.comparedBasho??0,
   allTimeOpponents:chronology.length,
   independentWeightDates:weight?.datedEvidence?.length??0},
  sources,
  evidenceDigest:digest({raw:raw?.data,p,official,weight,preflight,
    sourceAudit:{status:sourceAudit?.status,boutLedger:sourceAudit?.boutLedger},
    globalH2H:{cohortSize:h2h?.cohortSize,conflicts:h2h?.counterpartConflicts,
     gaps:h2h?.counterpartGaps}})
 };
}
export function strictSummary(rows,preflight){
 if(rows.length!==190||new Set(rows.map(x=>x.sourceId)).size!==190)
  throw Error('Strict audit must cover exactly the frozen 190 distinct wrestler IDs');
 const certified=rows.filter(x=>x.careerResultsCertified);
 const blocked=rows.filter(x=>!x.careerResultsCertified);
 if(certified.some(x=>x.blockers.length>0)||certified.length>
   Number(preflight?.candidateForStrictAudit||0))
  throw Error('Certification cannot exceed validated source preflight');
 return {
  schemaVersion:1,scope:'Research-only canonical career-result verification decision register',
  cohortSize:190,strictAuditSuccessful:true,
  strictCareerResultsCertified:certified.length,
  blocked:blocked.length,
  confirmedNumberedRankAbsentAtDebut:certified.filter(x=>x.documentedNoPublishedNumberedDebutRank).length,
  fullProfilesCertified:0,productionApproved:false,
  meaning:'Certifies source-complete regular-bout career result ledgers against JSA published tournament W-L and dated ranks plus JSA career W-L-A when available; if JSA omits an aggregate, independently published exact-match SumoDB W-L-A may supply missing components. Does NOT independently certify individual kimarite, historical weigh-ins, images or full profile publication.',
  certificationMethod:'JSA crosscheck + complete API native-bout ledger + reciprocal H2H + dated identity evidence',
  rows
 };
}
/** Do not silently discard a previously audited certificate when one
 * source later drifts or a parser changes. Require investigation before a
 * formerly certified career loses strict status, even if another newly passes.
 */
export function preventSilentCertificationRegression(previous,current){
 if(!previous)return true;
 if(previous.cohortSize!==190||!Array.isArray(previous.rows)||
    current?.cohortSize!==190||!Array.isArray(current?.rows))
  throw Error('Certification checkpoint shape mismatch');
 const latest=new Map(current.rows.map(x=>[Number(x.sourceId),x]));
 const previousPasses=previous.rows.filter(x=>x.careerResultsCertified);
 const lost=previousPasses.filter(x=>latest.get(Number(x.sourceId))?.careerResultsCertified!==true);
 if(lost.length)throw Error('Strict certification regression requires independent review: '+
   lost.slice(0,8).map(x=>x.name||x.sourceId).join(', '));
 return true;
}

async function main(){
 const roster=await load('data/sumo/rikishi-index.json');
 const pre=await load(join(ROOT,'career-certification-preflight.json'));
 const source=await load(join(ROOT,'audit.json'));
 const h2h=await load(join(ROOT,'h2h-chronology-coverage.json'));
 if(roster.count!==190||roster.rikishi?.length!==190||
  pre.cohortSize!==190||source.cohortSize!==190)
  throw Error('Frozen 190 cohort/audit mismatch');
 const sourceById=new Map(source.cases.map(x=>[Number(x.sourceId),x]));
 const preById=new Map(pre.rows.map(x=>[Number(x.sourceId),x]));
 const activeBasho=cohortCurrentBasho(roster),rows=[];
 for(const w of roster.rikishi){
  const id=w.sourceId;
  const [p,raw,official,weight]=await Promise.all([
   load(join(ROOT,'profile-ready',id+'.json')),
   load(join(ROOT,'rikishi',id+'.json')),
   load(join(ROOT,'jsa-public/profiles',id+'.json')),
   load(join(ROOT,'weight-source-crosschecks',id+'.json'))
  ]);
  rows.push(strictCareerAudit({w,p,raw,official,weight,
   preflight:preById.get(id),sourceAudit:sourceById.get(id),h2h,activeBasho}));
 }
 const report=strictSummary(rows,pre);
 const target=join(ROOT,'career-certification-strict.json');
 const earlier=await readFile(target,'utf8').catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 preventSilentCertificationRegression(earlier?JSON.parse(earlier):null,report);
 await mkdir(ROOT,{recursive:true});
 const body=JSON.stringify(report,null,2)+'\n';
 const old=await readFile(target,'utf8').catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(old!==body){
  const temp=target+'.tmp';await writeFile(temp,body);await rename(temp,target);
 }
 console.log(JSON.stringify({strictAuditSuccessful:true,cohort:190,
  careerResultsCertified:report.strictCareerResultsCertified,
  blocked:report.blocked,fullyCertifiedProfiles:0,productionApproved:false,
  certifiedNames:rows.filter(x=>x.careerResultsCertified).map(x=>x.name)}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 main().catch(e=>{console.error(e);process.exitCode=1;});
