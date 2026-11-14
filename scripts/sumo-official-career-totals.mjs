/**
 * Reconcile source career aggregates with a JSA official snapshot ONLY if
 * independently checked previous-basho results and the full bout ledger agree.
 * No change to raw API totals or automatic career certification.
 */
export function authoritativeCareerTotals(w,cache,ledger,jsa=null){
 const stats=cache?.data?.stats||{};
 const provider={
  wins:Number(stats.totalWins),losses:Number(stats.totalLosses),
  matches:Number(stats.totalMatches),absences:Number(stats.totalAbsences)
 };
 const official=jsa?.career;
 // Some JSA profile pages publish only W-L and omit absences entirely.
 // Absence verification must never treat an absent field as numeric zero.
 const officialAbsencesPublished=official?.absences!==null&&official?.absences!==undefined;
 const officialAbsencesAgree=officialAbsencesPublished?
   Number(official.absences)===provider.absences:true;
 const validOfficial=jsa?.sourceId===Number(w.sourceId)&&
  jsa?.officialNskId===Number(w.officialNskId)&&
  jsa?.url==='https://www.sumo.or.jp/EnSumoDataRikishi/profile/'+w.officialNskId+'/'&&
  jsa?.status==='basic-fields-parsed'&&
  jsa?.fieldComparisons?.name===true&&
  jsa?.fieldComparisons?.stable===true&&
  jsa?.bashoReconciliation?.status==='historical-tournaments-agree'&&
  jsa?.bashoReconciliation?.comparedBasho>=1&&
  jsa?.bashoReconciliation?.discrepantBasho===0&&
  Number.isSafeInteger(Number(official?.wins))&&
  Number.isSafeInteger(Number(official?.losses))&&
  Number(official.wins)===ledger.wins&&
  Number(official.losses)===ledger.losses&&
  officialAbsencesAgree;
 const selected=validOfficial?{
  wins:Number(official.wins),losses:Number(official.losses),
  matches:Number(official.wins)+Number(official.losses),
  absences:officialAbsencesPublished?Number(official.absences):provider.absences
 }:provider;
 const differs=selected.wins!==provider.wins||selected.losses!==provider.losses||
  selected.matches!==provider.matches||selected.absences!==provider.absences;
 return {
  selected,originalApi:provider,
  source:validOfficial?
   (officialAbsencesPublished?'official-JSA-public-record-verified-against-bout-ledger':
    'official-JSA-public-WL-verified-absences-unpublished'):'sumo-api-career-stats',
  officialAbsencesPublished:validOfficial?officialAbsencesPublished:null,
  officialAbsencesVerified:validOfficial&&officialAbsencesPublished,
  independentlyResolvedSourceDifference:validOfficial&&differs,
  historicBashoCompared:validOfficial?jsa.bashoReconciliation.comparedBasho:0,
  officialUrl:validOfficial?jsa.url:null,
  officialAsOf:validOfficial?jsa.officialAsOf:null,
  certifiedCareer:false,
  note:validOfficial&&differs?
    'Official JSA career totals and independently compared historical tournaments match the complete bout ledger; the API aggregate is preserved unchanged.':
    'Source total selected for research only; complete independent career certification remains separate.'
 };
}
