#!/usr/bin/env node
/** Only inspect the source-vetted Park 2025 fight double-provider-native-ID case. */
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const normal=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const dayClose=(a,b)=>/^\d{4}-\d\d-\d\d$/.test(a||'')&&/^\d{4}-\d\d-\d\d$/.test(b||'')&&Math.abs(Date.parse(a)-Date.parse(b))<=86400000;
const bruno=s=>['brunosilva','brunogustavodasilva'].includes(normal(s));
const park=s=>['hyunsungpark','parkhyunsung'].includes(normal(s));
const perspective=(b)=>{
 const corners=[b?.a||{},b?.b||{}];const selected=corners.map((v,i)=>({v,i})).filter(({v})=>bruno(v.name)||park(v.name));
 const bcorner=corners.find(x=>bruno(x.name)),pcorner=corners.find(x=>park(x.name));
 const unique=selected.length===2&&!!bcorner&&!!pcorner&&bcorner!==pcorner;
 const winner=String(b?.result?.winnerId||'');
 return {unique,brunoId:String(bcorner?.id||''),parkId:String(pcorner?.id||''),
  winnerIsBruno:unique&&winner===String(bcorner.id),
  winnerIsPark:unique&&winner===String(pcorner.id),
  status:b?.status||null,event:b?.event||null,date:b?.eventDate||null,
  nativeBoutId:String(b?.id||''),titleFight:b?.titleFight===true};
};
export function auditParkDoubleNative(approval,official,source,state,research){
 if(approval?.status!=='approved'||approval?.rosterAsOf!=='2026-11-14'||
   approval?.approvedFighters?.length!==783||
   !approval.approvedFighters.includes('park-hyun-sung')||
   !approval.approvedFighters.includes('bruno-gustavo-da-silva')||
   source?.scope!=='ufc-independent-three-pilot-source-link-review'||
   source.rosterAsOf!==approval.rosterAsOf||
   official?.scope!=='ufc-official-career-bout-inventory'||
   official.rosterAsOf!==approval.rosterAsOf)throw Error('Approved source-anchored identity case required');
 const src=source.fighters?.['park-hyun-sung']?.bouts?.find(x=>
   x.date==='2025-10-18'&&normal(x.opponent)==='brunosilva'&&x.result==='loss');
 const officialPark=official.fighters?.['park-hyun-sung']?.bouts?.some(x=>
  x.date==='2025-10-18'&&normal(x.opponent)==='brunosilva'&&x.result==='loss');
 if(!src||src.fightUrl!=='https://ufcstats.com/fight-details/668a44403a130043'||!officialPark)
   throw Error('Exact independent cross-source bout link missing');
 const ids=['38150','83254'];
 const cases=ids.map(id=>{
  const b=state?.bouts?.[id],p=perspective(b);
  const parkHistory=(research.profiles?.['park-hyun-sung']?.recentHistory||[]);
  const brunoHistory=(research.profiles?.['bruno-gustavo-da-silva']?.recentHistory||[]);
  return {id,indexed:!!b,org:b?.org||null,...p,
   eventDateMatches:dayClose(b?.eventDate,'2025-10-18'),
   parkHistoryReferences:parkHistory.filter(h=>String(h.boutId)===id).map(h=>({
    date:h.date,opponent:h.opponent,result:h.result,promotion:h.promotion})),
   brunoHistoryReferences:brunoHistory.filter(h=>String(h.boutId)===id).map(h=>({
    date:h.date,opponent:h.opponent,result:h.result,promotion:h.promotion})),
   roundIndexed:state?.roundDone?.[id]!==undefined};
 });
 const equivalent=cases.length===2&&cases.every(c=>c.indexed&&c.org==='ufc'&&c.unique&&
    c.eventDateMatches&&c.status==='completed'&&c.winnerIsBruno&&
    c.parkHistoryReferences.some(h=>h.result==='loss'&&h.promotion==='ufc'));
 return {schema:1,scope:'ufc-park-exact-two-native-id-comparison',
  rosterAsOf:approval.rosterAsOf,sourceFightUrl:src.fightUrl,
  cases,matchedSameOfficialEventOpponentOutcome:equivalent,
  status:equivalent?'same_official_bout_candidate_two_native_ids_needs_chosen_canonical_link':
   'not_proven_equivalent_requires_review',
  nativeCacheChanges:0,fullCareerCertificationsIssued:0,
  note:'Never globally alias IDs, delete measured native fights, or certify from a same-name match. Different native IDs can legitimately have different corner IDs or metrics. Resolve only the exact approved dated opponent before using derived career statistics.'};
}
function main(){
 const out=auditParkDoubleNative(read('data/ufc-36-month-roster-approval.json'),
  read('data/ufc-official-career-bout-inventory.json'),
  read('data/ufc-three-pilot-source-linked-evidence.json'),
  read('data/ufcalendar-rich-progress.json'),
  read('data/ufcalendar-fighter-research.json'));
 const to=path.join(root,'qa/ufc-park-two-native-id-identity-review.json');
 fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,JSON.stringify(out,null,2)+'\n');
 console.log('BEFN_UFC_PARK_NATIVE_IDS='+JSON.stringify(out));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
