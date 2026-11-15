#!/usr/bin/env node
/** BEFN UFC V4 Ding Meng: exact native opponent alias inspection, offline research only. */
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const approval=JSON.parse(fs.readFileSync(new URL('data/ufc-36-month-roster-approval.json',root)));
const progress=JSON.parse(fs.readFileSync(new URL('data/ufcalendar-rich-progress.json',root)));
const research=JSON.parse(fs.readFileSync(new URL('data/ufcalendar-fighter-research.json',root)));
const evidence=JSON.parse(fs.readFileSync(new URL('data/ufc-unified-wave6-official-source-review-20261114.json',root)));
const expect=[
 {id:'66109',date:'2026-05-30',sourceOpponent:'Jose Souza',cachedOpponent:'Jose Henrique',sourceFightUrl:'https://ufcstats.com/fight-details/bc0b3c16246e0d1d',opponentUfc:'https://www.ufc.com/athlete/jose-souza',resultUrl:'https://www.ufc.com/news/ufc-fight-night-song-vs-figueiredo-official-judges-scorecards-macau'},
 {id:'83785',date:'2026-08-29',sourceOpponent:'Cam Nelson',cachedOpponent:'Cameron Nelson',sourceFightUrl:'https://ufcstats.com/fight-details/6cd4457edf4089f9',opponentUfc:'https://www.ufc.com/athlete/cam-nelson',resultUrl:'https://www.ufc.com/news/ufc-shanghai-official-scorecards-nurmagomedov-vs-song'}
];
if(approval.approvedFighters.length!==783||!approval.approvedFighters.includes('ding-meng'))
 throw Error('Immutable roster not approved');
if(evidence.fighters['ding-meng']?.officialUfcCareerCount!==2)
 throw Error('Strict independent official source inventory missing');
const p=research.profiles?.['ding-meng'];if(!p)throw Error('Missing native saved Ding profile');
const matches=[];
for(const item of expect){
 const rows=(p.recentHistory||[]).filter(x=>String(x.boutId)===item.id&&
  x.date===item.date&&x.opponent===item.cachedOpponent&&
  (x.result||x.outcome)==='loss'&&x.source==='native');
 if(rows.length!==1)throw Error('Missing exact cached history or alias '+item.id);
 const b=progress.bouts?.[item.id];
 if(b?.org!=='ufc'||b.status!=='completed'||b.eventDate!==item.date)
  throw Error('Native UFC bout/date/status not corroborated '+item.id);
 const corners=[[b.a,b.b],[b.b,b.a]].filter(([own,opponent])=>own&&opponent&&
  own.slug==='ding-meng'&&own.name==='Ding Meng'&&opponent.name===item.cachedOpponent);
 if(corners.length!==1)throw Error('Native original fighter corners ambiguous '+item.id);
 const [own,opponent]=corners[0];
 if(String(b.result?.winnerId)!==String(opponent.id)||!own.id||!opponent.id)
  throw Error('Native winner or numeric ID inconsistent '+item.id);
 matches.push({nativeBoutId:item.id,date:item.date,sourceOpponent:item.sourceOpponent,
  exactSavedOpponent:item.cachedOpponent,exactNativeFighterId:String(own.id),
  exactNativeOpponentId:String(opponent.id),nativeWinnerId:String(b.result.winnerId),
  nativeEvent:b.event,sourceFightUrl:item.sourceFightUrl,
  primaryOpponentIdentityUrl:item.opponentUfc,primaryOfficialResultUrl:item.resultUrl});
}
if(matches.length!==2||matches[0].exactNativeFighterId!==matches[1].exactNativeFighterId||
 new Set(matches.map(x=>x.nativeBoutId)).size!==2)
 throw Error('Nonunique fight/athlete identities');
const report={schema:1,scope:'ding-meng-exact-primary-opponent-native-identity-review',
 asOf:'2026-11-14',certificationGranted:false,paidProviderCalls:0,
 originalSavedDataUnmodified:true,matches};
fs.mkdirSync(new URL('qa/',root),{recursive:true});
fs.writeFileSync(new URL('qa/ufc-unified-ding-exact-alias-review.json',root),JSON.stringify(report,null,2)+'\n');
console.log('BEFN_DING_EXACT_NATIVE_ALIAS '+JSON.stringify(report));
