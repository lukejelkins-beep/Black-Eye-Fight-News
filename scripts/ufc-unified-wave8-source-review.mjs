#!/usr/bin/env node
/** One-time nonproduction research for the eighth independent wave of seven yet-uncertified UFC fighters.
 * Strictly read-only: 3 pinned public Greco CSV files and existing saved
 * UFCalendar cache; no paid API, collector changes or certification writes.
 * Independent UFC.com biography and full strict Stage3 tests remain mandatory.
 */
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const approval=JSON.parse(fs.readFileSync(new URL('data/ufc-36-month-roster-approval.json',root)));
const research=JSON.parse(fs.readFileSync(new URL('data/ufcalendar-fighter-research.json',root)));
const progress=JSON.parse(fs.readFileSync(new URL('data/ufcalendar-rich-progress.json',root)));
const prior=JSON.parse(fs.readFileSync(new URL('data/ufc-independent-full-career-verification.json',root)));
const official=JSON.parse(fs.readFileSync(new URL('data/ufc-unified-wave8-official-source-review-20261114.json',root)));
if(official.nonproduction!==true||official.certificationGranted!==false||Object.keys(official.fighters||{}).length!==7)throw Error('Wave8 evidence must be source-only');
const candidates=[
 ['gable-steveson','f7e856a73c96048e'],
 ['gianni-vazquez','51ec9dc3b4964f19'],
 ['harry-hardwick','2dbc60c52de126d8'],
 ['imanol-rodriguez','6e8349a0a0476d60'],
 ['javier-reyes','4a574b8512fc1b30'],
 ['jeisla-chaves','8061a3136026a673'],
 ['jonny-parsons','2975297f505e9447']
];
if(approval.status!=='approved'||approval.approvedFighters.length!==783||
 new Set(approval.approvedFighters).size!==783)throw Error('Immutable approved cohort required');
// This one-time pinned source extraction must never re-fetch after all seven
// athlete careers have been separately certified by the full Stage3 gate.
if(candidates.every(([slug])=>prior.fighters?.[slug]?.sourceCoverageAttested===true)){
 console.log('BEFN_WAVE8_SUMMARY '+JSON.stringify({
  status:'already_certified_source_wave',candidates:candidates.length,
  outboundRequests:0,paidUfcalendarCalls:0,certificationGrantedByThisScript:false,
  note:'Reuse canonical Stage3 certifications and latest successful strict audit; no repeated Greco download.'
 }));
 process.exit(0);
}
const pinned='c742842f29466758fedc3906dbad28d6d320a8da';
const sha={ufc_fighter_details:'7141332f0b319edbc10d006b229050ee947e7336',
 ufc_event_details:'00cee85291a014d1d65e3f638129bac0a6d50f61',
 ufc_fight_results:'699c9b6cebb542bf458807563d93ed2406d8728f'};
const base='https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/'+pinned+'/';
const norm=x=>String(x??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const outcome=x=>({w:'win',l:'loss',d:'draw',nc:'no_contest',win:'win',loss:'loss',draw:'draw',no_contest:'no_contest'})[String(x||'').toLowerCase()]||null;
const day=x=>{const d=new Date(x+' 12:00:00 GMT');return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10)};
const diff=(a,b)=>!a||!b?1000:Math.abs((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000);
function csv(str){
 const lines=[];let row=[],v='',quoted=false;
 for(let i=0;i<str.length;i++){const ch=str[i];
  if(quoted){if(ch==='"'&&str[i+1]==='"'){v+='"';i++;}else if(ch==='"')quoted=false;else v+=ch;}
  else if(ch==='"')quoted=true;
  else if(ch===','){row.push(v);v='';}
  else if(ch==='\n'){row.push(v.replace(/\r$/,''));lines.push(row);row=[];v='';}
  else v+=ch;
 }
 if(v||row.length){row.push(v);lines.push(row);}
 if(quoted)throw Error('Malformed pinned CSV');
 const [headers,...records]=lines;
 return records.filter(r=>r.length===headers.length)
  .map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])));
}
async function fetchCsv(name,limit){
 const r=await fetch(base+name+'.csv',{headers:{'user-agent':'BEFN-UFC-ReadOnly-CareerResearch/1.0'},
  redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error(name+' pinned source HTTP '+r.status);
 const buf=await r.arrayBuffer();
 if(buf.byteLength>limit)throw Error('source too large '+name);
 return csv(new TextDecoder().decode(buf));
}
const [fighters,events,results]=await Promise.all([
 fetchCsv('ufc_fighter_details',500000),
 fetchCsv('ufc_event_details',600000),
 fetchCsv('ufc_fight_results',3500000)
]);
const dateByEvent=new Map(events.map(x=>[String(x.EVENT||'').trim(),day(x.DATE)]));
console.log('BEFN_WAVE8_SOURCE_DIAG '+JSON.stringify({events:events.length,results:results.length,firstResult:results[0],firstEvent:events[0],firstFighter:fighters[0],parsedFirstDate:day(events[0]?.DATE),eventMatches:results.filter(x=>dateByEvent.get(String(x.EVENT||'').trim())).length}));
const source=results.flatMap(r=>{
 const names=String(r.BOUT||'').split(/\s+vs\.?\s+/i);
 const outs=String(r.OUTCOME||'').split('/');
 const date=dateByEvent.get(String(r.EVENT||'').trim());
 if(names.length!==2||outs.length!==2||!date||!outcome(outs[0])||!outcome(outs[1])||
  !/^https?:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/i.test(r.URL||''))return [];
 return [{date,event:String(r.EVENT||'').trim(),names:names.map(x=>x.trim()),results:outs.map(outcome),
  url:r.URL.replace(/^http:/,'https:')}];
});
if(source.length<1000)throw Error('Pinned fight result source parse unexpectedly empty or truncated');
const report={schema:1,scope:'ufc-unified-next7-source-only-review',snapshot:'2026-11-14',
 pinnedGrecoCommit:pinned,sourceBlobShas:sha,sourceEventCutoff:'2026-11-07',
 certificationGranted:false,paidUfcalendarCalls:0,rosterSize:783,fighters:{}};
for(const [slug,sourceId] of candidates){
 if(!approval.approvedFighters.includes(slug)||prior.fighters?.[slug])
  throw Error('Not an unclaimed approved candidate: '+slug);
 const p=research.profiles?.[slug];
 if(!p)throw Error('Missing cached profile '+slug);
 const candidates=fighters.filter(f=>String(f.URL||'').toLowerCase().endsWith('/'+sourceId));
 if(candidates.length!==1)throw Error('Pinned athlete id not unique: '+slug);
 const sourceName=[candidates[0].FIRST,candidates[0].LAST].filter(Boolean).join(' ');
 // Only the explicitly source-proven Nick/Nicholas identity uses an alternate
 // UFC.com athlete name here; never admit fuzzy or surname-only matching.
 const exactAthleteNames=new Set([norm(sourceName)]);
 const sameOpponent=(saved,fromGreco)=>norm(saved)===norm(fromGreco);
 const rows=source.filter(b=>b.names.some(n=>exactAthleteNames.has(norm(n))))
  .map(b=>{
   const at=b.names.findIndex(n=>exactAthleteNames.has(norm(n)));
   const other=b.names[1-at],result=b.results[at];
   const all=(p.recentHistory||[]).filter(h=>String(h.promotion||h.org||'').toLowerCase()==='ufc');
   const matches=all.filter(h=>diff(h.date,b.date)<=1&&sameOpponent(h.opponent,other)&&
     outcome(h.result||h.outcome||h.status)===result);
   const h=matches.length===1?matches[0]:null;
   const native=h&&progress.bouts?.[String(h.boutId||'')];
   const own=native&&[[native.a,native.b],[native.b,native.a]].find(([a,o])=>
    a&&o&&(a.slug===slug||norm(a.name)===norm(sourceName)||norm(a.name)===norm(p.name))&&
    sameOpponent(o.name,other));
   const officialCard=!/contender\s+series|road\s+to\s+ufc|\bdwcs\b/i.test(String(native?.event||b.event));
   return {date:b.date,opponent:other,result,event:b.event,fightUrl:b.url,
    nativeBoutId:h?String(h.boutId):null,nativeSavedDate:h?.date??null,
    savedMatches:matches.length,nativeFighterId:own?String(own[0].id):null,
    nativeOpponentId:own?String(own[1].id):null,
    nativeStatus:native?.status||null,nativeWinnerId:native?.result?.winnerId??null,
    nativeMethod:native?.result?.method??null,
    officialCard,sourceEventFeeder:/contender\s+series|road\s+to\s+ufc|\bdwcs\b/i.test(b.event)};
  }).sort((a,b)=>a.date.localeCompare(b.date));
 if(rows.length===0)throw Error('Zero pinned independent fighter source rows for '+slug);
 const raw=(p.recentHistory||[]).filter(h=>String(h.promotion||h.org||'').toLowerCase()==='ufc');
 const seen=new Set(rows.map(x=>x.nativeBoutId).filter(Boolean));
 const extra=raw.filter(x=>!seen.has(String(x.boutId))).map(x=>({
  date:x.date,opponent:x.opponent,result:x.result,nativeBoutId:String(x.boutId)}));
 const primary=official.fighters[slug];
 if(!primary||primary.pinnedGrecoFighterUrl!=='https://ufcstats.com/fighter-details/'+sourceId)
  throw Error('Missing or inconsistent independent official athlete inventory '+slug);
 const exactOfficial=rows.filter(row=>row.officialCard&&!row.sourceEventFeeder);
 const match=(a,b)=>norm(a)===norm(b);
 const narrativeDisagreements=[];
 for(const expected of primary.bouts){
  const hits=exactOfficial.filter(row=>row.date===expected.date&&match(row.opponent,expected.opponent)&&row.result===expected.result);
  if(hits.length!==1)narrativeDisagreements.push({date:expected.date,opponent:expected.opponent,expectedResult:expected.result,sourceMatches:hits.length});
 }
 if(exactOfficial.length!==primary.officialUfcCareerCount)
  narrativeDisagreements.push({reason:'official_and_pinned_source_bout_count_disagreement',official:primary.officialUfcCareerCount,pinned:exactOfficial.length});
 report.fighters[slug]={officialUfcCareerCount:primary.officialUfcCareerCount,narrativeDisagreements,sourceName,savedName:p.name,
  grecoFighterUrl:'https://ufcstats.com/fighter-details/'+sourceId,
  sourceRowCount:rows.length,savedRawUfcRows:raw.length,
  sourceUnmatched:rows.filter(x=>x.savedMatches!==1).length,
  sourceUnanchored:rows.filter(x=>!x.nativeFighterId).length,
  extraSavedHistory:extra,
  sourceNativeIds:[...new Set(rows.map(x=>x.nativeFighterId).filter(Boolean))],
  rows};
 console.log('BEFN_WAVE8_FIGHTER '+JSON.stringify({slug,...report.fighters[slug]}));
}
fs.mkdirSync(new URL('qa/',root),{recursive:true});
fs.writeFileSync(new URL('qa/ufc-unified-wave8-source-review.json',root),JSON.stringify(report,null,2)+'\n');
console.log('BEFN_WAVE8_SUMMARY '+JSON.stringify({candidates:Object.keys(report.fighters).length,
  noSourceConflicts:Object.values(report.fighters).filter(x=>x.sourceUnmatched===0&&x.sourceUnanchored===0&&x.narrativeDisagreements.length===0).length,
  zeroPaidCalls:true,pinnedGrecoCommit:pinned,
  note:'Source-only: independent official UFC.com exhaustive fight biography and strict Stage3 required before certification'}));
