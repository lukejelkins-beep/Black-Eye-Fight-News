/**
 * Research-only Sumo readiness is deliberately distinct from independent
 * career-result certification and from full-profile/publication approval.
 * Source snapshot: data/sumo/api-trusted-status.json
 */
const validId = x => Number.isSafeInteger(Number(x)) && Number(x)>0;
export function validateSumoPreviewReadiness(snapshot,roster){
 const rikishi=roster?.rikishi||[];
 const ids=new Set(rikishi.map(x=>Number(x.sourceId)));
 const strict=snapshot?.strictCareerResultsPendingSourceIds;
 const review=snapshot?.legacyJsaSpotcheckReviewSourceIds;
 if(snapshot?.schemaVersion!==1||snapshot?.methodology!=='API-trusted with targeted integrity checks'||
    snapshot?.cohortSize!==190||snapshot?.apiTrustedPreviewReady!==190||
    snapshot?.apiSourceIntegrityExceptions!==0||
    snapshot?.fullProfilesCertified!==0||snapshot?.productionApproved!==false||
    snapshot?.sourceRedistributionPermissionConfirmed!==false||
    roster?.count!==190||rikishi.length!==190||ids.size!==190||
    !Array.isArray(strict)||!Array.isArray(review)||
    new Set(strict.map(Number)).size!==strict.length||
    new Set(review.map(Number)).size!==review.length||
    !strict.every(x=>validId(x)&&ids.has(Number(x)))||
    !review.every(x=>validId(x)&&ids.has(Number(x)))||
    snapshot.strictCareerResultsCertified!==190-strict.length)
  throw Error('API-trusted Sumo preview status is missing, inconsistent or out of date');
 return true;
}
export function wrestlerQuality(w,snapshot){
 const id=Number(w?.sourceId);
 if(!validId(id)||!snapshot||snapshot.cohortSize!==190)return null;
 const pending=snapshot.strictCareerResultsPendingSourceIds.includes(id);
 const historicalReview=snapshot.legacyJsaSpotcheckReviewSourceIds.includes(id);
 return {
  method:'API-trusted career source',
  careerResultsStatus:pending?
    'Career results: independent corroboration incomplete':
    'Career results: independently corroborated',
  historicalReview,
  fullProfileApproved:false,
  productionApproved:false
 };
}
