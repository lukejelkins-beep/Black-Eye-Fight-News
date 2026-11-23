import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const register=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const indexed=read('ufcalendar-rich-progress.json').bouts;
const roster={
 'rodolfo-bellato':{full:6,dwcs:2,draw:1,nc:1},
 'piera-rodriguez':{full:8,dwcs:1,draw:0,nc:0},
 'jack-della-maddalena':{full:10,dwcs:1,draw:0,nc:0}
};
const official=slug=>profiles[slug].recentHistory.filter(row=>row.promotion==='ufc'&&
 !/(contender\s+series|road\s+to\s+ufc|\bdwcs\b)/i.test(String(indexed[String(row.boutId)]?.event||'')));
const verified=(slug,rows=official(slug),source=register[slug])=>evaluateCareerEvidence(
 profiles[slug],rows,rows[0]?.date,'2026-11-17',source,indexed,'2026-11-14').independentlyVerified;
for(const [slug,expected]of Object.entries(roster)){
 test(slug+' official UFC career is exhaustive and excludes DWCS feeders',()=>{
  const saved=official(slug),proof=register[slug];
  assert.equal(saved.length,expected.full);
  assert.equal(proof.bouts.length,expected.full);
  assert.equal(profiles[slug].recentHistory.filter(x=>x.promotion==='ufc').length,expected.full+expected.dwcs);
  assert.equal(saved.filter(x=>x.result==='draw').length,expected.draw);
  assert.equal(saved.filter(x=>x.result==='no_contest').length,expected.nc);
  assert.equal(verified(slug),true);
 });
 test(slug+' rejects missing bout, duplicate, wrong date, result, opponent, unofficial source',()=>{
  const saved=official(slug);
  for(const mutate of [
   r=>r.slice(1),
   r=>[...r,r[0]],
   r=>r.map((x,i)=>i===0?{...x,opponent:'Imaginary Opponent'}:x),
   r=>r.map((x,i)=>i===0?{...x,result:x.result==='win'?'loss':'win'}:x),
   r=>r.map((x,i)=>i===0?{...x,date:'2026-01-01'}:x)
  ])assert.equal(verified(slug,mutate(saved)),false);
  const p=register[slug];
  assert.equal(verified(slug,saved,{...p,sourceCoverageAttested:false}),false);
  assert.equal(verified(slug,saved,{...p,bouts:p.bouts.slice(1)}),false);
  assert.equal(verified(slug,saved,{...p,officialFighterUrl:'https://fake.example/'}),false);
 });
 test(slug+' optional numeric IDs and statistical round data are not mandatory',()=>{
  const p=register[slug],rows=official(slug);
  assert.equal(verified(slug,rows.map(({boutId,...r})=>r),p),true);
 });
}
test('Piera Rodriguez rematch with Sam Hughes remains two unique events',()=>{
 const p=register['piera-rodriguez'];
 assert.deepEqual(p.bouts.filter(x=>x.opponent==='Sam Hughes').map(x=>x.date).sort(),
 ['2022-10-15','2026-03-14']);
});
