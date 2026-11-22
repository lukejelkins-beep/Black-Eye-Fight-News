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
/** Meaningful high-current-basho win percentages, calculated from completed bouts only.
 * A short 2-0 run doesn't outrank established 11-2 form. Lower divisions have
 * only seven bouts per basho, so their minimum is appropriately lower.
 */
export const HIGH_WIN_PCT_THRESHOLD=80;
export function highWinPercentageRows(rows,{perDivision=3}={}){
 if(!Array.isArray(rows))return [];
 const cap=Math.max(0,Math.min(12,Math.trunc(Number(perDivision)||0)));
 return FACT_DIVISIONS.flatMap(division=>rows.filter(w=>
   w.division===division&&Number.isInteger(w.wins)&&Number.isInteger(w.losses)&&
   Number.isInteger(w.bouts)&&w.bouts===w.wins+w.losses&&
   w.bouts>=(division==='Makushita'?3:5)&&w.wins*100>=HIGH_WIN_PCT_THRESHOLD*w.bouts)
  .map(w=>({...w,winPct:Math.round((w.wins/w.bouts)*1000)/10}))
  .sort((a,b)=>b.winPct-a.winPct||b.bouts-a.bouts||b.wins-a.wins||a.rankValue-b.rankValue)
  .slice(0,cap));
}
/** Rolling win percentages over N consecutive basho, including the current one.
 * Historical rows are eligible only when the source ledger and dated banzuke
 * corroborate a complete 15- or 7-bout tournament. A missing previous basho
 * makes a wrestler ineligible for that window, never an assumed 0-0.
 */
export const ROLLING_BASHO_MAX=30;
export function rollingWinPercentageRows(roster,details,period=1,{limitPerDivision=18}={}){
 const n=Number(period);
 if(!Number.isInteger(n)||n<1||n>ROLLING_BASHO_MAX)return [];
 if(n>1&&(details?.funFactsHistory?.schemaVersion!==1||
   String(details.funFactsHistory.bashoId)!==String(details.bashoId)||
   !Array.isArray(details.funFactsHistory.historicalBashos)||
   details.funFactsHistory.historicalBashos.length<n-1))return [];
 const bashos=n===1?[]:details.funFactsHistory.historicalBashos.slice(0,n-1);
 const historic=details?.funFactsHistory?.bySourceId||{};
 const all=currentFactRows(roster,details);
 const cap=Math.max(0,Math.min(50,Math.trunc(Number(limitPerDivision)||0)));
 const qualified=[];
 for(const w of all){
  if(!Number.isInteger(w.wins)||!Number.isInteger(w.losses)||!Number.isInteger(w.bouts)||w.bouts!==w.wins+w.losses)continue;
  let wins=w.wins,losses=w.losses,complete=true;
  if(n>1){
   const prior=historic[w.id]||{};
   for(const basho of bashos){
    const row=prior[basho];
    if(!Array.isArray(row)||row.length!==3||![7,15].includes(row[2])||
      !Number.isSafeInteger(row[0])||!Number.isSafeInteger(row[1])||row[0]<0||row[1]<0||
      row[0]+row[1]!==row[2]){complete=false;break;}
    wins+=row[0];losses+=row[1];
   }
  }
  if(!complete)continue;
  const minimum=n===1?(w.division==='Makushita'?3:5):5;
  const bouts=wins+losses;
  if(bouts<minimum)continue;
  qualified.push({...w,wins,losses,bouts,
   winPct:Math.round((wins/bouts)*1000)/10,period:n,periodStart:bashos.at(-1)||String(details?.bashoId||''),
   periodEnd:String(details?.bashoId||''),includesCurrent:true,
   historicBashos:n-1,completeBashos:n-1,
   samplePolicy:n===1?'Current basho, qualifying completed bouts':'Complete historical basho + completed current-basho bouts'});
 }
 return FACT_DIVISIONS.flatMap(d=>qualified.filter(x=>x.division===d)
  .sort((a,b)=>b.winPct-a.winPct||b.bouts-a.bouts||b.wins-a.wins||a.rankValue-b.rankValue)
  .slice(0,cap));
}
/** Rising stars from the cached rank/bout rollup (funFactsHistory.risers).
 * FAST TRACK: started in Jonokuchi and reached Makushita within 6 ranked basho
 * or Juryo within 10. CLIMBER: Sandanme or below three basho ago, now
 * Makushita or above, with at least 16 wins across those three complete basho.
 * "Ranked basho" counts banzuke appearances, not the earlier maezumo debut.
 */
const DIV_LEVEL={Jonokuchi:0,Jonidan:1,Sandanme:2,Makushita:3,Juryo:4,Makuuchi:5};
const DIV_NAME={Juryo:'Jūryō'};
const rankDivision=rank=>{
 const m=String(rank||'').match(/^(Yokozuna|Ozeki|Sekiwake|Komusubi|Maegashira|Juryo|Makushita|Sandanme|Jonidan|Jonokuchi)\b/);
 return m?(['Yokozuna','Ozeki','Sekiwake','Komusubi','Maegashira'].includes(m[1])?'Makuuchi':m[1]):null;
};
const bashoIdx=id=>Number(String(id).slice(0,4))*6+(Number(String(id).slice(4,6))-1)/2;
const ordinal=n=>n+(n%100>=11&&n%100<=13?'th':['th','st','nd','rd'][n%10]||'th');
const numberWord=n=>['zero','one','two','three','four','five','six','seven','eight'][n]||String(n);
export const RISING_MAX={fastTrack:4,climber:3};
export function risingStarCards(roster,details,editorial,{rows=[],fresh=false,covered:shown=null}={}){
 const h=details?.funFactsHistory;
 if(h?.risersVersion!==1||!Array.isArray(h.risers)||String(h.bashoId)!==String(details?.bashoId))return [];
 const byId=new Map((Array.isArray(roster?.rikishi)?roster.rikishi:[]).map(w=>[serial(w.sourceId),w]));
 const live=new Map((fresh?rows:[]).map(r=>[r.id,r]));
 // A wrestler with a sourced editorial rising story is not repeated here.
 const covered=shown instanceof Set?shown:new Set((Array.isArray(editorial?.items)?editorial.items:[]).filter(x=>x.kind==='rising').flatMap(x=>(x.memberIds||[]).map(serial)));
 const valid=x=>byId.has(serial(x?.id))&&!covered.has(serial(x.id))&&Array.isArray(x.path)&&x.path.length&&
  x.path.every(p=>Array.isArray(p)&&p.length===4&&rankDivision(p[1])&&(p[2]===null||(Number.isInteger(p[2])&&Number.isInteger(p[3])&&p[2]>=0&&p[3]>=0)));
 const rec=p=>p[2]===null?null:p[2]+'–'+p[3];
 const curText=(x,p)=>{const r=live.get(serial(x.id));return r&&r.bouts?r.wins+'–'+r.losses+(r.remaining>0?' so far':''):'current basho';};
 const step=(x,p,i,arr)=>p[1]+' '+(i===arr.length-1&&String(p[0])===String(details.bashoId)?curText(x,p):(rec(p)||'record incomplete'));
 const name=x=>String(byId.get(serial(x.id)).shikonaEn||'');
 const card=(key,x,headline,description,tag,metric,priority)=>({key,category:'rising',headline,description,
  memberIds:[serial(x.id)],tag,metric,priority,sourceUrl:FACT_SOURCE,sourceLabel:'Cached Sumo API rank and bout history',kind:'dynamic'});
 const fast=[];
 for(const x of h.risers.filter(valid)){
  // Newcomers only: first banzuke appearance within the last 12 basho.
  if(x.entry!=='Jonokuchi'||!x.pathStartsAtDebut||bashoIdx(details.bashoId)-bashoIdx(x.firstRankedBasho)>12)continue;
  const divs=x.path.map(p=>rankDivision(p[1]));
  const top=divs.reduce((a,d)=>DIV_LEVEL[d]>DIV_LEVEL[a]?d:a,divs[0]);
  const at=divs.indexOf(top)+1;
  if(!((top==='Makushita'&&at<=6)||((top==='Juryo'||top==='Makuuchi')&&at<=10)))continue;
  fast.push({x,top,at});
 }
 fast.sort((a,b)=>DIV_LEVEL[b.top]-DIV_LEVEL[a.top]||a.at-b.at||String(b.x.firstRankedBasho).localeCompare(String(a.x.firstRankedBasho)));
 const out=[],used=new Set();
 for(const {x,top,at} of fast.slice(0,RISING_MAX.fastTrack)){
  const perfect=x.path.filter(p=>p[2]===7&&p[3]===0).length;
  out.push(card('rising-fast-'+x.id,x,name(x)+' reached '+(DIV_NAME[top]||top)+' in his '+ordinal(at)+' ranked basho',
   'First ranked in '+fmtBasho(x.firstRankedBasho)+' at Jonokuchi. '+x.path.map(step.bind(null,x)).join(' · ')+'.'+
   (perfect>=2?' Includes '+numberWord(perfect)+' perfect 7–0 basho.':perfect===1?' Includes a perfect 7–0 basho.':'')+
   ' Ranked basho are counted from his first banzuke appearance.','FAST TRACK',ordinal(at)+' basho',88-at));
  used.add(serial(x.id));
 }
 const climbers=[];
 for(const x of h.risers.filter(valid)){
  if(used.has(serial(x.id))||!x.threeAgo)continue;
  const last=x.path.at(-1);
  if(String(last[0])!==String(details.bashoId))continue;
  const prior=x.path.slice(-4,-1);
  if(prior.length!==3||prior[0][1]!==x.threeAgo||prior.some(p=>p[2]===null||p[2]+p[3]!==7))continue;
  const wins=prior.reduce((n,p)=>n+p[2],0),losses=prior.reduce((n,p)=>n+p[3],0);
  if(wins<16||DIV_LEVEL[rankDivision(x.threeAgo)]>DIV_LEVEL.Sandanme||DIV_LEVEL[rankDivision(last[1])]<DIV_LEVEL.Makushita)continue;
  climbers.push({x,wins,losses,prior,last});
 }
 climbers.sort((a,b)=>b.wins-a.wins||a.losses-b.losses);
 for(const {x,wins,losses,prior,last} of climbers.slice(0,RISING_MAX.climber)){
  out.push(card('rising-climb-'+x.id,x,name(x)+': '+x.threeAgo+' to '+last[1]+' in three basho',
   wins+'–'+losses+' across the last three completed basho ('+prior.map(p=>p[1]+' '+rec(p)).join(' · ')+'). Now '+
   last[1]+', '+curText(x,last)+'.','CLIMBER',wins+'–'+losses,80));
 }
 return out;
}
export function currentFactFeed(roster,details,editorial,{now=new Date()}={}){
 const all=currentFactRows(roster,details);
 const timestamp=assessFactFreshness(details,now);
 const byId=new Map((Array.isArray(roster?.rikishi)?roster.rikishi:[]).map(w=>[serial(w.sourceId),w]));
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
  // Keep rate leaders distinct from raw win totals and consecutive streaks.
  // Show high-percentage wrestlers in each division, not just Makuuchi.
  for(const w of highWinPercentageRows(all)){
    const pct=w.winPct.toFixed(1)+'%';
    dynamic.push(fact('winpct-'+w.id,'percent',w.name+' is winning '+pct+' of bouts',
      w.wins+' wins from '+w.bouts+' completed bouts ('+w.wins+'–'+w.losses+') in '+w.division+
      ' this basho. Ranked by win percentage among BEFN-tracked wrestlers, with a minimum of '+
      (w.division==='Makushita'?'3':'5')+' completed bouts.',
      [w],'WIN % LEADER',pct,107));
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
  // A stablemate playoff is a documented historical relationship, not a
  // hypothetical match between two currently affiliated wrestlers.
  if(item.kind==='stablemates'){
   if(ids.length!==2||item.eventType!=='championship-playoff'||
     !/^20\d{2}(01|03|05|07|09|11)$/.test(String(item.bashoId||''))||
     !ids.includes(serial(item.winnerId))||!ids.includes(serial(item.loserId))||
     !ids.every(id=>String(byId.get(id).heya||'')===String(item.stable||'')))continue;
  }
  const legitimateSource=/^https:\/\//.test(item.sourceUrl||'');
  const verified=validDate(item.verifiedAt);
  if(!legitimateSource||!verified)continue;
  const age=(new Date(now).getTime()-Date.parse(item.verifiedAt+'T00:00:00Z'))/86400000;
  if((item.kind==='record'||item.kind==='rising')&&(age<0||age>90))continue;
  feed.push({key:item.id,category:item.kind==='record'?'records':item.kind==='stablemates'?'stablemates':item.kind==='rising'?'rising':'family',
    headline:item.title,description:item.short,memberIds:ids,tag:item.tag,kind:'editorial',
    sourceLabel:item.sourceLabel,sourceUrl:item.sourceUrl,verifiedAt:item.verifiedAt,metric:null,priority:item.kind==='record'?72:item.kind==='stablemates'?78:item.kind==='rising'?82:60});
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
  if(selectedDynamic.length>=24)break;
 }
 // Only editorial stories actually shown suppress the automatic card.
 const rising=risingStarCards(roster,details,editorial,{rows:all,fresh:dataAvailable&&timestamp.fresh,
  covered:new Set(feed.filter(c=>c.category==='rising').flatMap(c=>c.memberIds))});
 return {asOf:timestamp.timestamp,fresh:timestamp.fresh,ageHours:timestamp.ageHours,
  bashoId:String(details?.bashoId||''),bashoLabel:fmtBasho(details?.bashoId),
  trackedCount:Array.isArray(roster?.rikishi)?roster.rikishi.length:0,
  rows:all,cards:[...selectedDynamic,...feed.filter(c=>c.category==='rising'),...rising,...feed.filter(c=>c.category!=='rising')],dynamicCount:selectedDynamic.length,risingCount:rising.length,editorialCount:feed.length,
  dataAvailable,source:'Sumo API cached banzuke and independently reviewed editorial sources'};
}
