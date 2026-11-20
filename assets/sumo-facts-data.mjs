/* BEFN Sumo — current, sourced and reproducible fun-facts selectors.
 * No network access here; derives live claims only from the latest published
 * cached banzuke and a deliberately bounded Makuuchi/Juryo/Makushita cohort.
 */
export const FACT_DIVISIONS=['Makuuchi','Juryo','Makushita'];
export const FACT_SOURCE='https://www.sumo-api.com/api-guide';
const validDate=x=>typeof x==='string'&&!Number.isNaN(Date.parse(x));
const serial=id=>String(id??'');
const decided=record=>Array.isArray(record)?record.filter(x=>x&&['win','loss'].includes(String(x.result||'').toLowerCase())):[];
const simpleRank=rank=>String(rank||'').replace(/\s+\d+\s+(East|West)$/i,'');
const fmtBasho=id=>/^20\d{2}(01|03|05|07|09|11)$/.test(String(id||''))?new Date(Date.UTC(Number(String(id).slice(0,4)),Number(String(id).slice(4,6))-1,1)).toLocaleDateString('en-AU',{month:'long',year:'numeric',timeZone:'UTC'}):'Current basho';
const dayCount=(rows)=>rows.filter(x=>x.result==='win'||x.result==='loss').length;
const currentStreak=(rows)=>{
 let n=0;
 for(let i=rows.length-1;i>=0;i--){if(rows[i].result==='win')n++;else break;}
 return n;
};
export function currentFactRows(roster,details){
 if(!Array.isArray(roster?.rikishi)||!details||!/^20\d{4}$/.test(String(details.bashoId||'')))return [];
 const tracked=new Map(roster.rikishi.map(w=>[serial(w.sourceId),w]));
 const rows=[];
 for(const division of FACT_DIVISIONS){
  const source=details.banzuke?.[division];
  if(source?.status!=='available'||!Array.isArray(source.data?.east)||!Array.isArray(source.data?.west))continue;
  for(const entry of [...source.data.east,...source.data.west]){
   const w=tracked.get(serial(entry.rikishiID));
   if(!w||!Array.isArray(entry.record))continue;
   const d=decided(entry.record);
   const wins=d.filter(x=>x.result==='win').length,losses=d.length-wins;
   const last5=d.slice(-5);
   rows.push({
    id:serial(w.sourceId),name:String(w.shikonaEn||entry.shikonaEn||''),jp:w.shikonaJp||'',
    rank:String(entry.rank||w.currentRank||''),stable:String(w.heya||''),division,
    wins,losses,bouts:d.length,streak:currentStreak(d),lastFiveWins:last5.filter(x=>x.result==='win').length,
    lastFiveBouts:last5.length,perfect:d.length>0&&losses===0,
    rankValue:Number.isFinite(Number(entry.rankValue))?Number(entry.rankValue):99999,
    remaining:Math.max(0,(division==='Makushita'?7:15)-d.length),
    sourceId:Number(w.sourceId)
   });
  }
 }
 return rows;
}
export function assessFactFreshness(details,now=new Date()){
 const timestamp=details?.dailyCollectedAt||details?.collectedAt;
 const time=validDate(timestamp)?Date.parse(timestamp):null;
 const current=now instanceof Date?now.getTime():new Date(now).getTime();
 const ageHours=time===null||!Number.isFinite(current)?null:(current-time)/3600000;
 return {timestamp:time===null?null:new Date(time).toISOString(),ageHours,
  fresh:ageHours!==null&&ageHours>=-2&&ageHours<=48};
}
const fact=(key,category,headline,description,rows,tag,metric,priority=0)=>({
 key,category,headline,description,memberIds:rows.map(x=>x.id),tag,metric,priority,
 sourceUrl:FACT_SOURCE,sourceLabel:'Current Sumo API banzuke snapshot',kind:'dynamic'
});
const sortForm=(a,b)=>b.wins-a.wins||a.losses-b.losses||b.streak-a.streak||a.rankValue-b.rankValue;
export function currentFactFeed(roster,details,editorial,{now=new Date()}={}){
 const all=currentFactRows(roster,details);
 const timestamp=assessFactFreshness(details,now);
 const byId=new Map(all.map(w=>[w.id,w]));
 const feed=[],dynamic=[];
 const dataAvailable=FACT_DIVISIONS.every(x=>details?.banzuke?.[x]?.status==='available');
 if(dataAvailable&&timestamp.fresh){
  const maku=all.filter(x=>x.division==='Makuuchi'&&x.bouts>=3).sort(sortForm);
  if(maku.length){
   const best=maku[0];
   const leaders=maku.filter(x=>x.wins===best.wins&&x.losses===best.losses);
   dynamic.push(fact('makuuchi-title-race','title','The Makuuchi title race',
    leaders.length===1?best.name+' leads BEFN’s current Makuuchi standings with '+best.wins+' wins and '+best.losses+' losses.':
    leaders.map(x=>x.name).join(', ')+' share the Makuuchi lead at '+best.wins+'–'+best.losses+'.',
    leaders,'TITLE RACE',best.wins+'–'+best.losses,105));
  }
  const perfect=all.filter(x=>x.bouts>=4&&x.perfect).sort(sortForm).slice(0,6);
  for(const w of perfect)dynamic.push(fact('perfect-'+w.id,'fire',w.name+' is unbeaten',
    'Still perfect through '+w.bouts+' decided '+(w.bouts===1?'bout':'bouts')+' in '+w.division+'. '+
    (w.division==='Makushita'?'Makushita wrestlers normally compete seven times per basho.':'Up to 15 scheduled tournament days.'),
    [w],'UNBEATEN',w.wins+'–0',100+w.wins));
  const bestForm=all.filter(x=>x.bouts>=5&&x.lastFiveBouts===5&&x.lastFiveWins===5&&!x.perfect)
    .sort((a,b)=>b.streak-a.streak||b.wins-a.wins||a.rankValue-b.rankValue).slice(0,6);
  for(const w of bestForm)dynamic.push(fact('lastfive-'+w.id,'fire',w.name+' has won five straight',
   'A clean five wins from the five most recently decided bouts in this '+fmtBasho(details.bashoId)+' tournament. '+
   'Current record: '+w.wins+'–'+w.losses+'.',[w],'ON FIRE',w.streak+'-bout win streak',91+w.streak));
  // A streak is consecutive decided bouts, not calendar days (critical for Makushita).
  for(const w of all.filter(x=>x.streak>=4&&!x.perfect&&x.lastFiveWins<5)
    .sort((a,b)=>b.streak-a.streak||b.wins-a.wins).slice(0,5)){
   dynamic.push(fact('streak-'+w.id,'fire',w.name+' is heating up',
    w.streak+' consecutive wins across decided bouts in this basho. Overall '+w.wins+'–'+w.losses+'.',
    [w],'HOT STREAK',w.streak+' straight',85+w.streak));
  }
  for(const w of all.filter(x=>x.division!=='Makushita'&&x.wins>=10&&x.losses<=4)
    .sort(sortForm).slice(0,5))
    dynamic.push(fact('doublefig-'+w.id,'watch',w.name+' has reached double figures',
     w.wins+' wins and '+w.losses+' losses in '+w.division+' this basho. Only completed decisions are counted.',
     [w],'10+ WINS',w.wins+' victories',85+w.wins));
  const near10=all.filter(x=>x.division!=='Makushita'&&x.wins===9&&x.losses<=5)
    .sort(sortForm).slice(0,3);
  for(const w of near10)dynamic.push(fact('near10-'+w.id,'watch',w.name+' is one win from ten',
   'Nine completed victories so far. A tenth win would bring double figures for this basho.',[w],'MILESTONE WATCH','9 wins',80));
  const nearKachi=all.filter(x=>x.division!=='Makushita'&&x.wins===7&&x.losses<=7).sort(sortForm).slice(0,3);
  for(const w of nearKachi)dynamic.push(fact('kachikoshi-'+w.id,'watch',w.name+' is one win from kachi-koshi',
   'Seven victories so far. An eighth would guarantee a winning record in a standard 15-day tournament.',
   [w],'MILESTONE WATCH','7 wins',76));
  const nearSeven=all.filter(x=>x.division==='Makushita'&&x.wins===6&&x.losses===0).slice(0,4);
  for(const w of nearSeven)dynamic.push(fact('seven-'+w.id,'watch',w.name+' is chasing 7–0',
    'Six wins without defeat; one more would complete a perfect seven-bout Makushita tournament.',
    [w],'PERFECT BASHO WATCH','6–0',94));
 }
 const availableEditorial=Array.isArray(editorial?.items)?editorial.items:[];
 // Historical relationships never become stale "breaking" news. Record-holder
 // entries require periodic review: unpublished after 90 days without renewal.
 for(const item of availableEditorial){
  const ids=(item.memberIds||[]).map(serial);
  if(!ids.length||!ids.every(id=>byId.has(id)))continue;
  const legitimateSource=/^https:\/\//.test(item.sourceUrl||'');
  const verified=validDate(item.verifiedAt);
  if(!legitimateSource||!verified)continue;
  const age=(new Date(now).getTime()-Date.parse(item.verifiedAt+'T00:00:00Z'))/86400000;
  if(item.kind==='record'&&(age<0||age>90))continue;
  feed.push({key:item.id,category:item.kind==='record'?'records':'family',
    headline:item.title,description:item.short,memberIds:ids,tag:item.tag,kind:'editorial',
    sourceLabel:item.sourceLabel,sourceUrl:item.sourceUrl,verifiedAt:item.verifiedAt,metric:null,priority:item.kind==='record'?72:60});
 }
 const selected=new Set();
 const selectedDynamic=[];
 for(const card of dynamic.sort((a,b)=>b.priority-a.priority)){
  if(card.category==='fire'){
   // Avoid overloading the feed with four near-identical cards for one rikishi.
   if(card.memberIds.every(id=>selected.has(id)))continue;
   card.memberIds.forEach(id=>selected.add(id));
  }
  selectedDynamic.push(card);
  if(selectedDynamic.length>=18)break;
 }
 return {asOf:timestamp.timestamp,fresh:timestamp.fresh,ageHours:timestamp.ageHours,
  bashoId:String(details?.bashoId||''),bashoLabel:fmtBasho(details?.bashoId),
  trackedCount:Array.isArray(roster?.rikishi)?roster.rikishi.length:0,
  rows:all,cards:[...selectedDynamic,...feed],dynamicCount:selectedDynamic.length,editorialCount:feed.length,
  dataAvailable,source:'Sumo API cached banzuke and independently reviewed editorial sources'};
}
