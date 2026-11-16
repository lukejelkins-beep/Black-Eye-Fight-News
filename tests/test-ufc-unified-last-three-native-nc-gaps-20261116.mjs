import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditOfficialCareerInventory} from '../scripts/ufc-36-month-stage3-progress.mjs';

const read=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url),'utf8'));
const inv=read('ufc-official-career-bout-inventory.json');
const approval=read('ufc-36-month-roster-approval.json');
const cert=read('ufc-independent-full-career-verification.json').fighters;
const native=read('ufcalendar-rich-progress.json');
const held={
 'dan-argueta':[['2023-09-23','Miles Johns','b78545b32a97ac44'],['2023-06-17','Ronnie Lawrence','9a2d3ebab827d333']],
 'victor-henry':[['2023-10-21','Javid Basharat','0d1af8c6a5793185']],
 'edgar-chairez':[['2023-09-16','Daniel Lacerda','5d3e046b6bcd49f5']]
};

test('remaining three official UFC no-contest cases retain four exact original source identities and no made-up numeric stats',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(Object.values(held).reduce((a,x)=>a+x.length,0),4);
 for(const [slug,rows] of Object.entries(held)){
  assert.ok(approval.approvedFighters.includes(slug));
  assert.equal(cert[slug],undefined,'no premature certificate '+slug);
  const entry=inv.fighters[slug];
  assert.equal(entry.status,'source_confirmed_missing_native_no_contest_not_certified');
  assert.equal(entry.bouts.length,rows.length);
  assert.equal(entry.sourceEvidence.sourceCommit,'96adace863c0a793579cc06d27d468797545607f');
  assert.equal(entry.sourceEvidence.fightResultsBlobSha,'80258ab3d9f413cad9be13fde64beb66dd0bcfa6');
  for(const [date,opp,id] of rows){
   const b=entry.bouts.find(x=>x.date===date&&x.opponent===opp);
   assert.ok(b,slug+': '+opp);
   assert.equal(b.result,'no_contest');
   assert.equal(b.independentUfcStatsFightUrl,'https://ufcstats.com/fight-details/'+id);
   assert.equal(b.nativeRecoveryStatus,'no_matching_original_ufc_native_fight_in_saved_cache');
   for(const prohibited of ['cachedNativeBoutId','nativeBoutId','nativeFighterId','roundStats','measuredRounds'])
    assert.equal(Object.hasOwn(b,prohibited),false,slug+' cannot invent '+prohibited);
  }
 }
});

test('source-only NC inventory detects all four historical original gaps while leaving strict certification blocked',()=>{
 const slugs=Object.keys(held);
 const source={...inv,fighters:Object.fromEntries(slugs.map(k=>[k,inv.fighters[k]]))};
 const result=auditOfficialCareerInventory(source,slugs,{asOf:'2026-11-14',fighters:[]},{},native.bouts);
 assert.equal(result.totalSourceBouts,4);
 assert.equal(result.sourceMissingSaved,4);
 assert.equal(result.matchedSaved,0);
 assert.equal(result.conflicts.length,0);
 assert.deepEqual(new Set(result.cases.map(x=>x.slug)),new Set(slugs));
 assert.ok(result.cases.every(x=>x.officialOutcome==='no_contest'));
 assert.ok(result.cases.every(x=>x.cachedFightCandidates.length===0));
});
