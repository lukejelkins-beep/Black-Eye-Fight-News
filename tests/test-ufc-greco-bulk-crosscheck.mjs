import test from 'node:test';
import assert from 'node:assert/strict';
import {csvRows,crosscheckGreco} from '../scripts/audit-ufc-greco-bulk-crosscheck.mjs';
const approved=Array.from({length:783},(_,i)=>'fighter-'+(i+1));
const approval={schema:1,status:'approved',rosterAsOf:'2026-11-14',approvedFighters:approved};
const events='EVENT,URL,DATE,LOCATION\nUFC Event X,http://ufcstats.com/event-details/abc,"January 01, 2025",Somewhere\n';
const results='EVENT,BOUT,OUTCOME,WEIGHTCLASS,METHOD,ROUND,TIME,TIME FORMAT,REFEREE,DETAILS,URL\n'+
 'UFC Event X,Bruno Silva vs. Opponent A,W/L,Flyweight,Decision,3,5:00,3,,,http://ufcstats.com/fight-details/1234567890abcdef\n'+
 'UFC Event X,Bruno Silva vs. Opponent B,NC/NC,Flyweight,NC,1,1:00,3,,,http://ufcstats.com/fight-details/1234567890abcdee\n'+
 'UFC Event X,Other Guy vs. Opponent C,W/L,Heavyweight,KO,1,1:00,3,,,http://ufcstats.com/fight-details/1234567890abcdea\n';
const inventory={fighters:{'fighter-1':{fighterName:'Bruno Silva',bouts:[
 {date:'2025-01-01',opponent:'Opponent A',result:'win'},
 {date:'2025-01-01',opponent:'Opponent B',result:'no_contest'}]}}};
const research={profiles:{'fighter-1':{name:'Bruno Silva',recentHistory:[{
 date:'2025-01-01',opponent:'Opponent A',promotion:'ufc',result:'win'}]}}};
const run=(overrides={})=>crosscheckGreco({events,results,approval,research,inventory,
 commit:'a'.repeat(40),...overrides});
test('robust CSV parsing preserves quoted commas and CRLF',()=>{
 const x=csvRows('A,B\r\n"Name, X","Y""Z"\r\n');
 assert.deepEqual(x,[['A','B'],['Name, X','Y"Z']]);
});
test('official priority inventory includes wins and no contests without certifying',()=>{
 const x=run();assert.equal(x.summary.sourceInventoryExactMatches,2);
 assert.equal(x.summary.sourceInventoryUnmatched,0);
 assert.equal(x.summary.certifiedFightersByThisCrosscheck,0);
 assert.equal(x.priorityCases[0].independentCareerCertified,false);
 assert.equal(x.cohortCandidates.find(a=>a.slug==='fighter-1').sourceCandidateNotSaved,1);
});
test('opponent/result matching prevents false-positive on another same-name athlete',()=>{
 const x=run({inventory:{fighters:{'fighter-1':{fighterName:'Bruno Silva',
 bouts:[{date:'2025-01-01',opponent:'Opponent A',result:'loss'}]}}}});
 assert.equal(x.summary.sourceInventoryUnmatched,1);
});
test('missing source event or improperly formatted fight url is dropped',()=>{
 const x=run({results:results.replace('1234567890abcdef','bad')});
 assert.equal(x.summary.sourceFights,2);
 assert.equal(x.summary.sourceInventoryUnmatched,1);
});
test('does not accept modified or ambiguous approved fighter roster',()=>{
 assert.throws(()=>run({approval:{...approval,approvedFighters:approved.slice(1)}}));
});
