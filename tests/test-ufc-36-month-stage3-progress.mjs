import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {auditApprovedStage3,markdownReport,evaluateCareerEvidence,auditOfficialCareerInventory} from '../scripts/ufc-36-month-stage3-progress.mjs';
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
 },ufcLegacyDateSearchChecks:{
   '45':{status:'alternative_id_manual_review',candidateId:'999',checkedAt:'2026-11-14'}
 }};
 const r={profiles:{'fighter-1':{recentHistory:[
   history(41,'Opponent A'),history(42,'Opponent B'),
   history(43,'Opponent C'),history(44,'Opponent D'),history(45,'Opponent E')
 ]}}};
 const finale={schema:1,scope:'ufc-official-finale-recovery',
   bouts:[{fightId:'44',fighterSlug:'fighter-1',date:'2015-01-01',
     opponent:'Opponent D',sourceUrl:'https://www.ufc.com/event/test-finale'}]};
 const legacy={schema:1,scope:'ufc-official-legacy-evidence',
   bouts:[{fightId:'45',fighterSlug:'fighter-1',date:'2015-01-01',
     opponent:'Opponent E',sourceUrl:'https://www.ufc.com/event/legacy'}]};
 const out=auditApprovedStage3(approval,census,p,r,archive,{},finale,legacy);
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
 assert.equal(s.sourceVerifiedOfficialLegacyFightIdsAwaitingIndex,1);
 assert.equal(out.priorityMissingIdDiagnostics.find(x=>x.id==='45').sourceVerifiedOfficialLegacy,true);
 assert.equal(s.uniqueNativeFightIdsAwaitingIndex,5,'Official source proof must not fake successful indexing');
 assert.equal(s.sourceVerifiedLegacyProviderSearchAlternativeIds,1);
 assert.equal(s.sourceVerifiedLegacyProviderSearchNotAttempted,0);
 assert.equal(s.sourceVerifiedLegacyProviderSearchExactIds,0);
 assert.equal(out.legacyProviderSearchReview[0].matchedAlternativeNativeId,'999');
 assert.equal(out.priorityMissingIdDiagnostics.find(x=>x.id==='45').legacyProviderSearchStatus,'alternative_id_manual_review');
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
 assert.equal(x.providerCertifiedProfilesWithAllKnownBoutsIndexed,0);
 assert.equal(x.legacyTimelineCompleteClaimsWithoutRetainedProof,1);
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

test('Confirmed legacy UFC source evidence never counts as provider-hydrated statistics',()=>{
 const legacy=JSON.parse(readFileSync(new URL('../data/ufc-official-legacy-evidence.json',import.meta.url),'utf8'));
 const feeder=JSON.parse(readFileSync(new URL('../data/ufc-feeder-bout-evidence.json',import.meta.url),'utf8'));
 assert.equal(legacy.schema,1);
 assert.equal(legacy.scope,'ufc-official-legacy-evidence');
 assert.equal(legacy.bouts.length,12);
 const ids=legacy.bouts.map(x=>x.fightId);
 assert.equal(new Set(ids).size,12,'Each unresolved official UFC fight identity must be distinct');
 const feederIds=new Set(feeder.bouts.map(x=>x.boutId));
 for(const row of legacy.bouts){
  assert.match(row.fightId,/^[1-9][0-9]{0,11}$/);
  assert.match(row.fighterSlug,/^[a-z0-9][a-z0-9-]+$/);
  assert.match(row.date,/^\d{4}-\d{2}-\d{2}$/);
  assert.ok(row.opponent?.trim());
  assert.match(row.event,/Ultimate Fighter/);
  assert.ok(row.sourceUrl.startsWith('https://www.ufc.com/'));
  assert.ok(!feederIds.has(row.fightId),'Official UFC fight must not be in feeder exclusion evidence');
 }
});

test('Historical cache crosswalk suggests a same-bout candidate but never certifies a missing native ID',()=>{
 const p={...progress,bouts:{
   '999':{id:'999',org:'ufc',event:'The Ultimate Fighter 21 Finale',
     eventDate:'2015-01-02',a:{name:'Fighter 1'},b:{name:'Opponent E'}}}};
 const r={profiles:{'fighter-1':{name:'Fighter 1',recentHistory:[
   history(45,'Opponent E','2015-01-01')]}}};
 const a={fights:{'2015-01-01:fighter1:opponente':{rounds:[
   {round:1,a:{sigLanded:7,controlSec:15},b:{sigLanded:4,controlSec:8}}]}}};
 const evidence={schema:1,scope:'ufc-official-legacy-evidence',bouts:[{
   fightId:'45',fighterSlug:'fighter-1',date:'2015-01-01',
   opponent:'Opponent E',sourceUrl:'https://www.ufc.com/event/test'}]};
 const output=auditApprovedStage3(approval,census,p,r,a,{}, {}, evidence);
 assert.equal(output.summary.uniqueNativeFightIdsAwaitingIndex,1);
 assert.equal(output.summary.sourceVerifiedLegacyWithMatchingCachedBout,1);
 assert.equal(output.summary.sourceVerifiedLegacyWithMatchingArchivedRounds,1);
 assert.deepEqual(output.legacyCacheCandidates[0].cachedBouts.map(x=>x.nativeId),['999']);
 assert.equal(output.legacyCacheCandidates[0].archivedRounds[0].roundRows,1);
 assert.equal(output.summary.profilesWithAllKnownUfcBoutsIndexed,0);
});

test('Final measured-round exceptions retain identity and provider retry evidence without imputing stats',()=>{
 const b=fight(42,'Opponent B');
 b.event='UFC 99';b.result={round:3};
 const p={...progress,bouts:{'42':b},
   roundDone:{'42':0},roundRetry:{'42':{
     attempts:2,checkedAt:'2026-11-14',retryAfter:'2026-11-28'}}};
 const r={profiles:{'fighter-1':{recentHistory:[history(42,'Opponent B')]}}};
 const result=auditApprovedStage3(approval,census,p,r,archive);
 const s=result.summary;
 assert.equal(s.uniquelyIndexedNativeFightIds,1);
 assert.equal(s.indexedNativeFightsWithoutConfirmedMeasuredRounds,1);
 assert.equal(s.profilesWithKnownFightRoundGaps,1);
 assert.deepEqual(result.unmeasuredIndexedEvidence,[{
   id:'42',event:'UFC 99',date:'2015-01-01',
   fighterA:'Fighter 1',fighterB:'Opponent B',
   expectedRounds:3,observedRoundRows:0,retryAttempts:2,
   retryAfter:'2026-11-28',approvedFighterSlugs:['fighter-1']
 }]);
 assert.equal(result.profilesWithKnownRoundGaps[0].slug,'fighter-1');
 assert.equal(s.fullyProviderCertifiedTimelines,0);
});

test('Provider completeness states distinguish untruncated, truncated and missing flag',()=>{
 const r={profiles:{
   'fighter-1':{ufcTimeline:{complete:true,providerTruncatedFlag:false}},
   'fighter-2':{ufcTimeline:{complete:false,providerTruncatedFlag:true}},
   'fighter-3':{ufcTimeline:{complete:false,providerTruncatedFlag:null,
     savedHistoryHasAdditionalUfcBouts:true}},
   'fighter-4':{ufcTimeline:{complete:false,
     conflictingNativeFightIds:1,missingRosterLastUfcFight:'2025-11-03'}}
 }};
 const s=auditApprovedStage3(approval,census,progress,r,archive).summary;
 assert.equal(s.fullyProviderCertifiedTimelines,0);
 assert.equal(s.independentlyVerifiedFullCareerTimelines,0);
 assert.equal(s.providerMetadataExplicitlyUntruncated,1);
 assert.equal(s.providerMetadataExplicitlyTruncated,1);
 assert.equal(s.providerMetadataFlagUnavailable,1);
 assert.equal(s.providerMetadataLegacyNotRecorded,1);
 assert.equal(s.profilesWithoutTimelineEvidence,779);
 assert.equal(s.providerTimelinesWithSavedHistoryContradictions,1);
 assert.equal(s.providerTimelinesWithNativeIdConflicts,1);
 assert.equal(s.providerTimelinesMissingLatestRosterBout,1);
});

test('Career completion proof fails closed on missing metadata, stale timing and saved contradictions',()=>{
 const h=[history(41,'Opponent A','2026-11-10')];
 const base={ufcTimeline:{complete:true,providerTruncatedFlag:false,
   observedOn:'2026-11-14',settledCount:1}};
 const yes=evaluateCareerEvidence(base,h,'2026-11-10','2026-11-14',null);
 assert.equal(yes.providerCertified,true);
 assert.equal(yes.independentlyVerified,false);
 assert.equal(yes.legacyClaim,false);
 const old=evaluateCareerEvidence({ufcTimeline:{complete:true,
   observedOn:'2026-11-14',settledCount:1}},h,'2026-11-10','2026-11-14');
 assert.equal(old.providerCertified,false);
 assert.equal(old.legacyClaim,true);
 for(const p of [
   {ufcTimeline:{...base.ufcTimeline,observedOn:'2026-11-13'}},
   {ufcTimeline:{...base.ufcTimeline,savedHistoryHasAdditionalUfcBouts:true}},
   {ufcTimeline:{...base.ufcTimeline,providerTruncatedFlag:true}},
   {...base,ufcHistoryIdConflicts:[{date:'2026-11-10'}]}
 ])assert.equal(evaluateCareerEvidence(p,h,'2026-11-10','2026-11-14').providerCertified,
   false,'Provider certification needs fresh, explicit, contradiction-free evidence');
 assert.equal(evaluateCareerEvidence(base,h,'2026-11-11','2026-11-14').providerCertified,true,
   'A one-calendar-day offset is valid when the newest saved official fight is aligned');
 assert.equal(evaluateCareerEvidence(base,h,'2026-11-11','2026-11-14').utcDateShift,true);
 assert.equal(evaluateCareerEvidence(base,h,'2026-11-12','2026-11-14').providerCertified,false,
   'A larger date gap cannot be normalized away');
 const shiftedProvider={ufcTimeline:{...base.ufcTimeline,
   missingRosterLastUfcFight:'2026-11-11'}};
 const normalized=evaluateCareerEvidence(shiftedProvider,h,'2026-11-11','2026-11-14');
 assert.equal(normalized.providerCertified,true);
 assert.equal(normalized.providerDiscrepancy,false);
 assert.equal(normalized.utcDateShift,true);
});

test('Independent full-career certification requires exact full official fight listing',()=>{
 const h=[history(41,'Opponent A','2026-11-10'),
   history(42,'Opponent B','2026-10-10')];
 const timeline={ufcTimeline:{complete:false,providerTruncatedFlag:null}};
 const evidence={sourceCoverageAttested:true,
   verificationMethod:'full_official_ufc_fight_listing_crosscheck',
   verifiedAt:'2026-11-14',
   fighterUrl:'https://ufcstats.com/fighter-details/abcdef123',
   bouts:[{date:'2026-11-10',opponent:'Opponent A',result:'win',
     fightUrl:'https://ufcstats.com/fight-details/deadbeef01'},
    {date:'2026-10-10',opponent:'Opponent B',result:'win',
     fightUrl:'https://ufcstats.com/fight-details/deadbeef02'}]};
 assert.equal(evaluateCareerEvidence(timeline,h,'2026-11-10',
   '2026-11-14',evidence).independentlyVerified,true);
 for(const modified of [
   {...evidence,bouts:evidence.bouts.slice(0,1)},
   {...evidence,sourceCoverageAttested:false},
   {...evidence,bouts:[evidence.bouts[0],{...evidence.bouts[1],opponent:'Other'}]},
   {...evidence,verifiedAt:'2026-11-13'},
   {...evidence,bouts:[evidence.bouts[0],{...evidence.bouts[0]}]},
   {...evidence,bouts:[evidence.bouts[0],{...evidence.bouts[1],fightUrl:'https://unknown.test/bout'}]}
 ])assert.equal(evaluateCareerEvidence(timeline,h,'2026-11-10',
   '2026-11-14',modified).independentlyVerified,false);
});

test('Coverage readiness and career verification are separate, exhaustive states',()=>{
 const p={...progress,bouts:{'41':fight(41,'Opponent A')}};
 const r={profiles:{'fighter-1':{recentHistory:[history(41,'Opponent A')],
   ufcTimeline:{complete:true,observedOn:'2026-11-14',settledCount:1}}}};
 const a={fights:{'2015-01-01:fighter1:opponenta':{rounds:[
   {round:1,a:{sigLanded:2},b:{sigLanded:3}}]}}};
 const out=auditApprovedStage3(approval,census,p,r,a);
 assert.equal(out.summary.profilesWithAllKnownUfcBoutsMeasured,1);
 assert.equal(out.summary.fullyProviderCertifiedTimelines,0);
 assert.equal(out.summary.legacyTimelineCompleteClaimsWithoutRetainedProof,1);
 assert.equal(out.summary.independentlyVerifiedFullCareerTimelines,0);
 assert.equal(out.summary.approvedCareersWithoutIndependentFullCareerCertification,783);
 assert.equal(out.careerVerificationDecisions.length,783);
 assert.equal(Object.values(out.summary.careerVerificationStatusCounts)
   .reduce((n,v)=>n+v,0),783);
 assert.equal(out.careerVerificationDecisions.find(x=>x.slug==='fighter-1')
   .status,'provider_history_discrepancy');
});

test('Independent UFC minimum-count evidence establishes omissions but never full career certification',()=>{
 const p={...progress,bouts:{'41':fight(41,'Opponent A')}};
 const r={profiles:{'fighter-1':{recentHistory:[history(41,'Opponent A')],
   ufcTimeline:{complete:true}}}};
 const a={fights:{'2015-01-01:fighter1:opponenta':{rounds:[
   {round:1,a:{sigLanded:2},b:{sigLanded:3}}]}}};
 const ext={schema:1,scope:'ufc-independent-full-career-verification',
   rosterAsOf:'2026-11-14',fighters:{
    'fighter-1':{scope:'minimum_count_evidence_only',
      sourceCoverageAttested:false,verifiedAt:'2026-11-14',
      fighterUrl:'https://www.ufc.com/athlete/fighter-1',
      minimumOfficialUfcBouts:4}}};
 const result=auditApprovedStage3(approval,census,p,r,a,{},{},{},ext);
 const s=result.summary;
 assert.equal(s.profilesWithAllKnownUfcBoutsIndexed,1);
 assert.equal(s.profilesWithAllKnownUfcBoutsMeasured,1);
 assert.equal(s.sourceConfirmedIncompleteCareerHistories,1);
 assert.equal(s.sourceConfirmedMinimumMissingHistoricalUfcBouts,3);
 assert.equal(s.legacyTimelineCompleteClaimsWithoutRetainedProof,1);
 assert.equal(s.independentlyVerifiedFullCareerTimelines,0);
 assert.equal(result.careerVerificationDecisions.find(x=>x.slug==='fighter-1').status,
   'official_source_confirms_missing_historical_bouts');
 ext.fighters['fighter-1'].fighterUrl='https://example.com/athlete/fighter-1';
 const invalid=auditApprovedStage3(approval,census,p,r,a,{},{},{},ext);
 assert.equal(invalid.summary.sourceConfirmedIncompleteCareerHistories,0);
});

test('Recoverable older UFC fights are detected from numeric fighter identities in cache',()=>{
 const make=(id,date,opponent,event='UFC 100')=>({
   id:String(id),org:'ufc',status:'completed',event,eventDate:date,
   a:{name:'Fighter 1',slug:'fighter-1',id:'101'},
   b:{name:opponent,slug:'other-'+id,id:String(200+Number(id))}
 });
 const p={...progress,bouts:{
   '41':make(41,'2015-01-01','Opponent A'),
   '42':make(42,'2014-06-01','Opponent B'),
   '43':make(43,'2014-05-01','Contender','Dana Whites Contender Series')
 }};
 const r={profiles:{'fighter-1':{
   name:'Fighter 1',recentHistory:[history(41,'Opponent A','2015-01-01')]
 }}};
 const out=auditApprovedStage3(approval,census,p,r,archive);
 const summary=out.summary;
 assert.equal(summary.uniquelyIndexedNativeFightIds,1);
 assert.equal(summary.uniqueNativeFightIdsAwaitingIndex,0);
 assert.equal(summary.additionalOfficialUfcFightsRecoverableFromExistingCache,1);
 assert.equal(summary.fightersWithAdditionalIndexedOfficialUfcFightsMissingFromSavedHistory,1);
 const candidate=out.cachedCareerHistoryCandidates.find(x=>x.slug==='fighter-1');
 assert.equal(candidate.numericFighterId,'101');
 assert.deepEqual(candidate.missingIndexedOfficialUfcFights.map(x=>x.id),['42']);
 assert.equal(candidate.historicalIdentityConflicts.length,0);
});

test('Full numeric fight-index search progress is distinct from complete-career certification',()=>{
 const p={...progress,ufcApprovedFullFightSearchChecks:{
   'fighter-1':{status:'checked',fighterId:'123',scannedRows:18,invalidRows:0},
   'fighter-2':{status:'partial',fighterId:'456',scannedRows:25,cursor:'page2'},
   'fighter-3':{status:'retry',fighterId:'789',scannedRows:0,retryAfter:'2026-11-21'},
   'fighter-4':{status:'manual_review',fighterId:'987',scannedRows:3,invalidRows:1},
   'fighter-5':{status:'source_depth_gap',fighterId:'111',scannedRows:25,
     officialMinimumUfcBouts:11,missingOfficialMinimumUfcBouts:9}
 }};
 const output=auditApprovedStage3(approval,census,p,research,archive);
 const s=output.summary;
 assert.equal(s.fullFightIndexSearchFightersWithAnyLedger,5);
 assert.equal(s.fullFightIndexSearchFightersChecked,1);
 assert.equal(s.fullFightIndexSearchFightersPartial,1);
 assert.equal(s.fullFightIndexSearchFightersRetry,1);
 assert.equal(s.fullFightIndexSearchFightersManualReview,1);
 assert.equal(s.fullFightIndexSearchFightersBlockedBySourceMinimum,1);
 assert.equal(s.fullFightIndexSearchFightersNotAttempted,778);
 assert.equal(s.fullFightIndexSearchProviderRowsScanned,71);
 assert.equal(s.independentlyVerifiedFullCareerTimelines,0,
   'Even paginated winner-fight searches cannot certify NC/draw historical completeness');
 assert.deepEqual(output.fullFightIndexSearchReview.map(x=>x.slug),
   ['fighter-2','fighter-3','fighter-4','fighter-5']);
 assert.equal(output.fullFightIndexSearchReview.at(-1).missingSourceConfirmedUfcBouts,9);
});

test('Official UFC career inventory identifies exact source fights absent from saved histories',()=>{
 const inventory={schema:1,scope:'ufc-official-career-bout-inventory',
   rosterAsOf:'2026-11-14',fighters:{'fighter-1':{
     fighterName:'HyunSung Park',sourceUrl:'https://www.ufc.com/athlete/hyunsung-park',
     bouts:[{date:'2025-10-18',opponent:'Bruno Silva',result:'loss'},
       {date:'2025-08-02',opponent:'Tatsuro Taira',result:'loss'},
       {date:'2025-05-17',opponent:'Carlos Hernandez',result:'win'},
       {date:'2023-02-04',opponent:'SeungGuk Choi',result:'win'}]}}};
 const c={...census,fighters:census.fighters.map(x=>
   x.slug==='fighter-1'?{...x,lastUfcFight:'2025-08-02'}:x)};
 const r={'fighter-1':{name:'HyunSung Park',recentHistory:[
   {date:'2025-10-19',opponent:'Bruno Silva',result:'loss',promotion:'ufc',
     source:'native',boutId:'100'},
   {date:'2025-05-17',opponent:'Carlos Hernandez',result:'loss',promotion:'ufc',
     source:'native',boutId:'101'}]}};
 const b={'103':{org:'ufc',eventDate:'2023-02-04',event:'UFC Fight Night',
   a:{slug:'fighter-1',name:'HyunSung Park'},b:{name:'Choi Seung-guk'}}};
 const out=auditOfficialCareerInventory(inventory,slugs,c,r,b);
 assert.equal(out.totalSourceBouts,4);
 assert.equal(out.matchedSaved,1);
 assert.equal(out.sourceMissingSaved,2);
 assert.equal(out.conflicts.length,1);
 assert.equal(out.sourceNewerThanRoster,0);
 assert.deepEqual(out.cases.map(x=>x.officialOpponent),['Tatsuro Taira','SeungGuk Choi']);
 assert.deepEqual(out.cases.at(-1).cachedFightCandidates,['103'],
   'Source opponent aliases and reversed Korean name order can map a cached exact event, not certify one');
 assert.equal(out.conflicts[0].officialOpponent,'Carlos Hernandez');
 const audit=auditApprovedStage3(approval,c,progress,{profiles:r},archive,
   {},{},{},{},inventory);
 assert.equal(audit.summary.sourceInventoryMissingSavedUfcBouts,2);
 assert.equal(audit.summary.sourceInventorySavedResultContradictions,1);
 assert.equal(audit.summary.independentlyVerifiedFullCareerTimelines,0);
});

test('Official source inventory rejects changed cohort and unverified fighter URLs',()=>{
 const inv={schema:1,scope:'ufc-official-career-bout-inventory',
   rosterAsOf:'2026-11-14',fighters:{'fighter-1':{
    fighterName:'Example Fighter',sourceUrl:'https://unverified.invalid/fighter',
    bouts:[{date:'2026-10-01',opponent:'Opponent 1',result:'win'}]}}};
 assert.equal(auditOfficialCareerInventory(inv,slugs,census,{},{}).totalSourceBouts,0);
 assert.equal(auditOfficialCareerInventory({...inv,rosterAsOf:'2026-10-01'},slugs,census,{},{}).totalSourceBouts,0);
});

test('Source-confirmed UFC recovery audit separates win/loss search and non-winner event cards',()=>{
 const p={...progress,
   ufcOfficialSourceDateChecks:{
      'athlete|2026-06-06|opponent':{status:'linked',nativeId:'101'},
      'athlete|2026-03-14|opponent':{status:'not_found',reason:'no_exact_match'},
      'athlete|2024-12-14|opponent':{status:'manual_review'},
      'athlete|2023-02-04|opponent':{status:'non_winner_api_not_applicable'},
      'athlete|2020-03-14|opponent':{status:'retry',retryAfter:'2026-11-21'}},
   ufcOfficialSourceDatePages:{
      '2026-06-06':{status:'done'},'2020-03-14':{status:'partial'}},
   ufcOfficialSourceNonWinnerChecks:{
      'athlete|2019-10-05|taha':{status:'linked',nativeId:'102'},
      'athlete|2018-01-01|other':{status:'manual_review'},
      'athlete|2017-01-01|third':{status:'not_found'},
      'athlete|2016-01-01|fourth':{status:'retry',retryAfter:'2026-11-21'}}
 };
 const out=auditApprovedStage3(approval,census,p,research,archive);
 const s=out.summary;
 assert.equal(s.sourceWinnerDateSearchLinked,1);
 assert.equal(s.sourceWinnerDateSearchNotFound,1);
 assert.equal(s.sourceWinnerDateSearchManualReview,1);
 assert.equal(s.sourceWinnerDateSearchNonWinnerExcluded,1);
 assert.equal(s.sourceWinnerDateSearchRetry,1);
 assert.equal(s.sourceWinnerDateSearchDateWindowsExhausted,1);
 assert.equal(s.sourceWinnerDateSearchDateWindowsPartial,1);
 assert.equal(s.sourceNonWinnerEventCardsLinked,1);
 assert.equal(s.sourceNonWinnerEventCardsManualReview,1);
 assert.equal(s.sourceNonWinnerEventCardsNotFound,1);
 assert.equal(s.sourceNonWinnerEventCardsRetry,1);
 assert.equal(out.officialSourceRecoveryReview.length,9);
 assert.ok(out.officialSourceRecoveryReview.every(r=>
   ['winner_date_search','nonwinner_event_card'].includes(r.type)));
 assert.equal(s.independentlyVerifiedFullCareerTimelines,0);
});

test('Independent full-career source can supersede a deficient provider timeline without hiding native identity conflicts',()=>{
 const rows=[history(41,'Opponent A','2026-11-10'),
   history(42,'Opponent B','2026-10-10')];
 const source={sourceCoverageAttested:true,
   verificationMethod:'full_official_ufc_fight_listing_crosscheck',
   verifiedAt:'2026-11-14',
   fighterUrl:'https://ufcstats.com/fighter-details/abcdef123',
   bouts:[{date:'2026-11-10',opponent:'Opponent A',result:'win',
     fightUrl:'https://ufcstats.com/fight-details/deadbeef01'},
    {date:'2026-10-10',opponent:'Opponent B',result:'win',
     fightUrl:'https://ufcstats.com/fight-details/deadbeef02'}]};
 const incompleteProvider={ufcTimeline:{complete:true,
   providerTruncatedFlag:false,observedOn:'2026-11-14',settledCount:1,
   savedHistoryHasAdditionalUfcBouts:true,
   missingRosterLastUfcFight:'2026-10-10'}};
 const decision=evaluateCareerEvidence(incompleteProvider,rows,
   '2026-10-10','2026-11-14',source);
 assert.equal(decision.rosterLatestPresent,true);
 assert.equal(decision.rosterSnapshotStale,true);
 assert.equal(decision.providerCertified,false,
   'Provider response remains incomplete even when original roster fight exists');
 assert.equal(decision.providerDiscrepancy,true);
 assert.equal(decision.independentlyVerified,true,
   'A separately verified exact full official fight listing is not disqualified by missing old provider rows');
 const collision=evaluateCareerEvidence({
   ...incompleteProvider,ufcHistoryIdConflicts:[{oldId:'11',newId:'22'}]
 },rows,'2026-10-10','2026-11-14',source);
 assert.equal(collision.independentlyVerified,false,
   'Contradictory native IDs remain a hard certification blocker');
 assert.equal(evaluateCareerEvidence(incompleteProvider,rows,
   '2026-09-01','2026-11-14',source).independentlyVerified,false,
   'An absent roster last-fight row cannot be inferred from an otherwise exact external list');
 assert.equal(evaluateCareerEvidence(incompleteProvider,rows,
   '2026-10-10','2026-11-14',
   {...source,sourceCoverageAttested:false}).independentlyVerified,false);
});

test('Roster date superseded by more recent saved UFC bout is reported separately from missing fights',()=>{
 const p={...progress,bouts:{
   '41':{...fight(41,'Opponent A'),eventDate:'2026-11-10'},
   '42':{...fight(42,'Opponent B'),eventDate:'2026-10-10'}
 }};
 const r={profiles:{'fighter-1':{
   recentHistory:[history(41,'Opponent A','2026-11-10'),
     history(42,'Opponent B','2026-10-10')],
   ufcTimeline:{complete:false,savedHistoryHasAdditionalUfcBouts:true}
 }}};
 const c={...census, fighters:census.fighters.map(row=>
   row.slug==='fighter-1'?{...row,lastUfcFight:'2026-10-10'}:row)};
 const result=auditApprovedStage3(approval,c,p,r,archive);
 assert.equal(result.summary.approvedRosterLatestDatesSuperseded,1);
 const fighter=result.careerVerificationDecisions.find(x=>x.slug==='fighter-1');
 assert.equal(fighter.approvedRosterLastFightSuperseded,true);
 assert.equal(fighter.providerHistoryDiscrepancy,true,
   'Old provider history remains separately flagged even though roster entry exists');
});

test('Full native UFC fight-index audit separates harmless exclusions from real identity conflicts',()=>{
 const p={...progress,ufcApprovedFullFightSearchChecks:{
   'fighter-1':{status:'checked',scannedRows:15,invalidRows:0,
     excludedByReason:{documented_ufc_feeder_event:2,non_winner_or_unfinished_bout:1},
     rejectedByReason:{}},
   'fighter-2':{status:'manual_review',scannedRows:17,invalidRows:1,
     rejectedByReason:{numeric_fighter_identity_disagreement:1},excludedByReason:{}},
   'fighter-3':{status:'manual_review',scannedRows:21,invalidRows:2}
 }};
 const out=auditApprovedStage3(approval,census,p,research,archive);
 const s=out.summary;
 assert.equal(s.fullFightIndexSearchFightersChecked,1);
 assert.equal(s.fullFightIndexSearchFightersManualReview,2);
 assert.equal(s.fullFightIndexSearchDocumentedFeederRowsSkipped,2);
 assert.equal(s.fullFightIndexSearchNonWinnerRowsSkipped,1);
 assert.equal(s.fullFightIndexSearchNumericIdentityConflicts,1);
 assert.equal(s.fullFightIndexSearchOlderManualCasesWithoutReason,1);
 assert.deepEqual(out.fullFightIndexSearchReview.map(row=>row.slug),
   ['fighter-2','fighter-3']);
 assert.equal(out.fullFightIndexSearchReview[0].rejectedByReason
   .numeric_fighter_identity_disagreement,1);
 assert.deepEqual(out.fullFightIndexSearchReview[1].rejectedByReason,{},
   'Legacy manual review without captured reasons stays unresolved');
 assert.equal(s.independentlyVerifiedFullCareerTimelines,0,
   'Excluding nonwinner and feeder rows never certifies an entire UFC history');
});

test('Official UFC biography cache crosswalk requires stable numeric fighter identity and result, not a name alone',()=>{
 const inventory={schema:1,scope:'ufc-official-career-bout-inventory',
   rosterAsOf:'2026-11-14',fighters:{'fighter-1':{
     fighterName:'Fighter 1',sourceUrl:'https://www.ufc.com/athlete/fighter-one',
     bouts:[
       {date:'2025-08-01',opponent:'Opponent B',result:'win'},
       {date:'2025-07-01',opponent:'Opponent C',result:'loss'}
     ]}}};
 const c={asOf:'2026-11-14',fighters:[{
   slug:'fighter-1',lastUfcFight:'2025-09-01'}]};
 const r={'fighter-1':{name:'Fighter 1',recentHistory:[{
   promotion:'ufc',source:'native',boutId:'41',date:'2025-09-01',
   opponent:'Opponent A',result:'win'}]}};
 const bouts={
   '41':{id:'41',org:'ufc',event:'UFC Fight Night',eventDate:'2025-09-01',
     status:'completed',a:{id:'500',name:'Fighter 1',slug:'fighter-1'},
     b:{id:'901',name:'Opponent A'},result:{winnerId:'500'}},
   '42':{id:'42',org:'ufc',event:'UFC Fight Night',eventDate:'2025-08-01',
     status:'completed',a:{id:'500',name:'Fighter 1',slug:'fighter-1'},
     b:{id:'902',name:'Opponent B'},result:{winnerId:'500'}},
   '43':{id:'43',org:'ufc',event:'UFC Fight Night',eventDate:'2025-07-01',
     status:'completed',a:{id:'501',name:'Fighter 1',slug:'another-fighter'},
     b:{id:'903',name:'Opponent C'},result:{winnerId:'903'}}
 };
 const a=auditOfficialCareerInventory(inventory,['fighter-1'],c,r,bouts);
 assert.equal(a.sourceMissingSaved,2);
 assert.equal(a.cacheCandidatesWithVerifiedNumericIdentity,1);
 assert.equal(a.cacheCandidatesWithVerifiedMatchingOutcome,1);
 assert.equal(a.cacheCandidatesWithConflictingNumericIdentity,1);
 assert.equal(a.cacheCandidatesWithoutUniqueNumericAnchor,0);
 const good=a.cases.find(x=>x.officialOpponent==='Opponent B');
 assert.deepEqual(good.verifiedSavedNumericFighterIds,['500']);
 assert.deepEqual(good.cachedFightCandidates,['42']);
 assert.equal(good.cachedNativeCandidateDetails[0].identityStatus,'same_verified_numeric_id');
 assert.equal(good.cachedNativeCandidateDetails[0].sourceOutcomeMatches,true);
 const wrong=a.cases.find(x=>x.officialOpponent==='Opponent C');
 assert.deepEqual(wrong.cachedFightCandidates,['43'],
   'Name/date alone can still surface a tempting but unsafe bout');
 assert.equal(wrong.cachedNativeCandidateDetails[0].identityStatus,
   'conflicts_with_saved_numeric_id');
 assert.equal(wrong.cachedNativeCandidateDetails[0].nativeFighterId,'501');
 assert.equal(wrong.cachedNativeCandidateDetails[0].sourceOutcomeMatches,true);
});


test('Carlos Hernandez complete 7-fight UFC source listing is independently tied to native corners and statistics',()=>{
 const load=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
 const register=load('ufc-independent-full-career-verification.json');
 const researchData=load('ufcalendar-fighter-research.json');
 const indexed=load('ufcalendar-rich-progress.json').bouts;
 const fighter=researchData.profiles['carlos-hernandez-7'];
 const timeline=fighter.recentHistory.filter(x=>x.promotion==='ufc');
 const evidence=register.fighters['carlos-hernandez-7'];
 assert.equal(evidence.bouts.length,7);
 assert.deepEqual(evidence.verifiedNumericFighterIds.slice().sort(),['102973','1071'].sort());
 const proof=(source,native=indexed)=>evaluateCareerEvidence(
  fighter,timeline,'2025-05-17','2026-11-14',source,native).independentlyVerified;
 assert.equal(proof(evidence),true,
  'seven complete official UFC bouts must each map to one measured native identity');
 assert.equal(proof({...evidence,sourceCoverageAttested:false}),false);
 assert.equal(proof({...evidence,bouts:evidence.bouts.slice(1)}),false);
 assert.equal(proof({...evidence,bouts:evidence.bouts.map((b,i)=>
  i?b:{...b,nativeBoutId:'999999999'})}),false);
 assert.equal(proof({...evidence,bouts:evidence.bouts.map((b,i)=>
  i?b:{...b,nativeFighterId:'1071'})}),false);
 assert.equal(proof({...evidence,bouts:evidence.bouts.map((b,i)=>
  i?b:{...b,result:'win'})}),false);
 assert.equal(proof({...evidence,bouts:evidence.bouts.map((b,i)=>
  i?b:{...b,opponent:'Unknown person'})}),false);
 assert.equal(proof(evidence,{}),false);
});


test('Bruno flyweight official twelve-bout career retains overturned UFC 243 NC and source-linked native aliases',()=>{
 const load=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
 const evidence=load('ufc-independent-full-career-verification.json').fighters['bruno-gustavo-da-silva'];
 const researchData=load('ufcalendar-fighter-research.json');
 const index=load('ufcalendar-rich-progress.json').bouts;
 const fighter=researchData.profiles['bruno-gustavo-da-silva'];
 const history=fighter.recentHistory.filter(r=>r.promotion==='ufc');
 const proof=(source,bouts=index)=>evaluateCareerEvidence(fighter,history,
  '2025-10-18','2026-11-14',source,bouts).independentlyVerified;
 assert.equal(history.length,12);
 assert.equal(evidence.bouts.length,12);
 assert.equal(proof(evidence),true);
 const nc=evidence.bouts.find(r=>r.opponent==='Khalid Taha');
 assert.equal(nc.result,'no_contest');
 assert.equal(nc.nativeBoutId,'62109');
 assert.equal(nc.fightUrl,'https://ufcstats.com/fight-details/57ff0eb2351979c4');
 assert.equal(proof({...evidence,bouts:evidence.bouts.map(r=>
  r.opponent==='Khalid Taha'?{...r,result:'loss'}:r)}),false);
 assert.equal(proof({...evidence,sourceVerifiedNativeNameAliases:[]}),false);
 assert.equal(proof({...evidence,bouts:evidence.bouts.map(r=>
  r.opponent==='Khalid Taha'?{...r,nativeFighterId:'87'}:r)}),false);
 assert.equal(proof({...evidence,bouts:evidence.bouts.slice(1)}),false);
 assert.equal(proof({...evidence,fighterUrl:'https://ufcstats.com/fighter-details/12ebd7d157e91701'}),true,
  'URL format gate alone cannot prove disambiguation; source identity must remain human attested');
 assert.equal(proof(evidence,{}),false);
});
