#!/usr/bin/env node
/**
 * Read-only, source-by-source certification attempt for manually verified official
 * UFC biographies. Never writes collector-owned caches or auto-certifies.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const norm=x=>String(x??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const outcome=x=>({w:'win',win:'win',l:'loss',loss:'loss',d:'draw',draw:'draw',nc:'no_contest',no_contest:'no_contest'})[String(x??'').toLowerCase()]||null;
const aliases={
 joannewood:'joannecalderwood',joannecalderwood:'joannecalderwood',
 veronicahardy:'veronicamacedo',veronicamacedo:'veronicamacedo',
 mayrabueno:'mayrabuenosilva',mayrabuenosilva:'mayrabuenosilva'
};
const key=x=>aliases[norm(x)]||norm(x);
const dayGap=(a,b)=>a&&b?Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000):999;
const boundedDate=(a,b)=>Math.abs(dayGap(a,b))<=1;
const feeder=x=>/(?:road to ufc|contender series|\bdwcs\b)/i.test(String(x||''));
function auditOne(slug,source,research,progress,postfight,approval){
 const p=research.profiles?.[slug];
 const errors=[],detail=[];
 if(!approval.approvedFighters.includes(slug))errors.push('slug_not_in_approved_roster');
 if(!p)errors.push('missing_approved_profile');
 if(p?.name&&norm(p.name)!==norm(source.fighterName))errors.push('saved_fighter_name_not_official_identity');
 const saved=(p?.recentHistory||[]).filter(x=>String(x.promotion||x.org||'').toLowerCase()==='ufc'&&outcome(x.result||x.outcome||x.status));
 const measured=new Map((postfight.fighters?.[slug]?.careerBouts||[]).map(x=>[String(x.boutId),x]));
 const assigned=new Set(),nativeIds=new Set(),nativeFighterIds=new Set();
 for(const official of source.bouts){
  const matches=saved.filter(x=>boundedDate(official.date,x.date)&&key(official.opponent)===key(x.opponent)&&outcome(official.result)===outcome(x.result||x.outcome||x.status));
  const native=matches.filter(x=>x.source==='native'&&/^\d+$/.test(String(x.boutId??'')));
  const sorted=native.length?native:matches;
  const s=sorted[0]||null;
  if(!s){errors.push('source_bout_missing_in_saved:'+official.date+':'+official.opponent);detail.push({official,status:'missing_native_history'});continue;}
  if(matches.length!==1)errors.push('nonunique_source_mapping:'+official.date+':'+official.opponent+':'+matches.length);
  assigned.add(s);
  const id=String(s.boutId||'');
  if(!/^\d+$/.test(id))errors.push('missing_numeric_native_id:'+official.date+':'+official.opponent);
  if(nativeIds.has(id))errors.push('reused_native_id:'+id);
  nativeIds.add(id);
  const b=progress.bouts?.[id]||null,observed=measured.get(id);
  if(!b||b.org!=='ufc')errors.push('native_bout_not_indexed_as_ufc:'+id);
  if(b&&feeder(b.event))errors.push('feeder_bout_in_ufc_source:'+id);
  const corners=b?[[b.a,b.b],[b.b,b.a]].filter(([own,other])=>own&&other&&(own.slug===slug||norm(own.name)===norm(source.fighterName))&&key(other.name)===key(official.opponent)):[];
  if(corners.length!==1)errors.push('native_corner_identity_ambiguous:'+id);
  const [own,other]=corners[0]||[];
  if(own?.id)nativeFighterIds.add(String(own.id));
  if(!own?.id)errors.push('numeric_fighter_identity_unverified:'+id);
  const winner=b?.result?.winnerId;
  let nativeOutcome=b?.status==='no_contest'?'no_contest':b?.status==='draw'?'draw':null;
  if(nativeOutcome===null&&winner&&own?.id&&other?.id)
    nativeOutcome=String(winner)===String(own.id)?'win':String(winner)===String(other.id)?'loss':null;
  if(nativeOutcome&&nativeOutcome!==official.result)errors.push('official_vs_native_winner_conflict:'+id);
  if(!nativeOutcome)errors.push('native_winner_not_independently_reconciled:'+id);
  if(!observed)errors.push('missing_measured_bout:'+id);
  const metricNames=['sigLanded','sigAttempted','knockdowns','takedowns','takedownAttempts','subAttempts','controlSec'];
  const lacking=metricNames.filter(f=>!Number.isFinite(observed?.metrics?.[f]));
  if(lacking.length)errors.push('missing_required_stats:'+id+':'+lacking.join(','));
  if(!Number.isFinite(observed?.cageSec)||observed.cageSec<=0)
    errors.push('missing_measured_fight_clock:'+id);
  const gap=dayGap(s.date,official.date);
  if(gap!==0&&!boundedDate(s.date,official.date))errors.push('date_not_reconciled:'+id);
  detail.push({sourceDate:official.date,savedDate:s.date,dateOffsetDays:gap,
    opponent:official.opponent,officialResult:official.result,nativeBoutId:id,
    nativeFighterId:own?.id??null,event:b?.event??null,nativeOutcome,
    sourceUrl:official.fightUrl,measured:!!observed,missingMetricNames:lacking,
    mappedSavedRowCount:matches.length});
 }
 const extras=saved.filter(x=>!source.bouts.some(o=>boundedDate(o.date,x.date)&&key(o.opponent)===key(x.opponent)&&outcome(o.result)===outcome(x.result||x.outcome||x.status)));
 if(extras.length)errors.push('saved_ufc_history_not_in_official_history:'+extras.length);
 if(nativeFighterIds.size!==1)errors.push('numeric_identity_multiple_or_missing:'+nativeFighterIds.size);
 if(source.bouts.length!==12||new Set(source.bouts.map(x=>x.fightUrl)).size!==12)errors.push('official_source_manifest_not_12_unique_fights');
 return {slug,officialSource:source.officialFighterUrl,ufcStatsFighterUrl:source.ufcStatsFighterUrl,
  independentlyListedBouts:source.bouts.length,savedUfcRows:saved.length,
  matchedSourceBouts:detail.filter(x=>x.nativeBoutId).length,
  nativeFighterIds:[...nativeFighterIds],distinctMatchedNativeFightIds:nativeIds.size,
  sourceOnly:detail.filter(x=>!x.nativeBoutId).map(x=>x.official),
  savedOnly:extras.map(x=>({date:x.date,opponent:x.opponent,result:x.result,boutId:x.boutId})),
  blockers:[...new Set(errors)],details:detail,
  passNativeAndMetricReconciliation:errors.length===0,
  independentlyCertified:false,
  note:'Official UFC athlete history and source linked UFCStats-derived fight-detail IDs crosschecked. This audit cannot itself attest full source-page coverage.'};
}
const evidence=read('data/ufc-v4-first-two-official-career-evidence.json');
const approval=read('data/ufc-36-month-roster-approval.json');
const research=read('data/ufcalendar-fighter-research.json');
const progress=read('data/ufcalendar-rich-progress.json');
const postfight=read('data/ufc-postfight-metrics.json');
const cases=Object.entries(evidence.fighters).map(([slug,source])=>auditOne(slug,source,research,progress,postfight,approval));
const report={schema:1,scope:'ufc-v4-first-two-direct-native-certification-attempt',
 asOf:evidence.asOf,sourceCoverageAttested:false,certifiedByThisAudit:0,cases};
const dest=path.join(root,'qa/ufc-v4-first-two-certification-attempt.json');
fs.mkdirSync(path.dirname(dest),{recursive:true});
fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n');
for(const c of cases){
 console.log('BEFN_V4_CERTIFICATION_ATTEMPT '+JSON.stringify({slug:c.slug,
  saved:c.savedUfcRows,source:c.independentlyListedBouts,
  matched:c.matchedSourceBouts,nativeIds:c.distinctMatchedNativeFightIds,
  fighterIds:c.nativeFighterIds,blockers:c.blockers,pass:c.passNativeAndMetricReconciliation,
  rows:c.details.map(d=>({id:d.nativeBoutId,date:d.sourceDate,saved:d.savedDate,
   offset:d.dateOffsetDays,opponent:d.opponent,result:d.officialResult,native:d.nativeOutcome,
   metric:d.measured,missing:d.missingMetricNames,event:d.event}))}));
}
