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
const BATCH=["zach-reese","alex-perez","mike-davis","esteban-ribovics","mateusz-rebecki","mike-malott","tracy-cortez","luana-carolina","brunno-ferreira","chidi-njokuani","dusko-todorovic","steve-garcia","jasmine-jasudavicius","maycee-barber","roman-kopylov","andre-petroski","chase-hooper","drakkar-klose","geoff-neal","gregory-rodrigues","mateusz-gamrot","modestas-bukauskas","chris-gutierrez","daniel-rodriguez","jalin-turner","macy-chiasson","mario-bautista","muslim-salikhov","terrance-mckinney","alexa-grasso","dominick-reyes","grant-dawson","kennedy-nzechukwu","loopy-godinez","raoni-barcelos","serghei-spivac","cory-sandhagen","josh-emmett","petr-yan","ryan-spann","cody-durden","cody-garbrandt","dustin-jacoby","joaquin-buckley","merab-dvalishvili","ricky-simon","ricky-simon","alexander-hernandez","alexandre-pantoja","alonzo-menifield","jack-hermansson","julian-erosa","max-griffin","rose-namajunas","tecia-pennington","valentina-shevchenko","brendan-allen","kamaru-usman","brandon-moreno","jared-cannonier","renato-moicano","michael-chiesa","randy-brown","stephen-thompson","tim-elliott","jake-matthews","beneil-dariush"];
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
const USTATS=['calvin-kattar','dan-ige','lauren-murphy','edmen-shahbazyan','islam-makhachev','marvin-vettori','ion-cutelaba','court-mcgee'];
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
