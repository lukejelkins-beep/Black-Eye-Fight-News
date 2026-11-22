import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
// Austen Lane: certified from the full official ufc.com athlete listing (6 saved UFC
// contests), plus the 2023-06-24 Tafa no contest that saved history lacks (owner-approved
// savedHistoryGap rule, 2026-11-17). His two Contender Series bouts (Jacobi 2022, Hardy 2018)
// are excluded only because his own ufc.com athlete bio lists them under the Contender Series.
const load=name=>JSON.parse(fs.readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const approval=load('ufc-36-month-roster-approval.json');
const census=load('ufc-36-month-candidates.json');
const profiles=load('ufcalendar-fighter-research.json').profiles;
const native=load('ufcalendar-rich-progress.json');
const proofs=load('ufc-independent-full-career-verification.json').fighters;
const allFeeder=load('ufc-feeder-bout-evidence.json').bouts;
const SLUG='austen-lane',URL_='https://www.ufc.com/athlete/austen-lane';
const DWCS=['83944','84089'];
const feederRe=/contender series|road to ufc|\bdwcs\b/i;
const history=(feeder=allFeeder)=>profiles[SLUG].recentHistory.filter(r=>r.source==='native'&&r.promotion==='ufc'&&r.boutId&&
 !feederRe.test(native.bouts[r.boutId]?.event||'')&&!feeder.some(e=>e.boutId===r.boutId&&e.fighterSlug===SLUG));
const check=(p,feeder)=>evaluateCareerEvidence(profiles[SLUG],history(feeder),
 census.fighters.find(f=>f.slug===SLUG).lastUfcFight,approval.rosterAsOf,p,native.bouts).independentlyVerified;
const proof=proofs[SLUG];

test('Austen Lane proof is well formed and certifies',()=>{
 assert.ok(approval.approvedFighters.includes(SLUG));
 assert.equal(proof.certificationStandard,'ufcalendar_first');
 assert.equal(proof.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
 assert.equal(proof.sourceCoverageAttested,true);
 assert.equal(proof.fighterUrl,URL_);
 assert.ok(proof.bouts.every(b=>b.date<=approval.rosterAsOf&&b.officialUfcSourceUrl===URL_));
 const gaps=proof.bouts.filter(b=>b.savedHistoryGap);
 assert.deepEqual(gaps.map(b=>[b.date,b.opponent,b.result]),[['2023-06-24','Justin Tafa','no_contest']]);
 assert.equal(proof.bouts.length-gaps.length,history().length);
 assert.equal(check(proof),true);
});

test('Austen Lane Contender Series exclusions cite his own ufc.com bio',()=>{
 const own=allFeeder.filter(e=>e.fighterSlug===SLUG);
 assert.deepEqual(own.map(e=>e.boutId).sort(),[...DWCS].sort());
 assert.ok(own.every(e=>e.sourceUrl===URL_&&/Contender Series/.test(e.event)));
 // The saved native event labels agree, so neither DWCS row is part of saved UFC history.
 for(const id of DWCS)assert.match(native.bouts[id]?.event||'',feederRe,id);
 assert.ok(history().every(r=>!DWCS.includes(r.boutId)));
 // Listing a DWCS bout in the proof as if it were a UFC contest fails.
 assert.equal(check({...proof,bouts:[...proof.bouts,{date:'2022-09-20',opponent:'Richard Jacobi',result:'win',officialUfcSourceUrl:URL_}]}),false);
});

test('Austen Lane gap cannot be abused and the rest of the career is compared exactly',()=>{
 const flip={win:'loss',loss:'win'};
 const gi=proof.bouts.findIndex(b=>b.savedHistoryGap);
 const swap=(i,fn)=>({...proof,bouts:proof.bouts.map((b,j)=>j===i?fn(b):b)});
 assert.equal(check(swap(gi,b=>({...b,result:'win'}))),false,'gap as win');
 assert.equal(check(swap(gi,b=>({...b,result:'loss'}))),false,'gap as loss');
 assert.equal(check(swap(gi,b=>{const {savedHistoryGap,...r}=b;return r;})),false,'unflagged gap');
 assert.equal(check(swap(gi,b=>({...b,officialUfcSourceUrl:'https://example.com/x'}))),false,'non-official gap source');
 assert.equal(check(swap(0,b=>({...b,result:flip[b.result]}))),false,'reversed result');
 assert.equal(check(swap(0,b=>({...b,opponent:'Somebody Else'}))),false,'wrong opponent');
 assert.equal(check({...proof,bouts:proof.bouts.filter((b,i)=>i!==0)}),false,'omitted saved bout');
 assert.equal(check({...proof,bouts:[...proof.bouts,proof.bouts[0]]}),false,'duplicated bout');
 assert.equal(check({...proof,sourceCoverageAttested:false}),false,'unattested');
 assert.equal(check({...proof,fighterUrl:'https://example.com/athlete/x',officialFighterUrl:'https://example.com/athlete/x'}),false,'non-ufc.com source');
});
