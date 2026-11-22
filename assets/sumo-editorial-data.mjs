/* Presentation-only selection helpers. Never mutate cached API records. */
export const boutBaseKey=row=>[row.bashoId,row.day,row.opponentId].map(v=>String(v??'unknown')).join('-');
export const boutKey=row=>{
  const extra=[row.eventType?'special-'+String(row.eventType):'',
    Number.isSafeInteger(Number(row.matchNo))&&Number(row.matchNo)>0?'match-'+Number(row.matchNo):''].filter(Boolean);
  return [boutBaseKey(row),...extra].join('-');
};
/** Source identity, day, opponent, optional match number and special-bout type
 * remain distinct. A current result supersedes exactly one matching historical
 * copy; ambiguous double bouts are preserved rather than silently discarded. */
function validDisplayBout(row){
  const id=Number(row?.opponentId);
  if(Number.isSafeInteger(id)&&id>0)return true;
  // Explicit upper-division absences are source rows without an opponent,
  // unlike unscheduled Makushita non-bout days. Never create fake opponent IDs.
  return row?.outcome==='absence'&&row?.opponentId===null&&
    /^\d{6}$/.test(String(row?.bashoId))&&Number.isInteger(Number(row?.day));
}
export function mergeProfileBouts(current=[],historical=[]){
  const rows=new Map();
  for(const row of historical){
    if(!validDisplayBout(row))continue;
    rows.set(boutKey(row),row);
  }
  for(const row of current){
    if(!validDisplayBout(row))continue;
    const candidates=[...rows.entries()].filter(([key,old])=>
      !old.eventType&&boutBaseKey(old)===boutBaseKey(row));
    const exact=candidates.filter(([,old])=>old.outcome===row.outcome&&String(old.kimarite??'')===String(row.kimarite??''));
    const match=(exact.length===1?exact:candidates.length===1?candidates:[]);
    if(match.length===1)rows.delete(match[0][0]);
    rows.set(boutKey(row),row);
  }
  return [...rows.values()].sort((a,b)=>String(b.bashoId).localeCompare(String(a.bashoId))||
    Number(b.day||0)-Number(a.day||0)||Number(a.opponentId)-Number(b.opponentId)||
    String(a.eventType||'').localeCompare(String(b.eventType||''))||
    Number(a.matchNo||0)-Number(b.matchNo||0));
}
export function filterAndSortOpponents(rows=[],query='',sort='meetings',label=r=>r.name||''){
  const q=String(query).trim().toLocaleLowerCase();
  const matches=rows.filter(r=>!q||String(label(r)).toLocaleLowerCase().includes(q));
  const name=(a,b)=>String(label(a)).localeCompare(String(label(b)),'en')||Number(a.id)-Number(b.id);
  return matches.sort((a,b)=>sort==='name'?name(a,b):
    sort==='record'?(Number(b.wins)-Number(b.losses))-(Number(a.wins)-Number(a.losses))||name(a,b):
    Number(b.meetings)-Number(a.meetings)||name(a,b));
}
export function exactNamePriority(w,query){
  const q=String(query).trim().toLocaleLowerCase();
  return q&&(String(w.shikonaEn||'').toLocaleLowerCase()===q||
    String(w.shikonaJp||'').toLocaleLowerCase()===q)?0:1;
}
