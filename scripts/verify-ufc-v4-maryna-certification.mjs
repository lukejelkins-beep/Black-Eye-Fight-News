#!/usr/bin/env node
/** Strict read-only independent UFC full career certification gate. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateCareerEvidence} from './ufc-36-month-stage3-progress.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const norm=x=>String(x??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const result=x=>({w:'win',win:'win',l:'loss',loss:'loss',d:'draw',draw:'draw',nc:'no_contest',no_contest:'no_contest'})[String(x??'').toLowerCase()]||null;
const aliases={joannewood:'joannecalderwood',joannecalderwood:'joannecalderwood'};
const name=x=>aliases[norm(x)]||norm(x);
const assert=(v,message)=>{if(!v)throw Error(message);};
const approval=read('data/ufc-36-month-roster-approval.json');
const census=read('data/ufc-36-month-candidates.json');
const registry=read('data/ufc-independent-full-career-verification.json');
const research=read('data/ufcalendar-fighter-research.json');
const progress=read('data/ufcalendar-rich-progress.json');
const postfight=read('data/ufc-postfight-metrics.json');
const slug='maryna-moroz';
assert(approval.status==='approved'&&approval.approvedFighters.length===783&&
 approval.approvedFighters.includes(slug)&&approval.rosterAsOf===registry.rosterAsOf,
 'Immutable approved roster mismatch');
const e=registry.fighters?.[slug],p=research.profiles?.[slug];
assert(e?.sourceCoverageAttested===true&&e?.verificationMethod==='full_official_ufc_fight_listing_crosscheck','Source must be independently attested');
assert(e?.verifiedAt>=approval.rosterAsOf,'Evidence verified before approved snapshot');
assert(e.bouts?.length===12,'Exactly twelve distinct source-backed UFC bouts required');
assert(new Set(e.bouts.map(b=>b.fightUrl)).size===12,'Repeated UFCStats fight source URL');
assert(new Set(e.bouts.map(b=>String(b.nativeBoutId))).size===12,'Repeated native fight ID');
assert(norm(p?.name)==='marynamoroz','Source has wrong athlete identity');
const history=(p.recentHistory||[]).filter(b=>String(b.promotion||b.org||'').toLowerCase()==='ufc');
const official=history.filter(b=>result(b.result||b.outcome||b.status));
assert(official.length===12,'Extra or missing saved UFC fights; expected 12');
const measured=new Map((postfight.fighters?.[slug]?.careerBouts||[]).map(b=>[String(b.boutId),b]));
const nativeFighterIds=new Set();
const totals={official:12,nativeMatched:0,measured:0,identityVerified:0,datesMatched:0,resultsMatched:0};
for(const b of e.bouts){
 assert(/^\d{4}-\d{2}-\d{2}$/.test(b.date)&&/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/.test(b.fightUrl),'Invalid source fight URL/date');
 const row=official.filter(h=>String(h.boutId)===String(b.nativeBoutId));
 assert(row.length===1,'Missing or ambiguous native ID '+b.nativeBoutId);
 const h=row[0];
 assert(h.date===b.date,'Unverified date offset in '+b.nativeBoutId);
 assert(name(h.opponent)===name(b.opponent)&&result(h.result||h.outcome||h.status)===b.result,'Official bout identity or outcome mismatch '+b.nativeBoutId);
 const native=progress.bouts?.[b.nativeBoutId];
 assert(native?.org==='ufc'&&!/(contender series|road to ufc|\bdwcs\b)/i.test(String(native.event||'')),'Feeder/unindexed native fight '+b.nativeBoutId);
 const corners=[[native.a,native.b],[native.b,native.a]].filter(([self,other])=>self&&other&&(self.slug===slug||norm(self.name)==='marynamoroz')&&name(other.name)===name(b.opponent));
 assert(corners.length===1,'Native fighter identity collision '+b.nativeBoutId);
 const [self,other]=corners[0];
 assert(/^[1-9]\d*$/.test(String(self.id)),'Missing official numeric identity '+b.nativeBoutId);
 nativeFighterIds.add(String(self.id));
 assert(native.status==='completed'&&native.result?.winnerId!=null,'Missing resolved native winner '+b.nativeBoutId);
 const actual=String(native.result.winnerId)===String(self.id)?'win':String(native.result.winnerId)===String(other.id)?'loss':null;
 assert(actual===b.result,'Native winner differs from official result '+b.nativeBoutId);
 const metrics=measured.get(String(b.nativeBoutId));
 assert(metrics&&Number.isFinite(metrics.cageSec)&&metrics.cageSec>0,'Unmeasured fight '+b.nativeBoutId);
 for(const stat of ['sigLanded','sigAttempted','knockdowns','takedowns','takedownAttempts','subAttempts','controlSec'])
  assert(Number.isFinite(metrics.metrics?.[stat]),'Missing '+stat+' for native UFC fight '+b.nativeBoutId);
 totals.nativeMatched++;totals.measured++;totals.identityVerified++;totals.datesMatched++;totals.resultsMatched++;
}
assert(nativeFighterIds.size===1&&nativeFighterIds.has('1113'),'Native athlete identity not uniquely verified');
assert(history.every(h=>e.bouts.some(b=>String(h.boutId)===String(b.nativeBoutId))),'Unreviewed saved history outside source inventory');
const rosterCensus=census.fighters.find(f=>f.slug===slug);
const gate=evaluateCareerEvidence(p,history,rosterCensus?.lastUfcFight,census.asOf,e);
assert(gate.independentlyVerified===true,'Strict independent career evidence gate did not pass: '+JSON.stringify(gate));
assert(gate.unresolvedIdentityConflicts===false,'Unresolved native fighter identity conflicts');
const out={schema:1,scope:'ufc-v4-certified-full-career-proof',slug,status:'independently_certified',
 verifiedAt:e.verifiedAt,primarySource:e.officialFighterUrl,independentFighterSource:e.fighterUrl,
 officialCareerBouts:e.bouts.length,nativeFighterId:[...nativeFighterIds][0],
 nativeFightIds:e.bouts.map(x=>x.nativeBoutId),totals,gate,
 note:'Strict source-linked identity, chronology, result and measured-fight verification passed for all bouts. No provider or production data changed.'};
fs.mkdirSync(path.join(root,'qa'),{recursive:true});
fs.writeFileSync(path.join(root,'qa/ufc-v4-maryna-certified-career.json'),JSON.stringify(out,null,2)+'\n');
console.log('BEFN_V4_FIRST_CERTIFIED '+JSON.stringify(out));
