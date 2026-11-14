#!/usr/bin/env node
/** Two independent full-career attestations tied to the same verified UFC native fight. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateCareerEvidence} from './ufc-36-month-stage3-progress.mjs';
import {buildPostfightMetrics} from './build-ufc-postfight-metrics.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(value,msg)=>{if(!value)throw Error('Paired UFC debut certification failed: '+msg);};
const n=x=>String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const outcome=x=>({win:'win',w:'win',loss:'loss',l:'loss',draw:'draw',d:'draw',nc:'no_contest',no_contest:'no_contest'})[String(x||'').toLowerCase()]||null;
const roster=read('data/ufc-36-month-roster-approval.json');
const candidates=read('data/ufc-36-month-candidates.json');
const register=read('data/ufc-independent-full-career-verification.json');
const research=read('data/ufcalendar-fighter-research.json');
const progress=read('data/ufcalendar-rich-progress.json');
const archive=read('data/ufc-research-archive.json');
const fight=progress.bouts?.['92965'];
assert(roster.status==='approved'&&roster.approvedFighters.length===783&&roster.rosterAsOf==='2026-11-14','immutable roster changed');
assert(fight?.org==='ufc'&&fight?.status==='completed'&&fight.eventDate==='2026-09-12'&&String(fight?.result?.winnerId)==='56135','shared official native fight not indexed with correct winner');
assert(!/(?:road to ufc|contender series|\bdwcs\b)/i.test(fight.event||''),'feeder contest cannot be certified');
const cases=[
 {slug:'sean-king',name:'Sean King',id:'56135',opponent:'Jessie Rosas',opponentId:'33379',result:'win',fighterUrl:'https://ufcstats.com/fighter-details/41523699f37d400c',officialFighterUrl:'https://www.ufc.com/athlete/sean-king-iii',stats:{sigLanded:7,sigAttempted:13,takedowns:1,controlSec:4}},
 {slug:'jessie-rosas',name:'Jessie Rosas',id:'33379',opponent:'Sean King',opponentId:'56135',result:'loss',fighterUrl:'https://ufcstats.com/fighter-details/d1026588fa65693f',officialFighterUrl:'https://www.ufc.com/athlete/jessie-rosas',stats:{sigLanded:3,sigAttempted:6,takedowns:0,controlSec:0}}
];
const measured=buildPostfightMetrics({bouts:{'92965':fight}},archive,{asOf:'2026-11-14'});
const results=[];
for(const entry of cases){
 assert(roster.approvedFighters.includes(entry.slug),'fighter absent from approved roster');
 const e=register.fighters?.[entry.slug],p=research.profiles?.[entry.slug];
 assert(e?.sourceCoverageAttested===true&&e.verificationMethod==='full_official_ufc_fight_listing_crosscheck'&&e.verifiedAt>='2026-11-14','unattested source chronology '+entry.slug);
 assert(e.fighterUrl===entry.fighterUrl&&e.officialFighterUrl===entry.officialFighterUrl&&n(e.fighterName)===n(entry.name),'wrong independently identified fighter '+entry.slug);
 assert(e.sourceSnapshot?.fightResultsBlobSha==='699c9b6cebb542bf458807563d93ed2406d8728f'&&e.sourceSnapshot?.fighterDetailsBlobSha==='7141332f0b319edbc10d006b229050ee947e7336','unpinned source snapshot');
 assert(e.sourceCoverage?.officialDatedBouts===1&&e.sourceCoverage?.grecoExactBoutRows===1&&e.sourceCoverage?.officialDebut==='2026-09-12','exhaustive debut-to-snapshot inventory not attested '+entry.slug);
 assert(e.sourceSnapshot?.cutoffLastEvent==='2026-11-07'&&typeof e.sourceCoverage?.sourcePresentationException==='string'&&e.sourceCoverage.sourcePresentationException.length>25,'incomplete historical source cutoff or unresolved official UI spelling/outcome presentation QA '+entry.slug);
 assert(n(p?.name)===n(entry.name)&&!p?.ufcHistoryIdConflicts?.length,'saved fighter identity conflicted '+entry.slug);
 const h=(p.recentHistory||[]).filter(x=>String(x.promotion||x.org||'').toLowerCase()==='ufc');
 assert(h.length===1,'extra or missing official UFC bout in saved history '+entry.slug);
 const b=e.bouts?.[0],row=h[0];
 assert(e.bouts?.length===1&&b.date==='2026-09-12'&&b.fightUrl==='https://ufcstats.com/fight-details/5a91827fe8c1dc26','wrong source fight details '+entry.slug);
 assert(b.opponent===entry.opponent&&b.result===entry.result&&String(b.nativeBoutId)==='92965'&&String(b.nativeFighterId)===entry.id,'source/native mapping wrong '+entry.slug);
 assert(row.source==='native'&&String(row.boutId)==='92965'&&row.date===b.date&&n(row.opponent)===n(entry.opponent)&&outcome(row.result)===entry.result,'incorrect cached fighter fight '+entry.slug);
 const corners=[[fight.a,fight.b],[fight.b,fight.a]].filter(([own,other])=>own&&other&&own.slug===entry.slug&&n(own.name)===n(entry.name)&&n(other.name)===n(entry.opponent));
 assert(corners.length===1&&String(corners[0][0].id)===entry.id&&String(corners[0][1].id)===entry.opponentId,'shared native corner and IDs not independently reconciled '+entry.slug);
 const obs=Object.values(measured.fighters||{}).flatMap(x=>x.recentBouts||[]).find(x=>String(x.boutId)==='92965'&&n(x.opponent)===n(entry.opponent));
 assert(obs?.cageSec===36,'missing exact measured bout time '+entry.slug);
 for(const key of ['sigLanded','sigAttempted','knockdowns','takedowns','takedownAttempts','subAttempts','controlSec'])
  assert(Number.isFinite(obs.metrics?.[key]),'missing measured '+key+' '+entry.slug);
 for(const [key,value] of Object.entries(entry.stats))
  assert(obs.metrics[key]===value,'native measured '+key+' disagreement '+entry.slug);
 const c=candidates.fighters.find(x=>x.slug===entry.slug);
 assert(c?.lastUfcFight==='2026-09-12','roster latest UFC bout not matched '+entry.slug);
 const gate=evaluateCareerEvidence(p,h,c.lastUfcFight,candidates.asOf,e,progress.bouts);
 assert(gate.independentlyVerified===true&&!gate.unresolvedIdentityConflicts,'full historical certification gate blocked '+entry.slug+': '+JSON.stringify(gate));
 results.push({slug:entry.slug,identity:entry.name,certified:true,verifiedSourceFightCount:1,nativeFightId:'92965',nativeFighterId:entry.id,verifiedOutcome:entry.result,stats:{cageSec:obs.cageSec,...entry.stats},independentGate:gate,officialSource:e.officialFighterUrl,ufcStatsSource:e.fighterUrl,sourceFightUrl:b.fightUrl});
}
assert(results.length===2&&results[0].nativeFighterId!==results[1].nativeFighterId&&results[0].nativeFightId===results[1].nativeFightId,'two mirrored fighter careers must reference one shared UFC bout, not two separate fights');
const out={schema:1,scope:'ufc-v4-paired-independent-full-career-certificates',date:'2026-11-14',status:'two_independently_certified_full_careers',certifiedFighters:2,distinctNativeFights:1,fullyMeasuredFighterBoutLinks:2,results,note:'One official UFC debut each, reciprocal single native fight, two separate source-anchored UFCStats fighter identities; official scorecard and measured round metrics verified. Source presentation differences preserved. No paid calls or production UI modification.'};
fs.mkdirSync(path.join(root,'qa'),{recursive:true});
fs.writeFileSync(path.join(root,'qa/ufc-v4-noche-sean-jessie-paired-certificates.json'),JSON.stringify(out,null,2)+'\n');
console.log('BEFN_V4_NOCHE_DEBUT_CERTIFICATIONS '+JSON.stringify(out));
