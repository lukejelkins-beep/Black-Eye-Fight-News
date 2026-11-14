import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {auditApprovedStage3,markdownReport} from '../scripts/ufc-36-month-stage3-progress.mjs';
const slugs=Array.from({length:783},(_,i)=>'fighter-'+(i+1));
const approval={schema:1,scope:'ufc-36-month-roster',status:'approved',
  approvedBy:'user',rosterAsOf:'2026-11-14',approvedFighters:slugs};
const census={schema:1,scope:'ufc',activityMonths:36,asOf:'2026-11-14',
  indexCompleteness:'36_month_event_scan_complete',
  fighters:slugs.map(slug=>({slug,eligibilityStatus:'latest_observed_mma_ufc'}))};
const progress={bouts:{},roundDone:{},status:'connected',lastCalls:35,lastRun:'2026-11-13T22:30:00Z'};
const research={profiles:{}};
const archive={fights:{}};
const history=(id,opponent,date='2015-01-01')=>({date,opponent,source:'native',
  promotion:'ufc',result:'win',boutId:String(id)});
const fight=(id,opponent)=>({id:String(id),org:'ufc',eventDate:'2015-01-01',
  a:{name:'Fighter 1'},b:{name:opponent},status:'completed'});
test('Count cached fights once globally and distinguish round statistics from result histories',()=>{
 const p={...progress,bouts:{'41':fight(41,'Opponent A'),'42':fight(42,'Opponent B')}};
 const r={profiles:{'fighter-1':{recentHistory:[
   history(41,'Opponent A'),history(41,'Opponent A'),
   history(42,'Opponent B'),history(43,'Opponent C'),
   history(44,'Opponent D'),history(45,'Opponent E')]},
   'fighter-2':{recentHistory:[history(41,'Fighter 1')]}}};
 const a={fights:{
   '2015-01-01:fighter1:opponenta':{rounds:[{round:1,a:{sigLanded:5},b:{sigLanded:3}}]},
   '2015-01-01:fighter1:opponentb':{rounds:[{round:1,a:{},b:{}}]}
 }};
 const result=auditApprovedStage3(approval,census,p,r,a);
 const s=result.summary;
 assert.equal(s.approvedFighters,783);
 assert.equal(s.profilesWithSavedUfcHistory,2);
 assert.equal(s.savedUfcHistoryRows,7);
 assert.equal(s.uniqueNativeFightIds,5);
 assert.equal(s.uniquelyIndexedNativeFightIds,2);
 assert.equal(s.uniqueNativeFightIdsAwaitingIndex,3);
 assert.equal(s.indexedFightsWithMeasuredRoundMetrics,1);
 assert.equal(s.fightersWithAtLeastFiveObservedUfcFights,1);
 assert.equal(s.fightersWithMeasuredFiveOfFive,0);
 assert.equal(s.profilesWithoutSavedUfcHistory,781);
 assert.equal(s.profilesWithAllKnownUfcBoutsIndexed,1);
 assert.equal(s.profilesWithAllKnownUfcBoutsMeasured,1);
 assert.equal(s.missingKnownFightIdsInRecentFive,3);
 assert.equal(s.missingKnownFightIdsInFightsSixToTen,0);
 assert.equal(s.missingKnownFightIdsBeyondTen,0);
 assert.equal(s.distinctIndexedFightsWithPairedSignificantStrikes,1);
 assert.equal(s.distinctIndexedFightsWithPairedControlTime,0);
 assert.equal(s.distinctIndexedFightsWithAllFivePairedCoreMetrics,0);
 assert.match(markdownReport(result),/Stage 3/);
});
test('An approved fighter that becomes ineligible is counted but never silently replaced',()=>{
 const data={...census,fighters:[
   ...census.fighters.slice(1),{slug:'new-entrant',eligibilityStatus:'latest_observed_mma_ufc'}]};
 const r=auditApprovedStage3(approval,data,progress,research,archive);
 assert.equal(r.summary.approvedNotCurrentlyEligible,1);
 assert.equal(r.summary.stillEligibleApproved,782);
 assert.equal(r.summary.newlyEligibleNotInApproval,1);
});
test('Reject unauthorised or changed census and never claim missing rounds are measured',()=>{
 assert.throws(()=>auditApprovedStage3({...approval,approvedFighters:slugs.slice(0,782)},census,progress,research,archive),/Invalid immutable/);
 assert.throws(()=>auditApprovedStage3({...approval,status:'pending_review'},census,progress,research,archive),/not approved/);
 assert.throws(()=>auditApprovedStage3(approval,{...census,indexCompleteness:'incomplete'},progress,research,archive),/Invalid cached/);
});

test('the existing paid collector reports offline Stage 3 progress without a second worker',()=>{
  const yaml=readFileSync(new URL('../.github/workflows/ufcalendar-rich-backfill.yml',import.meta.url),'utf8');
  assert.match(yaml,/name: Report verified approved Stage 3 coverage from saved data/);
  assert.match(yaml,/node scripts\/ufc-36-month-stage3-progress\.mjs/);
  assert.match(yaml,/concurrency:\n  group: befn-ufc-research-archive/);
  assert.match(yaml,/Offline Stage 3 audit unavailable; preserve newly fetched records/);
});

test('exact UFC-site verified feeder bout is excluded without event cache evidence',()=>{
 const p={...progress,bouts:{'44':fight(44,'Opponent D')}};
 const r={profiles:{'fighter-1':{recentHistory:[
   history(83940,'Jerome Rivera','2020-08-04'),
   history(44,'Opponent D')
 ]}}};
 const proof={schema:1,bouts:[{
   boutId:'83940',fighterSlug:'fighter-1',date:'2020-08-04',
   opponent:'Jerome Rivera',sourceUrl:'https://www.ufc.com/athlete/luis-rodriguez'
 }]};
 const x=auditApprovedStage3(approval,census,p,r,archive,proof).summary;
 assert.equal(x.additionalSourceVerifiedFeederHistoryRows,1);
 assert.equal(x.excludedDistinctFeederNativeFightIds,1);
 assert.equal(x.uniqueNativeFightIdsAwaitingIndex,0);
 assert.equal(x.uniqueNativeFightIds,1);
 assert.equal(r.profiles['fighter-1'].recentHistory.length,2);
 // A false or incompletely matched citation cannot drop a UFC history row.
 const invalid={schema:1,bouts:[{...proof.bouts[0],opponent:'Other Fighter'}]};
 const y=auditApprovedStage3(approval,census,p,r,archive,invalid).summary;
 assert.equal(y.uniqueNativeFightIdsAwaitingIndex,1);
 assert.equal(y.additionalSourceVerifiedFeederHistoryRows,0);
});

test('corroborated Contender Series dates are excluded only from UFC-only counts',()=>{
 const p={...progress,bouts:{
   '900':{id:'900',org:'ufc',eventDate:'2022-08-09',
      event:"Dana White's Contender Series 49",a:{name:'Opponent A'},b:{name:'Opponent B'}},
   '44':{...fight(44,'Opponent D'),event:'UFC Fight Night: Official'}
 }};
 const r={profiles:{'fighter-1':{recentHistory:[
   history(41,'Zachary Borrego','2022-08-09'),
   history(42,'Other DWCS Opponent','2022-08-09'),
   history(44,'Opponent D')
 ]}}};
 const summary=auditApprovedStage3(approval,census,p,r,archive).summary;
 assert.equal(summary.excludedFeederHistoryRowsWithCachedEventEvidence,2);
 assert.equal(summary.excludedDistinctFeederNativeFightIds,2);
 assert.equal(summary.uniqueNativeFightIds,1);
 assert.equal(summary.uniquelyIndexedNativeFightIds,1);
 assert.equal(summary.uniqueNativeFightIdsAwaitingIndex,0);
 assert.equal(summary.savedUfcHistoryRows,1);
 assert.equal(r.profiles['fighter-1'].recentHistory.length,3,
              'Read-only audit preserves professional MMA research data');
});

test('a Finale date remains eligible for UFC history and manual-review reconciliation',()=>{
 const p={...progress,bouts:{
   '990':{id:'990',org:'ufc',eventDate:'2018-11-30',
      event:'The Ultimate Fighter 28 Finale',
      a:{name:'Another Athlete'},b:{name:'Another Opponent'}}
 }};
 const r={profiles:{'fighter-1':{recentHistory:[
   history(41,'Kevin Aguilar','2018-11-30')
 ]}}};
 const summary=auditApprovedStage3(approval,census,p,r,archive).summary;
 assert.equal(summary.excludedDistinctFeederNativeFightIds,0);
 assert.equal(summary.uniqueNativeFightIdsAwaitingIndex,1);
 assert.equal(summary.manualReviewOfficialFinaleFightIds,1);
});

test('Full-career identity checks are tracked separately from full career certification',()=>{
 const p={...progress,ufcFullCareerHistoryChecks:{
   'fighter-1':{status:'checked',newUfcBoutsRecovered:2},
   'fighter-2':{status:'checked',newUfcBoutsRecovered:0},
   'fighter-3':{status:'retry',retryAfter:'2026-11-21'},
   'not-approved':{status:'checked',newUfcBoutsRecovered:1000}
 }};
 const s=auditApprovedStage3(approval,census,p,research,archive).summary;
 assert.equal(s.approvedFullCareerIdentityChecksCompleted,2);
 assert.equal(s.approvedFullCareerIdentityChecksOnRetry,1);
 assert.equal(s.approvedFullCareerIdentityChecksRecoveredUfcBouts,2);
 assert.equal(s.fullyProviderCertifiedTimelines,0);
});

test('missing UFC fight IDs are classified from saved retry evidence without any provider requests',()=>{
 const p={...progress,ufcCareerBoutChecks:{
   '43':{checkedAt:'2026-11-13',retryAfter:'2026-11-19'},
   '44':{checkedAt:'2026-11-13',status:'requires_manual_review',retryAfter:'2026-11-27',reason:'provider_identity_mismatch'},
   '45':{checkedAt:'2026-11-12',retryAfter:'2026-11-13'}
 }};
 const r={profiles:{'fighter-1':{recentHistory:[
   history(41,'Opponent A'),history(42,'Opponent B'),
   history(43,'Opponent C'),history(44,'Opponent D'),history(45,'Opponent E')
 ]}}};
 const finale={schema:1,scope:'ufc-official-finale-recovery',
   bouts:[{fightId:'44',fighterSlug:'fighter-1',date:'2015-01-01',
     opponent:'Opponent D',sourceUrl:'https://www.ufc.com/event/test-finale'}]};
 const out=auditApprovedStage3(approval,census,p,r,archive,{},finale);
 const s=out.summary;
 assert.equal(s.uniqueNativeFightIdsAwaitingIndex,5);
 assert.equal(s.missingKnownNativeIdsNotYetAttempted,2);
 assert.equal(s.missingKnownNativeIdsOnRetryCooldown,1);
 assert.equal(s.missingKnownNativeIdsFlaggedManualReview,1);
 assert.equal(s.missingKnownNativeIdsRetryEligible,1);
 assert.equal(s.missingKnownNativeIdsReadyForLookup,3);
 assert.equal(s.recentFiveMissingIdsReadyForLookup,3);
 assert.equal(out.priorityMissingIdDiagnostics.length,5);
 assert.equal(out.priorityMissingIdDiagnostics.find(x=>x.id==='44').action,'manual_review');
 assert.equal(out.priorityMissingIdDiagnostics.find(x=>x.id==='43').retryAfter,'2026-11-19');
 assert.equal(out.manualReviewCases.length,1);
 assert.equal(out.readyForLookupCases.length,3);
 assert.equal(out.manualReviewCases[0].savedReviewReason,'provider_identity_mismatch');
 assert.deepEqual(out.manualReviewCases[0].references,
   [{fighterSlug:'fighter-1',date:'2015-01-01',opponent:'Opponent D'}]);
 assert.equal(out.manualReviewCases[0].sourceVerifiedOfficialFinale,true);
 assert.equal(s.sourceVerifiedOfficialFinaleFightIdsAwaitingIndex,1);
});

test('A single metric does not imply complete statistics; all-known indexing does not certify a full career',()=>{
 const p={...progress,bouts:{'41':fight(41,'Opponent A'),'42':fight(42,'Opponent B')}};
 const r={profiles:{'fighter-1':{
   recentHistory:[history(41,'Opponent A'),history(42,'Opponent B')],
   ufcTimeline:{complete:false}},
   'fighter-2':{recentHistory:[history(41,'Fighter 1')],ufcTimeline:{complete:true}}}};
 const a={fights:{
   '2015-01-01:fighter1:opponenta':{rounds:[
     {round:1,a:{sigLanded:4,controlSec:50,knockdowns:0,subAttempts:0,takedowns:0},
              b:{sigLanded:3,controlSec:0,knockdowns:0,subAttempts:0,takedowns:0}}]},
   '2015-01-01:fighter1:opponentb':{rounds:[
     {round:1,a:{sigLanded:5},b:{sigLanded:1}}]}
 }};
 const x=auditApprovedStage3(approval,census,p,r,a).summary;
 assert.equal(x.profilesWithAllKnownUfcBoutsIndexed,2);
 assert.equal(x.profilesWithAllKnownUfcBoutsMeasured,2);
 assert.equal(x.providerCertifiedProfilesWithAllKnownBoutsIndexed,1);
 assert.equal(x.distinctIndexedFightsWithPairedSignificantStrikes,2);
 assert.equal(x.distinctIndexedFightsWithPairedControlTime,1);
 assert.equal(x.distinctIndexedFightsWithPairedSubmissionAttempts,1);
 assert.equal(x.distinctIndexedFightsWithAllFivePairedCoreMetrics,1);
 // A missing control metric cannot be conflated with an observed zero.
 assert.equal(x.distinctIndexedFightsWithPairedKnockdowns,1);
 assert.equal(x.missingKnownFightIdsInRecentFive,0);
});

test('UFCalendar DWCS exclusion evidence is unique, precisely identified and primary-sourced',()=>{
 const raw=JSON.parse(readFileSync(new URL('../data/ufc-feeder-bout-evidence.json',
                                       import.meta.url),'utf8'));
 assert.equal(raw.schema,1);
 assert.ok(raw.bouts.length>=16);
 const ids=raw.bouts.map(r=>r.boutId);
 // Both UFC fighters can have their own source-evidence record for the same fight.
 // Uniqueness applies to the precise fighter/bout/date/opponent, not the fight ID.
 const keys=raw.bouts.map(r=>[r.boutId,r.fighterSlug,r.date,r.opponent].join('|'));
 assert.equal(new Set(keys).size,keys.length,'Duplicate exact fighter/bout exclusion');
 const datesById=new Map();
 for(const row of raw.bouts){
   if(datesById.has(row.boutId))
     assert.equal(datesById.get(row.boutId),row.date,'Conflicting date for native bout ID');
   else datesById.set(row.boutId,row.date);
 }
 const added=['88222','84039','83878','88218','88200','83916','84037',
              '83838','84160','83876','88209','84138','83973'];
 for(const id of added)assert.ok(ids.includes(id),'Missing researched DWCS bout '+id);
 for(const row of raw.bouts){
   assert.match(row.boutId,/^[1-9][0-9]{0,11}$/);
   assert.match(row.fighterSlug,/^[a-z0-9][a-z0-9-]+$/);
   assert.match(row.date,/^\d{4}-\d{2}-\d{2}$/);
   assert.ok(row.opponent?.trim());
   assert.ok(row.event?.includes('Contender Series'));
   assert.ok(row.sourceUrl?.startsWith('https://www.ufc.com/'));
 }
});

test('UFC-documented Contender Series evidence covers every remaining six-to-ten exception',()=>{
 const evidence=JSON.parse(readFileSync(new URL('../data/ufc-feeder-bout-evidence.json',import.meta.url),'utf8'));
 const required=[
  ['83929','jamie-pickett','2019-06-18','Punahele Soriano'],
  ['83929','punahele-soriano','2019-06-18','Jamie Pickett'],
  ['84037','joe-pyfer','2020-08-11','Dustin Stoltzfus'],
  ['88200','phil-hawes','2017-08-01','Julian Marquez']
 ];
 for(const [boutId,fighterSlug,date,opponent] of required){
  assert.ok(evidence.bouts.some(row=>row.boutId===boutId&&
    row.fighterSlug===fighterSlug&&row.date===date&&
    row.opponent===opponent&&row.sourceUrl.startsWith('https://www.ufc.com/')),
    'Missing exact UFC-source evidence for '+fighterSlug+' versus '+opponent);
 }
});

test('Official UFC evidence protects the older-career DWCS exclusions across seasons',()=>{
 const evidence=JSON.parse(readFileSync(new URL('../data/ufc-feeder-bout-evidence.json',import.meta.url),'utf8'));
 const required=[
  ['83848','alex-perez','Kevin Gray'],
  ['83873','johnny-walker','Henrique da Silva'],
  ['83877','diego-lopes','Joanderson Brito'],
  ['83877','joanderson-brito','Diego Lopes'],
  ['83905','sean-o-malley','Alfred Khashakyan'],
  ['83916','sodiq-yusuff','Mike Davis'],
  ['83925','ode-osbourne','Armando Villarreal'],
  ['83928','brendan-allen','Aaron Jeffery'],
  ['83931','bill-algeo','Brendan Loughnane'],
  ['83938','dustin-jacoby','Ty Flores'],
  ['84005','giga-chikadze','Austin Springer'],
  ['84065','jamall-emmers','Julian Erosa'],
  ['84065','julian-erosa','Jamall Emmers'],
  ['84159','gregory-rodrigues','Jordan Williams'],
  ['88204','john-castaneda','Cheyden Leialoha'],
  ['88223','andre-muniz','Taylor Johnson']
 ];
 for(const [boutId,fighterSlug,opponent] of required){
   assert.ok(evidence.bouts.some(r=>r.boutId===boutId&&
     r.fighterSlug===fighterSlug&&r.opponent===opponent&&
     r.sourceUrl?.startsWith('https://www.ufc.com/')),
     'Missing exact UFC DWCS evidence for '+boutId+' '+fighterSlug);
 }
});

test('Two Luke Flores DWCS fights are precisely excluded despite an inconsistent recap alias',()=>{
 const evidence=JSON.parse(readFileSync(new URL('../data/ufc-feeder-bout-evidence.json',import.meta.url),'utf8'));
 for(const [id,fighter,date] of [
  ['83941','jordan-leavitt','2020-08-04'],
  ['84114','matt-frevola','2017-08-29']
 ]){
  const exact=evidence.bouts.filter(r=>r.boutId===id&&
    r.fighterSlug===fighter&&r.date===date&&r.opponent==='Luke Flores');
  assert.equal(exact.length,1,'Missing distinct fighter/date DWCS identity proof');
  assert.ok(exact[0].sourceUrl.startsWith('https://www.ufc.com/'));
  assert.match(exact[0].reviewNote,/Jose Flores/);
 }
});
