import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateCareerEvidence,auditApprovedStage3} from '../scripts/ufc-36-month-stage3-progress.mjs';
// Batch of careers certified from the full official ufc.com athlete listing
// (paged to its end) reconciled to saved UFCalendar history. One parameterised
// test replaces a bespoke file per batch.
const load=name=>JSON.parse(fs.readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const approval=load('ufc-36-month-roster-approval.json');
const census=load('ufc-36-month-candidates.json');
const profiles=load('ufcalendar-fighter-research.json').profiles;
const native=load('ufcalendar-rich-progress.json');
const proofs=load('ufc-independent-full-career-verification.json').fighters;
const feederEvidence=load('ufc-feeder-bout-evidence.json').bouts;
const BATCH=["zach-reese", "alex-perez", "mike-davis", "esteban-ribovics", "mateusz-rebecki", "mike-malott", "tracy-cortez", "luana-carolina", "brunno-ferreira", "chidi-njokuani", "dusko-todorovic", "steve-garcia", "jasmine-jasudavicius", "maycee-barber", "roman-kopylov", "andre-petroski", "chase-hooper", "drakkar-klose", "geoff-neal", "gregory-rodrigues", "mateusz-gamrot", "modestas-bukauskas", "chris-gutierrez", "daniel-rodriguez", "jalin-turner", "macy-chiasson", "mario-bautista", "muslim-salikhov", "terrance-mckinney", "alexa-grasso", "dominick-reyes", "grant-dawson", "kennedy-nzechukwu", "loopy-godinez", "raoni-barcelos", "serghei-spivac", "cory-sandhagen", "josh-emmett", "petr-yan", "ryan-spann", "cody-durden", "cody-garbrandt", "dustin-jacoby", "joaquin-buckley", "merab-dvalishvili", "ricky-simon", "ricky-simon", "alexander-hernandez", "alexandre-pantoja", "alonzo-menifield", "jack-hermansson", "julian-erosa", "max-griffin", "rose-namajunas", "tecia-pennington", "valentina-shevchenko", "brendan-allen", "kamaru-usman", "brandon-moreno", "jared-cannonier", "renato-moicano", "michael-chiesa", "randy-brown", "stephen-thompson", "tim-elliott", "jake-matthews", "beneil-dariush", "ode-osbourne", "ciryl-gane"];
const feeder=/contender series|road to ufc|\bdwcs\b/i;
const history=slug=>profiles[slug].recentHistory.filter(r=>r.source==='native'&&r.promotion==='ufc'&&r.boutId&&!feeder.test(native.bouts[r.boutId]?.event||'')&&!feederEvidence.some(e=>e.boutId===r.boutId&&e.fighterSlug===slug));
const check=(slug,x)=>evaluateCareerEvidence(profiles[slug],history(slug),
 census.fighters.find(f=>f.slug===slug).lastUfcFight,approval.rosterAsOf,x,native.bouts).independentlyVerified;
test('official-listing batch: every proof is well formed and certifies',()=>{
 assert.ok(BATCH.length>0);
 for(const slug of BATCH){
  const p=proofs[slug];
  assert.ok(approval.approvedFighters.includes(slug),slug+' is in the frozen cohort');
  assert.equal(p.certificationStandard,'ufcalendar_first',slug);
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
  assert.equal(p.sourceCoverageAttested,true,slug);
  assert.match(p.fighterUrl,/^https:\/\/www\.ufc\.com\/athlete\/[a-z0-9-]+$/,slug);
  assert.equal(p.bouts.length,history(slug).length,slug+' official count equals saved UFC count');
  assert.ok(p.bouts.every(b=>b.date<=approval.rosterAsOf),slug+' no post-cutoff bouts');
  assert.equal(check(slug,p),true,slug+' passes the Stage 3 gate');
 }
});
test('official-listing batch: omitted, duplicated, reversed and substituted bouts are rejected',()=>{
 const flip={win:'loss',loss:'win',draw:'win',no_contest:'win'};
 for(const slug of BATCH){
  const p=proofs[slug];
  assert.equal(check(slug,{...p,bouts:p.bouts.slice(1)}),false,slug+' omitted bout');
  assert.equal(check(slug,{...p,bouts:[...p.bouts,p.bouts[0]]}),false,slug+' duplicated bout');
  assert.equal(check(slug,{...p,bouts:p.bouts.map((b,i)=>i?b:{...b,result:flip[b.result]})}),false,slug+' reversed result');
  assert.equal(check(slug,{...p,bouts:p.bouts.map((b,i)=>i?b:{...b,opponent:'Somebody Else'})}),false,slug+' wrong opponent');
  assert.equal(check(slug,{...p,sourceCoverageAttested:false}),false,slug+' unattested');
  assert.equal(check(slug,{...p,fighterUrl:'https://example.com/athlete/x',officialFighterUrl:'https://example.com/athlete/x'}),false,slug+' non-ufc.com source');
 }
});
test('official-listing batch: results come from ufc.com unless the page shows no marker',()=>{
 for(const slug of BATCH)for(const b of proofs[slug].bouts){
  assert.ok(['win','loss','draw','no_contest'].includes(b.result),slug);
  if(b.resultSource)assert.equal(b.resultSource,'saved_ufcalendar_no_official_marker',slug);
 }
});

// Careers certified from the complete UFCStats fighter list, because ufc.com athlete
// pages omit real UFC fights that saved UFCalendar history has.
const USTATS=['calvin-kattar','dan-ige','lauren-murphy','edmen-shahbazyan','islam-makhachev','marvin-vettori','ion-cutelaba','court-mcgee','cody-brundage'];
test('UFCStats batch: proofs are well formed and certify',()=>{
 for(const slug of USTATS){
  const p=proofs[slug];
  assert.ok(approval.approvedFighters.includes(slug),slug);
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
  assert.equal(p.sourceCoverageAttested,true,slug);
  assert.match(p.fighterUrl,/^https:\/\/ufcstats\.com\/fighter-details\/[a-f0-9]+$/,slug);
  assert.ok(p.bouts.every(b=>/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]+$/.test(b.fightUrl)),slug);
  assert.equal(p.bouts.length,history(slug).length,slug+' count equals saved UFC count');
  assert.equal(check(slug,p),true,slug);
 }
});
test('UFCStats batch: omitted, duplicated, reversed, substituted and unattested proofs are rejected',()=>{
 const flip={win:'loss',loss:'win',draw:'win',no_contest:'win'};
 for(const slug of USTATS){
  const p=proofs[slug];
  assert.equal(check(slug,{...p,bouts:p.bouts.slice(1)}),false,slug+' omitted');
  assert.equal(check(slug,{...p,bouts:[...p.bouts,p.bouts[0]]}),false,slug+' duplicated');
  assert.equal(check(slug,{...p,bouts:p.bouts.map((b,i)=>i?b:{...b,result:flip[b.result]})}),false,slug+' reversed');
  assert.equal(check(slug,{...p,bouts:p.bouts.map((b,i)=>i?b:{...b,opponent:'Somebody Else'})}),false,slug+' opponent');
  assert.equal(check(slug,{...p,sourceCoverageAttested:false}),false,slug+' unattested');
  assert.equal(check(slug,{...p,fighterUrl:'https://example.com/fighter-details/abc'}),false,slug+' non-ufcstats');
 }
});

// Owner-approved 2026-11-17: a proof may list a no-contest or draw that UFCStats shows but saved
// UFCalendar history lacks. The bout must be flagged savedHistoryGap, be a no_contest/draw, cite
// UFCStats, and have no saved counterpart. Wins and losses are never accepted as gaps.
const GAPS=['kyle-daukaus','chris-curtis','miles-johns','magomed-ankalaev','johnny-walker','matt-schnell','michal-oleksiejczuk','marc-andre-barriault','leon-edwards','belal-muhammad','niko-price','kelvin-gastelum','kevin-holland','sean-o-malley'];
test('saved-history gap rule: proofs with no-contest/draw gaps certify',()=>{
 for(const slug of GAPS){
  const p=proofs[slug],gaps=p.bouts.filter(b=>b.savedHistoryGap);
  assert.ok(gaps.length>=1,slug+' has a flagged gap');
  assert.ok(gaps.every(b=>['no_contest','draw'].includes(b.result)),slug+' gaps are NC/draw only');
  assert.ok(gaps.every(b=>/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]+$/.test(b.fightUrl)),slug);
  assert.equal(p.bouts.length-gaps.length,history(slug).length,slug+' non-gap bouts equal saved count');
  assert.equal(check(slug,p),true,slug);
 }
});
test('saved-history gap rule: cannot be abused for wins, losses, unflagged or already-saved bouts',()=>{
 for(const slug of GAPS){
  const p=proofs[slug],gi=p.bouts.findIndex(b=>b.savedHistoryGap);
  const swap=fn=>({...p,bouts:p.bouts.map((b,i)=>i===gi?fn(b):b)});
  assert.equal(check(slug,swap(b=>({...b,result:'win'}))),false,slug+' gap as win');
  assert.equal(check(slug,swap(b=>({...b,result:'loss'}))),false,slug+' gap as loss');
  assert.equal(check(slug,swap(b=>{const {savedHistoryGap,...r}=b;return r})),false,slug+' unflagged gap');
  assert.equal(check(slug,swap(b=>({...b,fightUrl:'https://example.com/fight/abc'}))),false,slug+' non-UFCStats gap source');
  // A flag on a real saved win/loss grants nothing: it is still compared exactly, so omitting it fails.
  const saved=p.bouts.findIndex(b=>!b.savedHistoryGap);
  assert.equal(check(slug,{...p,bouts:p.bouts.filter((b,i)=>i!==saved).map(b=>b)}),false,slug+' omitted saved bout');
  assert.equal(check(slug,{...p,bouts:p.bouts.filter((b,i)=>i!==gi)}),true,slug+' gap is optional: the saved comparison is unchanged without it');
 }
});
