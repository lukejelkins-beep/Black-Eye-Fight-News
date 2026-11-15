#!/usr/bin/env node
/** Read-only independent-source exception detail for BEFN V4 next-20 batch.
 * Never modifies paid UFCalendar provider cache or certification registry.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const src=read('data/ufc-v4-next20-greco-fight-links-20261114.json');
const research=read('data/ufcalendar-fighter-research.json');
const progress=read('data/ufcalendar-rich-progress.json');
const metrics=read('data/ufc-postfight-metrics.json');
const norm=x=>String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases={alatengheili:'heilialateng',heilialateng:'heilialateng'};
const opponentKey=x=>aliases[norm(x)]||norm(x);
const gap=(a,b)=>a&&b?Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000):999;
const issues=[];
for(const [slug,entry] of Object.entries(src.fighters)){
 const missing=entry.rows.filter(r=>!r.nativeBoutId);
 if(!missing.length)continue;
 const profile=research.profiles?.[slug]||{};
 const saved=(profile.recentHistory||[]).filter(x=>String(x.promotion||x.org||'').toLowerCase()==='ufc');
 for(const official of missing){
  const nearSaved=saved.filter(x=>Math.abs(gap(x.date,official.date))<=3&&opponentKey(x.opponent)===opponentKey(official.opponent));
  const candidates=nearSaved.map(row=>{
   const id=String(row.boutId||'');
   const native=progress.bouts?.[id]||null;
   const measured=metrics.fighters?.[slug]?.careerBouts?.find(x=>String(x.boutId)===id)||null;
   const corner=native?.a?.slug===slug?native?.a:native?.b?.slug===slug?native?.b:null;
   return {date:row.date,opponent:row.opponent,savedResult:row.result,
    boutId:id,nativeEvent:native?.event||null,nativeEventDate:native?.eventDate||null,
    nativeEventId:native?.eventId||null,nativeOrg:native?.org||null,
    nativeFighterId:corner?.id||null,nativeMethod:native?.result?.method||null,
    nativeStatus:native?.status||null,nativeWinnerId:native?.result?.winnerId||null,
    measured:!!measured,metricClock:measured?.cageSec??null,
    deltaFromGrecoDays:gap(row.date,official.date)};
  });
  const inBoutCache=Object.values(progress.bouts||{}).filter(b=>
    b?.org==='ufc'&&Math.abs(gap(b.eventDate,official.date))<=3&&
    [b.a?.slug,b.b?.slug].includes(slug)&&
    [b.a?.name,b.b?.name].some(x=>opponentKey(x)===opponentKey(official.opponent)));
  issues.push({slug,sourceDate:official.date,sourceOpponent:official.opponent,
   sourceOutcome:official.result,sourceFightUrl:official.fightUrl,
   candidates,otherCachedBouts:inBoutCache.map(b=>({id:b.id,eventDate:b.eventDate,event:b.event,
    a:b.a?.name,b:b.b?.name,result:b.result,status:b.status})).slice(0,4),
   note:'Needs independent date, alias, NC or native-ID reconciliation; no auto-certification.'});
 }
}
const report={schema:1,scope:'ufc-v4-next20-official-source-exception-details',asOf:src.rosterAsOf,
 sourceCommit:src.pinnedCommit,certifiedByAudit:0,missingSourceMatches:issues.length,issues,
 note:'Canonical saved cache is read-only. Date shifts beyond one day and source name aliases remain blocked until individually independently verified. Missing NCs go exclusively to existing collector for canonical recovery.'};
const dest=path.join(root,'qa/ufc-v4-next20-source-exceptions.json');
fs.mkdirSync(path.dirname(dest),{recursive:true});
fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n');
for(const issue of issues)console.log('BEFN_V4_NEXT20_SOURCE_EXCEPTION '+JSON.stringify(issue));
