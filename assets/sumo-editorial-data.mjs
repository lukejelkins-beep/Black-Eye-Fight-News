/* Presentation-only selection helpers. Never mutate cached API records. */
export const boutKey=row=>[row.bashoId,row.day,row.opponentId].map(v=>String(v??'unknown')).join('-');
export function mergeProfileBouts(current=[],historical=[]){
  const rows=new Map();
  for(const row of historical)if(Number.isSafeInteger(Number(row?.opponentId))&&Number(row.opponentId)>0)rows.set(boutKey(row),row);
  // Current banzuke results and confirmed torikumi supersede an older cached copy.
  for(const row of current)if(Number.isSafeInteger(Number(row?.opponentId))&&Number(row.opponentId)>0)rows.set(boutKey(row),row);
  return [...rows.values()].sort((a,b)=>String(b.bashoId).localeCompare(String(a.bashoId))||
    Number(b.day||0)-Number(a.day||0)||Number(a.opponentId)-Number(b.opponentId));
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
