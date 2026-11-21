/**
 * Apply source-specific JSA results to derived research records only.
 * Never changes raw Sumo API cache; no career is certified by this overlay.
 */
export function applyOfficialBoutCorrections(w,cache,manifest=null){
  const source=cache?.data?.matches;
  if(!Array.isArray(source))return {matches:[],applied:[],errors:['missing-source-bouts']};
  const rules=manifest?.bySourceId?.[String(w.sourceId)]||[];
  if(!Array.isArray(rules))return {matches:source,applied:[],errors:['invalid-correction-manifest']};
  const matches=[...source],applied=[],errors=[],ids=new Set();
  for(const rule of rules){
    const key=String(rule.correctionId||'');
    if(!key||ids.has(key)||Number(rule.sumoApiId)!==Number(w.sourceId)||
       Number(rule.officialNskId)!==Number(w.officialNskId)||
       rule.sourceUrl!=='https://www.sumo.or.jp/EnSumoDataRikishi/profile/'+w.officialNskId+'/'||
       rule.status!=='official-bout-outcome-reconciled'){
      errors.push('correction-identity-or-evidence-invalid:'+key);continue;
    }
    ids.add(key);
    const candidates=matches.map((m,i)=>({m,i})).filter(({m})=>
      String(m.bashoId)===String(rule.bashoId)&&Number(m.day)===Number(rule.day)&&
      m.division===rule.division&&Number(m.winnerId)===Number(rule.expectedRawWinnerId)&&
      m.kimarite===rule.sourceKimarite&&
      (Number(m.eastId)===Number(w.sourceId)||Number(m.westId)===Number(w.sourceId))&&
      (Number(m.eastId)===Number(rule.opponentId)||Number(m.westId)===Number(rule.opponentId)));
    if(candidates.length!==1){errors.push('missing-or-nonunique-raw-bout:'+key);continue;}
    const {m,i}=candidates[0],newWinner=Number(rule.verifiedOfficialWinnerId);
    if(newWinner===Number(m.winnerId)||
      ![Number(m.eastId),Number(m.westId)].includes(newWinner)||
      !Number.isSafeInteger(newWinner)){errors.push('invalid-corrected-winner:'+key);continue;}
    matches[i]={...m,winnerId:newWinner,
      winnerEn:newWinner===Number(rule.opponentId)?rule.opponentName:w.shikonaEn,
      winnerJp:'',
      officialResultCorrection:{id:key,rawWinnerId:Number(m.winnerId),
        verifiedWinnerId:newWinner,sourceUrl:rule.sourceUrl,
        sourceTournament:rule.sourceTournament,careerCertified:false}};
    applied.push({correctionId:key,bashoId:rule.bashoId,day:Number(rule.day),
      oldWinnerId:Number(m.winnerId),newWinnerId:newWinner,sourceUrl:rule.sourceUrl});
  }
  return {matches,applied,errors};
}
