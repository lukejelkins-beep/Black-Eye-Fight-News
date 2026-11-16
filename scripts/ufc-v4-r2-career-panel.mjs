/** Offline-first R2 verified UFC career panel. No automatic DOM mounting or network calls.
 * Caller must pass the exact audited cohort and explicitly enable the flag.
 */
import {canShowVerifiedCareer} from './ufc-v4-r2-career-gate.mjs';
const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''));
const validResult=new Set(['win','loss','draw','no_contest']);
export function renderVerifiedCareerPanel({featureEnabled=false,fighterSlug,audit,expectedCommit,
  duplicateIdentitySlugs=[],bouts=[]}={}){
  const eligibility=canShowVerifiedCareer({featureEnabled,fighterSlug,audit,expectedCommit,duplicateIdentitySlugs});
  if(!eligibility.allowed)return {visible:false,reason:eligibility.reason,html:''};
  if(!Array.isArray(bouts)||!bouts.length)return {visible:false,reason:'no_complete_history',html:''};
  const clean=bouts.map(b=>({date:b?.date,opponent:b?.opponent,event:b?.event,
    result:b?.result,method:b?.method,round:b?.round})); 
  if(clean.some(b=>!validDate(b.date)||!String(b.opponent||'').trim()||
      !validResult.has(b.result)||!String(b.event||'').trim()))
    return {visible:false,reason:'invalid_bout_data',html:''};
  const keys=new Set(clean.map(b=>b.date+'|'+b.opponent.toLowerCase()+'|'+b.event.toLowerCase()));
  if(keys.size!==clean.length)return {visible:false,reason:'duplicate_bouts',html:''};
  const ordered=[...clean].sort((a,b)=>b.date.localeCompare(a.date));
  const rows=ordered.map(b=>'<tr><td>'+escapeHtml(b.date)+'</td><td>'+escapeHtml(b.opponent)+
    '</td><td>'+escapeHtml(b.event)+'</td><td>'+escapeHtml(b.result.replace('_',' '))+
    '</td><td>'+escapeHtml(b.method||'Unavailable')+'</td><td>'+
    escapeHtml(b.round??'Unavailable')+'</td></tr>').join('');
  return {visible:true,reason:'certified_at_exact_commit',html:
    '<section class="befn-ufc-r2-career" aria-label="Verified UFC career">'+
    '<h3>UFC career history</h3><div class="befn-ufc-r2-career-scroll" tabindex="0">'+
    '<table><thead><tr><th>Date</th><th>Opponent</th><th>Event</th><th>Result</th>'+
    '<th>Method</th><th>Round</th></tr></thead><tbody>'+rows+
    '</tbody></table></div></section>'};
}
