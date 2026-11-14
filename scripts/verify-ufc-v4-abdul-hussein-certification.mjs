#!/usr/bin/env node
/** Strict, offline per-fighter full career certification; no paid provider calls or cache writes. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateCareerEvidence} from './ufc-36-month-stage3-progress.mjs';
import {buildPostfightMetrics} from './build-ufc-postfight-metrics.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const fail=(v,m)=>{if(!v)throw Error('Abdul Hussein full-career certificate rejected: '+m);};
const name=x=>String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const outcome=x=>({win:'win',w:'win',loss:'loss',l:'loss',draw:'draw',d:'draw',no_contest:'no_contest',nc:'no_contest'})[String(x||'').toLowerCase()]||null;
const slug='abdul-hussein';
const approval=read('data/ufc-36-month-roster-approval.json');
const registry=read('data/ufc-independent-full-career-verification.json');
const research=read('data/ufcalendar-fighter-research.json');
const progress=read('data/ufcalendar-rich-progress.json');
const census=read('data/ufc-36-month-candidates.json');
const archive=read('data/ufc-research-archive.json');
fail(approval.status==='approved'&&approval.approvedFighters?.length===783&&approval.approvedFighters.includes(slug)&&approval.rosterAsOf==='2026-11-14','immutable 783 fighter roster mismatch');
const e=registry.fighters?.[slug],p=research.profiles?.[slug];
fail(e?.sourceCoverageAttested===true&&e?.verificationMethod==='full_official_ufc_fight_listing_crosscheck'&&e.verifiedAt>='2026-11-14','missing independent source attestation');
fail(e?.bouts?.length===1&&e.verifiedOfficialUfcBoutCount===1,'expected one and only one source-verified completed official UFC bout');
fail(e.fighterUrl==='https://ufcstats.com/fighter-details/0e6bc8d1d6c0ad90'&&e.officialUfcFighterUrl==='https://www.ufc.com/athlete/abdul-hussein','source fighter identity mismatch');
fail(e.sourceCoverage?.ufcOfficialDatedBouts===1&&e.sourceCoverage?.grecoSourceLinkedBouts===1&&e.sourceCoverage?.ufcOfficialDebut==='2026-07-25'&&e.sourceCoverage?.nextScheduledUfcFight==='2026-12-05','independent exhaustive source scope not attested');
fail(name(p?.name)==='abdulhussein','wrong saved approved fighter identity');
const history=(p?.recentHistory||[]).filter(x=>String(x.promotion||x.org||'').toLowerCase()==='ufc');
fail(history.length===1,'unexpected additional or missing saved official UFC fight');
const b=e.bouts[0],h=history[0];
fail(b.date==='2026-07-25'&&b.opponent==='Cody Gibson'&&b.result==='win'&&b.fightUrl==='https://ufcstats.com/fight-details/532340708f0500bd','source fight or result altered');
fail(String(b.nativeFightId)==='83220'&&String(h.boutId)==='83220'&&h.date===b.date&&name(h.opponent)===name(b.opponent)&&outcome(h.result)===b.result,'source/native fight mismatch');
const native=progress.bouts?.[String(b.nativeFightId)];
fail(native?.org==='ufc'&&native?.eventDate===b.date&&native?.status==='completed'&&!/(?:road to ufc|contender series|\bdwcs\b)/i.test(native?.event||''),'missing, feeder or contradictory UFC native event');
const corners=[[native.a,native.b],[native.b,native.a]].filter(([own,other])=>own&&other&&own.slug===slug&&name(other.name)===name(b.opponent));
fail(corners.length===1,'native identity or opponent ambiguous');
const [own,other]=corners[0];
fail(String(own.id)==='13875'&&String(b.nativeFighterId)==='13875'&&String(native.result?.winnerId)==='13875'&&String(other.id)==='157','native corner IDs and official winner not confirmed');
fail(!p.ufcHistoryIdConflicts?.length,'unresolved native fighter identity conflict');
const measured=buildPostfightMetrics({bouts:{[b.nativeFightId]:native}},archive,{asOf:'2026-11-14'});
const obs=Object.values(measured.fighters||{}).flatMap(f=>f.recentBouts||[]).find(x=>String(x.boutId)==='83220'&&name(x.opponent)==='codygibson');
fail(obs&&obs.cageSec===787,'measured fight clock or round coverage mismatch');
for(const metric of ['sigLanded','sigAttempted','knockdowns','takedowns','takedownAttempts','subAttempts','controlSec'])
  fail(Number.isFinite(obs.metrics?.[metric]),'missing measured '+metric);
const c=census.fighters?.find(x=>x.slug===slug);
fail(c?.lastUfcFight==='2026-07-25','approved roster last UFC fight no longer reconciles');
const gate=evaluateCareerEvidence(p,history,c.lastUfcFight,census.asOf,e);
fail(gate.independentlyVerified===true&&!gate.unresolvedIdentityConflicts,'independent exhaustive career gate refused: '+JSON.stringify(gate));
const proof={schema:1,scope:'ufc-v4-certified-full-career-proof',slug,fighter:'Abdul Hussein',
 status:'independently_certified',rosterAsOf:'2026-11-14',sourceFighterUrl:e.fighterUrl,
 officialUfcFighterUrl:e.officialUfcFighterUrl,sourceFightUrl:b.fightUrl,
 nativeFightId:b.nativeFightId,nativeFighterId:b.nativeFighterId,verifiedUfcRecord:e.verifiedUfcRecord,
 stats:{fightSeconds:obs.cageSec,sigLanded:obs.metrics.sigLanded,sigAttempted:obs.metrics.sigAttempted,
 takedowns:obs.metrics.takedowns,controlSec:obs.metrics.controlSec},
 gate,verifiedSourceBouts:1,verifiedNativeBouts:1,fullyMeasuredBouts:1,
 note:'Independently corroborated full completed UFC history through 14 November 2026; derived UFCStats URLs verified against pinned Greco historical index and official UFC event. No direct UFCStats access claim. No collector writes.'};
fs.mkdirSync(path.join(root,'qa'),{recursive:true});
fs.writeFileSync(path.join(root,'qa/ufc-v4-abdul-hussein-certified-career.json'),JSON.stringify(proof,null,2)+'\n');
console.log('BEFN_V4_ABDUL_HUSSEIN_CERTIFICATION '+JSON.stringify(proof));
