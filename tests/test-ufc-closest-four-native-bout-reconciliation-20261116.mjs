import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Research-only fail-closed native cache reconciliation. This does not certify careers.
const cache=JSON.parse(fs.readFileSync(new URL('../data/ufcalendar-rich-progress.json',import.meta.url),'utf8'));
const cases=[
  {slug:'ode-osbourne',fighterId:'483',expectedOfficial:14,excluded:['66449'],nc:['60666']},
  {slug:'ciryl-gane',fighterId:'102',expectedOfficial:15,excluded:[],nc:['60458']},
  {slug:'cody-brundage',fighterId:'43',expectedOfficial:16,excluded:[],nc:['61070']},
  {slug:'paul-craig',fighterId:'256',expectedOfficial:21,excluded:[],nc:['60289']},
];
for(const c of cases){
 test(c.slug+' retains numeric native corners, official NC and measured-round retrieval flags',()=>{
  const all=Object.values(cache.bouts).filter(b=>b.org==='ufc'&&(b.a?.id===c.fighterId||b.b?.id===c.fighterId));
  const official=all.filter(b=>b.status==='completed'||b.status==='no_contest');
  assert.equal(official.length,c.expectedOfficial);
  assert.equal(new Set(official.map(b=>b.id)).size,official.length);
  for(const b of official){
   assert.match(String(b.id),/^[1-9][0-9]*$/);
   assert.match(String(b.a?.id),/^[1-9][0-9]*$/);
   assert.match(String(b.b?.id),/^[1-9][0-9]*$/);
   assert.notEqual(String(b.a.id),String(b.b.id));
   assert.ok(Number(cache.roundDone?.[b.id])>0,'Missing round retrieval marker for '+b.id);
  }
  for(const id of c.nc){
   const b=official.find(b=>String(b.id)===id);
   assert.ok(b,'No contest missing: '+id);
   assert.equal(b.status,'no_contest');
   assert.equal(b.result?.method,'no_contest');
  }
  for(const id of c.excluded){
   assert.ok(all.some(b=>String(b.id)===id));
   assert.ok(!official.some(b=>String(b.id)===id),'Cancelled bout included: '+id);
  }
 });
}
test('closest-four research checks never assert Stage3 certification',()=>{
 assert.equal(cases.length,4);
 // Positive retrieval markers are not proof of positive measured native round metrics,
 // independently exhaustive source chronology, or strict full-cohort certification.
});
