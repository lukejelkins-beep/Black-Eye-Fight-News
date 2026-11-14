#!/usr/bin/env node
/** Strict offline PRE-CERTIFICATION evidence QA for next eight fighters.
 * Does not attest source exhaustiveness or change canonical caches.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=x=>JSON.parse(fs.readFileSync(path.join(root,x),'utf8'));
const norm=x=>String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const outcome=x=>({w:'win',win:'win',l:'loss',loss:'loss',d:'draw',draw:'draw',nc:'no_contest',no_contest:'no_contest'})[String(x||'').toLowerCase()]||null;
const iso=x=>/^\d{4}-\d\d-\d\d$/.test(String(x||''))?x:null;
const gap=(a,b)=>iso(a)&&iso(b)?Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000):999;
const req=['sigLanded','sigAttempted','knockdowns','takedowns','takedownAttempts','subAttempts','controlSec'];
const src=read('data/ufc-v4-wave3-greco-fight-links-20261114.json');
const approved=read('data/ufc-36-month-roster-approval.json');
const research=read('data/ufcalendar-fighter-research.json');
const progress=read('data/ufcalendar-rich-progress.json');
const metrics=read('data/ufc-postfight-metrics.json');
const feederEvidence=read('data/ufc-feeder-bout-evidence.json');
const cases=[];
if(approved.status!=='approved'||approved.approvedFighters.length!==783||src.rosterAsOf!==approved.rosterAsOf)throw Error('approved immutable roster mismatch');
for(const [slug,entry] of Object.entries(src.fighters)){
 if(!approved.approvedFighters.includes(slug))throw Error('unapproved '+slug);
 const profile=research.profiles?.[slug],saved=(profile?.recentHistory||[]).filter(x=>String(x.promotion||x.org||'').toLowerCase()==='ufc');
 const measured=new Map((metrics.fighters?.[slug]?.careerBouts||[]).map(x=>[String(x.boutId),x]));
 const problems=[],fId=new Set(),out=[],used=new Set();
 for(const r of entry.rows){
  const id=String(r.nativeBoutId||''),b=progress.bouts?.[id],m=measured.get(id);
  const matching=saved.filter(x=>String(x.boutId)===id&&x.date===r.nativeSavedDate&&
   norm(x.opponent)===norm(r.opponent)&&outcome(x.result||x.outcome)===r.result);
  if(matching.length!==1)problems.push('saved_identity:'+id);
  if(!b||b.org!=='ufc'||/(?:contender series|road to ufc|dwcs)/i.test(b.event||''))problems.push('competition:'+id);
  if(!b||Math.abs(gap(b.eventDate,r.date))>1)problems.push('event_date:'+id);
  const corners=b?[[b.a,b.b],[b.b,b.a]].filter(([a,o])=>a&&o&&
   (a.slug===slug||norm(a.name)===norm(profile?.name))&&norm(o.name)===norm(r.opponent)):[];
  if(corners.length!==1)problems.push('native_corner:'+id);
  const [own,opp]=corners[0]||[];
  if(own?.id)fId.add(String(own.id));
  const winner=b?.result?.winnerId;
  const nativeResult=b?.status==='no_contest'||b?.result?.method==='no_contest'?'no_contest':
   b?.status==='draw'||(!winner&&b?.result?.method==='draw')?'draw':
   winner&&String(winner)===String(own?.id)?'win':winner&&String(winner)===String(opp?.id)?'loss':null;
  if(nativeResult!==r.result)problems.push('result:'+id);
  if(!m||!Number.isFinite(m.cageSec)||m.cageSec<=0||req.some(k=>!Number.isFinite(m.metrics?.[k])))problems.push('metrics:'+id);
  if(used.has(id))problems.push('duplicate_bout:'+id);
  used.add(id);
  out.push({date:r.date,opponent:r.opponent,result:r.result,fightUrl:r.fightUrl,nativeBoutId:id,nativeSavedDate:r.nativeSavedDate,
   nativeEvent:b?.event,nativeFighterId:own?.id??null,measured:!!m,clock:m?.cageSec??null,cornerMatches:corners.length});
 }
 const extras=saved.filter(x=>!entry.rows.some(r=>r.nativeBoutId===String(x.boutId)));
 const extrasWithScope=extras.map(x=>({date:x.date,opponent:x.opponent,boutId:x.boutId,
  nativeEvent:progress.bouts?.[x.boutId]?.event??null,
  explicitFeeder:/(?:contender series|road to ufc|dwcs)/i.test(progress.bouts?.[x.boutId]?.event||'')||
   feederEvidence.bouts?.some(y=>y.fighterSlug===slug&&String(y.boutId||'')===String(x.boutId||'')&&
    y.date===x.date&&norm(y.opponent)===norm(x.opponent)&&
    /(?:contender series|road to ufc|dwcs)/i.test(y.event||'')&&
    /^https:\/\/(?:www\.)?ufc\.com\//i.test(y.sourceUrl||''))===true}));
 if(extrasWithScope.some(x=>!x.explicitFeeder))problems.push('unexplained_extra_native_history');
 if(fId.size!==1)problems.push('multiple_or_missing_numeric_fighter_ids');
 cases.push({slug,savedRows:saved.length,linkedSourceFights:out.length,
  measuredRows:out.filter(x=>x.measured).length,nativeFighterIds:[...fId],
  blockers:[...new Set(problems)],excludedFeederCandidates:extrasWithScope,
  bouts:out,sourceCoverageAttested:false,independentlyCertified:false});
 console.log('BEFN_V4_WAVE3_CANDIDATES '+JSON.stringify({slug,source:out.length,saved:saved.length,
  nativeFighterIds:[...fId],blockers:[...new Set(problems)],extra:extrasWithScope,
  offsets:out.filter(x=>x.date!==x.nativeSavedDate).map(x=>({id:x.nativeBoutId,date:x.date,saved:x.nativeSavedDate}))}));
}
const report={schema:1,scope:'ufc-v4-wave3-strict-native-evidence-audit',
 asOf:approved.rosterAsOf,sourceCommit:src.pinnedCommit,certifiedByAudit:0,cases,
 note:'Read-only native corner, outcome, competition, clock, required-metric and source link reconciliation; independent official source scope attestation still separately required.'};
const dest=path.join(root,'qa/ufc-v4-wave3-native-evidence.json');
fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n');
