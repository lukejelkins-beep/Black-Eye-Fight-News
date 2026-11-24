import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const load=name=>JSON.parse(fs.readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const approval=load('ufc-36-month-roster-approval.json');
const census=load('ufc-36-month-candidates.json');
const profiles=load('ufcalendar-fighter-research.json').profiles;
const native=load('ufcalendar-rich-progress.json');
const archive=load('ufc-research-archive.json');
const proofs=load('ufc-independent-full-career-verification.json').fighters;
const slug='wang-cong',p=proofs[slug];
const normal=v=>String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const archiveKey=(date,a,b)=>date+':'+[normal(a),normal(b)].sort().join(':');
const history=()=>profiles[slug].recentHistory.filter(r=>r.source==='native'&&r.promotion==='ufc'&&r.boutId&&
 !/contender series|road to ufc|\\bdwcs\\b/i.test(native.bouts[r.boutId]?.event||''));
const check=x=>evaluateCareerEvidence(profiles[slug],history(),
 census.fighters.find(f=>f.slug===slug).lastUfcFight,approval.rosterAsOf,x,native.bouts).independentlyVerified;
test('Wave94: Wang Cong seven distinct official UFC fights have source-native identities and positive measured rounds',()=>{
 assert.ok(approval.approvedFighters.includes(slug));
 assert.equal(profiles[slug].name,'Wang Cong');
 assert.equal(p.officialUfcCareerBoutCount,7);
 assert.equal(p.bouts.length,7);
 assert.equal(history().length,7);
 assert.deepEqual(p.verifiedNumericFighterIds,['500']);
 assert.equal(p.sourceCoverageAttested,true);
 assert.equal(p.scope,'complete_official_ufc_career');
 assert.equal(p.sourceSnapshot.fightResultsBlobSha,'80258ab3d9f413cad9be13fde64beb66dd0bcfa6');
 assert.equal(p.fighterUrl,'https://ufcstats.com/fighter-details/2997e7fe3c9d3d4a');
 const source=new Set(),ids=new Set();
 for(const b of p.bouts){
  assert.ok(b.fightUrl.startsWith('https://ufcstats.com/fight-details/') && /^[a-f0-9]{16}$/.test(b.fightUrl.split('/').at(-1)),'pinned independent UFCStats bout URL');
  assert.ok(!source.has(b.fightUrl));source.add(b.fightUrl);
  assert.ok(!ids.has(b.nativeBoutId));ids.add(b.nativeBoutId);
  assert.equal(b.nativeFighterId,'500');
  const original=native.bouts[b.nativeBoutId];
  assert.equal(original?.org,'ufc');
  assert.ok(['completed','no_contest','draw'].includes(original.status));
  assert.ok(Number(native.roundDone[b.nativeBoutId])>0);
  assert.ok(Math.abs(Date.parse(original.eventDate)-Date.parse(b.date))<=86400000);
  const own=original.a?.id==='500'?original.a:original.b?.id==='500'?original.b:null;
  assert.ok(own,'exact native fighter corner');
  const other=own===original.a?original.b:original.a;
  assert.equal(other.name,b.opponent);
  const result=original.result?.winnerId===own.id?'win':
     original.result?.winnerId===other.id?'loss':null;
  assert.equal(b.result,result,'official result');
  const row=archive.fights[archiveKey(original.eventDate,original.a.name,original.b.name)];
  assert.ok(row&&Array.isArray(row.rounds),'saved original round row '+b.nativeBoutId);
  assert.ok(row.rounds.some(r=>['a','b'].some(c=>r[c]&&Object.entries(r[c]).some(([metric,val])=>metric!=='sourceByMetric'&&Number.isFinite(val)))),'positive original measured round '+b.nativeBoutId);
 }
 assert.equal(source.size,7);assert.equal(ids.size,7);
 const alias=p.bouts.find(b=>b.nativeBoutId==='60870');
 assert.equal(alias?.sourceVerifiedIndependentOpponentName,'Ariane da Silva');
 assert.equal(alias?.opponent,'Ariane Lipski da Silva');
 assert.equal(p.bouts.at(-1).result,'loss','2026 Natalia Silva decision loss retained');
 assert.equal(check(p),true,'full independent career strict Stage3 evidence gate');
});
test('Wave94: omitted, duplicated, reversed and invented Wang Cong proofs are rejected',()=>{
 assert.equal(check({...p,bouts:p.bouts.slice(1)}),false);
 assert.equal(check({...p,verifiedNumericFighterIds:['999999']}),false);
 assert.equal(check({...p,bouts:p.bouts.map((b,i)=>i?b:{...b,result:'loss'})}),false);
 assert.equal(check({...p,bouts:p.bouts.map((b,i)=>i?b:{...b,fightUrl:p.bouts[1].fightUrl})}),false);
});
test('Wave94: Park Hyun-sung alias must not become a duplicate independently certified athlete',()=>{
 const original=proofs['park-hyun-sung'];
 assert.equal(original?.fighterUrl,'https://ufcstats.com/fighter-details/b671bdf981ad527d');
 assert.ok(original.bouts.some(b=>b.nativeFighterId==='146'));
 assert.ok(!proofs['hyunsung-park'],'duplicate source-athlete proof forbidden without frozen roster identity resolution');
});