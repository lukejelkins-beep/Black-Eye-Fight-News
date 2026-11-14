#!/usr/bin/env node
/** Offline reciprocal-opponent + saved native index audit. Never links/certifies. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const norm=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const outcome=s=>({win:'win',w:'win',loss:'loss',l:'loss',draw:'draw',d:'draw',nc:'no_contest',no_contest:'no_contest'})[String(s??'').toLowerCase()]||null;
const opposite={win:'loss',loss:'win',draw:'draw',no_contest:'no_contest'};
const dayClose=(a,b)=>/^\d{4}-\d{2}-\d{2}$/.test(String(a))&&/^\d{4}-\d{2}-\d{2}$/.test(String(b))&&
 Math.abs(Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))<=86400000;
const feeder=event=>/(?:\bdwcs\b|contender\s+series|road\s+to\s+ufc)/i.test(String(event??''));
const aliasMatches=(name,expect)=>norm(name)===norm(expect)||
 // Candidate matching ONLY: Bruno Silva can mean another distinct athlete.
 (norm(expect)==='brunogustavodasilva'&&norm(name)==='brunosilva');
const validFight=(fight,source,opponent)=>fight?.org==='ufc'&&!feeder(fight.event)&&
 dayClose(fight.eventDate,source.date)&&
 [fight.a?.name,fight.b?.name].some(n=>aliasMatches(n,source.fighterName))&&
 [fight.a?.name,fight.b?.name].some(n=>norm(n)===norm(opponent));
function comparableName(a,b){return norm(a)===norm(b);}
export function auditOfficialReverseEvidence(inventory,research,progress,approval){
 if(approval?.schema!==1||approval?.scope!=='ufc-36-month-roster'||
    approval?.status!=='approved'||approval?.rosterAsOf!=='2026-11-14'||
    approval?.approvedFighters?.length!==783||
    new Set(approval.approvedFighters).size!==783||
    inventory?.scope!=='ufc-official-career-bout-inventory'||
    inventory?.rosterAsOf!==approval.rosterAsOf)throw Error('Approved same-snapshot evidence required');
 const slug='bruno-gustavo-da-silva';
 if(!approval.approvedFighters.includes(slug))throw Error('Official source athlete not approved');
 const official=inventory.fighters?.[slug];
 if(!official||!official.sourceUrl?.startsWith('https://www.ufc.com/athlete/'))
  throw Error('Missing UFC.com source identity');
 const target={...official,fighterName:official.fighterName||'Bruno Gustavo da Silva'};
 const ownHistory=(research.profiles?.[slug]?.recentHistory||[])
  .filter(h=>String(h.promotion||h.org||'').toLowerCase()==='ufc');
 const native=progress?.bouts||{};
 const profiles=research?.profiles||{};
 const rows=[];
 for(const source of target.bouts||[]){
  const sourceEvidence={...source,fighterName:target.fighterName};
  if(!outcome(source.result)||!source.date||!source.opponent)throw Error('Invalid official source bout');
  const alreadyLinked=ownHistory.some(h=>dayClose(h.date,source.date)&&comparableName(h.opponent,source.opponent)&&outcome(h.result)===outcome(source.result));
  const candidates=new Map();
  const add=(id,kind,opponentSlug,detail={})=>{
   if(!/^[1-9]\d*$/.test(String(id)))return;
   const match=native[String(id)]||null;
   const sourceDateValid=!!match&&validFight(match,sourceEvidence,source.opponent);
   const previous=candidates.get(String(id));
   const evidence={nativeFightId:String(id),foundVia:[...new Set([...(previous?.foundVia||[]),kind])],
    opponentSlug:opponentSlug||previous?.opponentSlug||null,
    indexedFightAgrees:sourceDateValid,
    event:match?.event||detail.event||null,
    nativeFighterIds:match?[String(match.a?.id||''),String(match.b?.id||'')].filter(Boolean):[],
    review:'source_matching_candidate_not_authorized_for_autolink'};
   candidates.set(String(id),evidence);
  };
  for(const [otherSlug,profile] of Object.entries(profiles)){
   if(otherSlug===slug||!comparableName(profile?.name,source.opponent))continue;
   for(const h of profile?.recentHistory||[]){
    if(String(h.promotion||h.org||'').toLowerCase()!=='ufc'||!dayClose(h.date,source.date)||
       !aliasMatches(h.opponent,target.fighterName)||
       outcome(h.result)!==opposite[outcome(source.result)])continue;
    add(h.boutId,'reciprocal_opponent_history',otherSlug,{event:h.event||h.eventName});
   }
  }
  for(const [id,fight] of Object.entries(native)){
   if(validFight(fight,sourceEvidence,source.opponent))
    add(id,'indexed_native_corner_and_event',null);
  }
  rows.push({date:source.date,opponent:source.opponent,officialResult:outcome(source.result),
   alreadyLinked,candidateCount:candidates.size,
   candidates:[...candidates.values()].sort((a,b)=>a.nativeFightId.localeCompare(b.nativeFightId))});
 }
 const unresolved=rows.filter(r=>!r.alreadyLinked);
 const savedCandidates=unresolved.filter(r=>r.candidateCount>0);
 return {schema:1,scope:'ufc-source-backed-reverse-native-evidence',rosterAsOf:approval.rosterAsOf,
  fighterSlug:slug,officialSourceUrl:target.sourceUrl,
  status:'read_only_candidates_not_native_recovery_or_career_certification',
  summary:{officialBouts:rows.length,alreadyLinkedOfficialRows:rows.length-unresolved.length,
   missingOfficialRows:unresolved.length,missingRowsWithArchivedCandidates:savedCandidates.length,
   missingRowsWithoutArchivedCandidates:unresolved.length-savedCandidates.length,
   independentlyCertifiedFullCareers:0},
  missing:unresolved,reviewNote:'Candidate native IDs require manual authoritative exact event, athlete identity, corner and result review before any collector-only recovery. Ambiguous Bruno Silva homonym is not automatically resolved; do not assign identities, overwrite raw IDs or certify.'};
}
function main(){
 const report=auditOfficialReverseEvidence(read('data/ufc-official-career-bout-inventory.json'),
  read('data/ufcalendar-fighter-research.json'),read('data/ufcalendar-rich-progress.json'),
  read('data/ufc-36-month-roster-approval.json'));
 const out=path.join(root,'qa/ufc-source-backed-reverse-native-evidence.json');
 fs.mkdirSync(path.dirname(out),{recursive:true});
 fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 console.log('BEFN_UFC_REVERSE_SOURCE_EVIDENCE='+JSON.stringify({summary:report.summary,
  candidates:report.missing.filter(x=>x.candidateCount).map(x=>({date:x.date,opponent:x.opponent,
   candidates:x.candidates}))}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
