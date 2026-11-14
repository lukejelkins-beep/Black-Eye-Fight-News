#!/usr/bin/env node
/** Read-only, offline native-corner evidence for the 2026-11-07 Jonny Parsons bout.
 * Prints exact cached identifiers for independently attested Souza/Henrique alias.
 * Neither edits provider cache nor grants a Stage3 certificate.
 */
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const cache=JSON.parse(readFileSync(new URL('data/ufcalendar-rich-progress.json',root),'utf8'));
const profileData=JSON.parse(readFileSync(new URL('data/ufcalendar-fighter-research.json',root),'utf8'));
const b=cache.bouts?.['93282'];
if(!b||b.org!=='ufc'||b.eventDate!=='2026-11-07'||b.status!=='completed')
  throw Error('Expected exact archived official Nov 7 native bout absent');
const sides=[b.a,b.b];if(sides.some(x=>!x?.id||!x?.name))throw Error('No exact both corners');
const own=sides.find(x=>x.slug==='jonny-parsons'||x.name==='Jonny Parsons');
const other=sides.find(x=>x!==own);
if(!own||!other||!/^jose\s+henrique(?:\s+souza)?$/i.test(other.name)||b.result?.winnerId!==other.id)
  throw Error('Unreconciled cached Parsons loser and José Henrique winner corners');
const p=profileData.profiles?.['jonny-parsons'];
const row=p?.recentHistory?.find(x=>String(x.boutId)==='93282');
if(!row||row.result!=='loss'||row.date!=='2026-11-07')throw Error('Cached Parsons native history mismatch');
console.log('BEFN_JONNY_NATIVE_ALIAS_REVIEW '+JSON.stringify({
  nativeBoutId:'93282',date:b.eventDate,event:b.event,
  own:{name:own.name,slug:own.slug,id:String(own.id)},
  opponent:{name:other.name,slug:other.slug,id:String(other.id)},
  winnerId:String(b.result.winnerId),method:b.result.method,
  savedHistoryDate:row.date,savedHistoryResult:row.result,
  primaryAliasSource:'https://www.ufc.com/athlete/jose-souza',
  primaryParsonsSource:'https://www.ufc.com/athlete/jonny-parsons',
  certificateGranted:false
}));
