#!/usr/bin/env node
/** Offline difference detector ONLY; it neither grants certificates nor edits native data. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const normalize=x=>String(x??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const tokens=x=>String(x??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(':');
const match=(a,b)=>normalize(a)===normalize(b)||tokens(a)===tokens(b);
const result=x=>({w:'win',l:'loss',d:'draw',nc:'no_contest',win:'win',loss:'loss',draw:'draw',no_contest:'no_contest'})[String(x??'').toLowerCase()]||null;
const dayDiff=(a,b)=>!a||!b?999:Math.abs(Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000));
const isFeeder=x=>/contender\s+series|road\s+to\s+ufc|\bdwcs\b/i.test(String(x??''));
const isValidId=x=>/^[1-9][0-9]{0,11}$/.test(String(x??''));
const isUfc=h=>String(h.promotion||h.org||'').toLowerCase()==='ufc'&&result(h.result||h.outcome||h.status);

export function diagnoseCrossGateBlocked(reconciliation,evidence,research,progress,census,feederEvidence){
 const blocked=reconciliation?.sourceReconciliation?.importedV4Only?.blocked||[];
 const profiles=research.profiles||{},bouts=progress.bouts||{};
 const roster=new Map((census.fighters||[]).map(x=>[x.slug,x]));
 return blocked.map(item=>{
  const slug=item.slug,src=evidence.fighters?.[slug]||{},p=profiles[slug]||{};
  const findings=[],details=[];
  const add=(code,d)=>{if(!findings.includes(code))findings.push(code);if(d)details.push(d);};
  if(normalize(src.fighterName)!==normalize(p.name))
   add('profile_name_mismatch',{official:src.fighterName,provider:p.name});
  const raw=(p.recentHistory||[]).filter(isUfc).filter(h=>!h.date||h.date<=census.asOf);
  const sourceVerified=row=>(feederEvidence.bouts||[]).some(f=>
   f.fighterSlug===slug&&String(f.boutId)===String(row.boutId)&&
   f.date===row.date&&normalize(f.opponent)===normalize(row.opponent)&&
   /^https:\/\/www\.ufc\.com\//.test(String(f.sourceUrl||'')));
  const saved=raw.filter(h=>!sourceVerified(h)&&!isFeeder(bouts[String(h.boutId||'')]?.event));
  const expected=src.bouts||[], expectedIds=new Set(expected.map(x=>String(x.nativeBoutId)));
  const savedIds=new Set(saved.map(x=>String(x.boutId||'')));
  const sourceMissing=expected.filter(x=>!savedIds.has(String(x.nativeBoutId))).map(x=>({id:x.nativeBoutId,opponent:x.opponent,date:x.date}));
  const savedExtras=saved.filter(x=>!expectedIds.has(String(x.boutId||''))).map(x=>({id:x.boutId,opponent:x.opponent,date:x.date}));
  if(sourceMissing.length)add('source_ids_absent_from_eligible_saved_history',{sourceMissing});
  if(savedExtras.length)add('saved_history_not_in_full_source',{savedExtras});
  if(expected.length!==saved.length)add('official_saved_history_count_mismatch',{official:expected.length,eligibleSaved:saved.length,rawSaved:raw.length});
  if(!isValidId(src.verifiedNumericFighterIds?.[0]))add('numeric_athlete_identity_missing');
  const cited=new Set();
  for(const proof of expected){
   const id=String(proof.nativeBoutId),native=bouts[id],savedRow=saved.filter(h=>String(h.boutId||'')===id);
   if(!native){add('native_index_missing',{id});continue;}
   if(native.org!=='ufc')add('native_org_not_ufc',{id,org:native.org});
   if(isFeeder(native.event))add('stage3_title_based_feeder_exclusion',{id,event:native.event,sourceOpponent:proof.opponent});
   if(savedRow.length!==1){add('saved_id_multiplicity',{id,count:savedRow.length});continue;}
   const h=savedRow[0];
   if(dayDiff(h.date,proof.date)>1)add('source_native_date_mismatch',{id,source:proof.date,saved:h.date});
   if(result(h.result)!==result(proof.result))add('saved_result_disagrees_with_source',{id,source:proof.result,saved:h.result});
   if(!match(h.opponent,proof.opponent))add('source_saved_opponent_alias_mismatch',{id,source:proof.opponent,saved:h.opponent});
   const corners=[[native.a,native.b],[native.b,native.a]].filter(([own,other])=>own&&other&&
      String(own.id)===String(proof.nativeFighterId));
   if(corners.length!==1){add('native_fighter_id_does_not_match_corner',{id,expected:proof.nativeFighterId,corners:[native.a?.id,native.b?.id]});continue;}
   const [own,other]=corners[0];
   if(!match(own.name,src.fighterName))add('native_own_name_alias_mismatch',{id,source:src.fighterName,native:own.name});
   if(!match(other.name,proof.opponent))add('native_opponent_alias_mismatch',{id,source:proof.opponent,native:other.name,opponentNativeId:other.id});
   const nativeResult=native.status==='no_contest'?'no_contest':
     native.status==='draw'?'draw':
     String(native.result?.winnerId)===String(own.id)?'win':
     String(native.result?.winnerId)===String(other.id)?'loss':null;
   if(result(proof.result)!==nativeResult)add('native_result_disagrees_with_source',{id,source:proof.result,nativeResult});
   if(dayDiff(native.eventDate,proof.date)>1)add('event_date_disagrees_with_source',{id,source:proof.date,eventDate:native.eventDate});
   if(cited.has(proof.fightUrl))add('duplicate_source_fight_url',{id,url:proof.fightUrl});
   cited.add(proof.fightUrl);
  }
  const last=roster.get(slug)?.lastUfcFight;
  if(last&&!saved.some(h=>dayDiff(h.date,last)<=1))add('roster_last_fight_missing',{last});
  if(!findings.length)add('strict_gate_difference_not_explained_by_basic_source_id_name_checks');
  return {slug,officialSourceBouts:expected.length,savedEligibleBouts:saved.length,
    rawSavedBouts:raw.length,stage3GatePassed:false,reasonCodes:findings,details:details.slice(0,15)};
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=diagnoseCrossGateBlocked(
  read('qa/ufc-stage3-v4-reconciliation.json'),
  read('data/ufc-independent-full-career-verification.json'),
  read('data/ufcalendar-fighter-research.json'),
  read('data/ufcalendar-rich-progress.json'),
  read('data/ufc-36-month-candidates.json'),
  read('data/ufc-feeder-bout-evidence.json'));
 const qa=path.join(root,'qa');fs.mkdirSync(qa,{recursive:true});
 fs.writeFileSync(path.join(qa,'ufc-v4-stage3-blocker-diagnostics.json'),JSON.stringify({
  schema:1,scope:'ufc-v4-stage3-blocker-diagnostics',asOf:'2026-11-14',status:'research_only_not_a_certification',fighters:result
 },null,2)+'\n');
 console.log('BEFN_V4_STAGE3_BLOCKER_DIAGNOSTICS='+JSON.stringify(result));
}
