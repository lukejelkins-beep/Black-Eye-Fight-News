/**
 * Read-only, source-scoped match-up helpers for the BEFN Sumo test preview.
 * Never infer an all-time H2H record from a single basho or partial career sample.
 */
const validId = value => Number.isSafeInteger(Number(value)) && Number(value)>0;
export const pairKey=(a,b)=>[Number(a),Number(b)].sort((x,y)=>x-y).join(':');

export function japanDate(when=new Date()){
  const value = when instanceof Date ? when : new Date(when);
  if(!Number.isFinite(value.getTime()))return null;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(value).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return parts.year+'-'+parts.month+'-'+parts.day;
}
export function bashoDayForDate(when,startDate){
  const start=String(startDate||'').slice(0,10),japan=japanDate(when);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!japan)return null;
  const delta=Math.round((Date.parse(japan+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000);
  return delta+1;
}
export function nextDayForBasho(when,startDate){
  const today=bashoDayForDate(when,startDate);
  return today!==null&&today>=0&&today<15?today+1:null;
}
export function ageInJapan(birthDate,when=new Date()){
  const born=String(birthDate||'').slice(0,10),today=japanDate(when);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(born)||!today||born>today)return null;
  const age=Number(today.slice(0,4))-Number(born.slice(0,4))-
    (today.slice(5)<born.slice(5)?1:0);
  return age>=0&&age<=120?age:null;
}
export function h2hHistory(details,a,b){
  const first=Number(a),second=Number(b);
  if(!validId(first)||!validId(second)||first===second)return null;
  const sources=[];
  if(Array.isArray(details?.h2hPairs))for(const entry of details.h2hPairs){
    if(entry?.status==='available'&&entry.data)sources.push({id:Number(entry.rikishiId),other:Number(entry.opponentId),data:entry.data});
  }
  for(const item of details?.featuredExtras||[]){
    if(item?.headToHead?.record?.status!=='available'||!item.headToHead.record.data)continue;
    sources.push({id:Number(item.id),other:Number(item.headToHead.opponentId),data:item.headToHead.record.data});
  }
  for(const item of sources){
    if(!((item.id===first&&item.other===second)||(item.id===second&&item.other===first)))continue;
    const w=item.data.rikishiWins, l=item.data.opponentWins;
    if(!Number.isInteger(w)||!Number.isInteger(l)||w<0||l<0)continue;
    const matches=Array.isArray(item.data.matches)?item.data.matches:[];
    const rows=matches.filter(m=>{
      const east=Number(m.eastId),west=Number(m.westId),winner=Number(m.winnerId);
      return ((east===first&&west===second)||(east===second&&west===first))&&
        (winner===first||winner===second)&&/^\d{6}$/.test(String(m.bashoId))&&
        Number.isInteger(Number(m.day))&&Number(m.day)>=1&&Number(m.day)<=15;
    }).map(m=>({
      bashoId:String(m.bashoId),day:Number(m.day),winnerId:Number(m.winnerId),
      kimarite:typeof m.kimarite==='string'?m.kimarite.trim():null,
      division:String(m.division||''),matchNo:Number(m.matchNo)||null
    })).sort((x,y)=>y.bashoId.localeCompare(x.bashoId)||y.day-x.day||(y.matchNo||0)-(x.matchNo||0));
    const wins=item.id===first?w:l,losses=item.id===first?l:w;
    const total=w+l;
    return {wins,losses,total,rows,complete:rows.length===total,
      source:'sumo-api pair-specific response',collectedAt:details?.collectedAt||null};
  }
  return null;
}
export function techniqueText(name){
  const term=String(name||'').trim();
  if(!term)return 'Technique not recorded';
  if(/^fusen/i.test(term))return 'Fusen (forfeit; no technique)';
  return term[0].toUpperCase()+term.slice(1);
}
