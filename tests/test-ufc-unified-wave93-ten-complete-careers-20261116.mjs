import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';

const load=x=>JSON.parse(readFileSync(new URL('../data/'+x,import.meta.url),'utf8'));
const approval=load('ufc-36-month-roster-approval.json'),roster=load('ufc-36-month-candidates.json');
const profiles=load('ufcalendar-fighter-research.json').profiles,cache=load('ufcalendar-rich-progress.json');
const proofs=load('ufc-independent-full-career-verification.json').fighters;
const feeder=load('ufc-feeder-bout-evidence.json').bouts;
const cases={
 'nazim-sadykhov':[7,'354',1],
 'jimmy-crute':[12,'214',1],
 'joshua-van':[12,'3',0],
 'julianna-pena':[12,'1134',0],
 'punahele-soriano':[12,'189',1],
 'uros-medic':[12,'434',1],
 'alex-pereira':[13,'101',0],
 'brandon-royval':[13,'345',0],
 'kai-kara-france':[13,'1136',0],
 'zhang-weili':[13,'399',0]
};
const sourceExcluded=(slug,row)=>feeder.some(x=>
 x.fighterSlug===slug&&String(x.boutId)===String(row.boutId)&&x.date===row.date&&x.opponent===row.opponent&&
 String(x.sourceUrl).startsWith('https://www.ufc.com/'));
const history=slug=>(profiles[slug]?.recentHistory||[]).filter(row=>
 row.source==='native'&&row.promotion==='ufc'&&row.boutId&&
 !/contender series|road to ufc|\bdwcs\b/i.test(cache.bouts[row.boutId]?.event||'')&&
 !sourceExcluded(slug,row));
const gate=(slug,p)=>evaluateCareerEvidence(profiles[slug],history(slug),
 roster.fighters.find(x=>x.slug===slug).lastUfcFight,approval.rosterAsOf,p,cache.bouts).independentlyVerified;

test('Wave93 ten independent UFCStats careers have 119 one-to-one original UFC bout IDs, outcomes, opponent corners and positive recorded rounds',()=>{
 assert.equal(approval.approvedFighters.length,783);
 let officialTotal=0,feederTotal=0;
 for(const [slug,[count,id,feederCount]] of Object.entries(cases)){
  const p=proofs[slug],h=history(slug);
  assert.ok(approval.approvedFighters.includes(slug));
  assert.equal(p?.sourceCoverageAttested,true,slug+' full independent source coverage');
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.sourceSnapshot.fightResultsBlobSha,'80258ab3d9f413cad9be13fde64beb66dd0bcfa6');
  assert.deepEqual(p.verifiedNumericFighterIds,[id]);
  assert.equal(p.bouts.length,count);
  assert.equal(h.length,count,slug+' complete original native Octagon history');
  assert.equal(p.officialUfcCareerBoutCount,count);
  assert.equal(p.sourceVerifiedExcludedFeederBouts.length,feederCount);
  const sourceUrls=new Set(),nativeIds=new Set();
  for(const f of p.sourceVerifiedExcludedFeederBouts){
   assert.ok(profiles[slug].recentHistory.some(r=>String(r.boutId)===f.nativeBoutId),'raw feeder history retained');
   const original=cache.bouts[f.nativeBoutId];
   const attested=feeder.some(x=>x.fighterSlug===slug&&String(x.boutId)===f.nativeBoutId&&
    x.date===f.date&&x.opponent===f.opponent&&x.sourceUrl===f.sourceUrl);
   assert.ok((original&&/contender series|road to ufc|dwcs/i.test(original.event))||attested,'feeder needs identified source');
   assert.ok(!p.bouts.some(b=>b.nativeBoutId===f.nativeBoutId),'feeder not UFC Octagon');
   feederTotal++;
  }
  for(const b of p.bouts){
   assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   assert.ok(!sourceUrls.has(b.fightUrl));sourceUrls.add(b.fightUrl);
   assert.ok(!nativeIds.has(b.nativeBoutId));nativeIds.add(b.nativeBoutId);
   assert.equal(b.nativeFighterId,id);
   const original=cache.bouts[b.nativeBoutId];
   assert.equal(original?.org,'ufc');
   assert.ok(Number(cache.roundDone[b.nativeBoutId])>0,slug+' measured Octagon round');
   assert.ok(Math.abs(Date.parse(original.eventDate)-Date.parse(b.date))<=86400000);
   const own=original.a.id===id?original.a:original.b.id===id?original.b:null;
   assert.ok(own,slug+' exact original native fighter corner');
   const other=own===original.a?original.b:original.a;
   assert.equal(other.name,b.opponent);
   const outcome=original.status==='no_contest'?'no_contest':
    original.status==='draw'||(!original.result?.winnerId&&original.result?.method==='draw')?'draw':
    original.result?.winnerId===own.id?'win':original.result?.winnerId===other.id?'loss':null;
   assert.equal(b.result,outcome,slug+' correct independent UFC outcome');
  }
  assert.equal(gate(slug,p),true,slug+' complete career certification gate');
  officialTotal+=count;
 }
 assert.equal(officialTotal,119);
 assert.equal(feederTotal,4);
 // Both corners legitimately share one source fight between Joshua Van and Brandon Royval.
 const van=proofs['joshua-van'].bouts.find(x=>x.opponent==='Brandon Royval');
 const royval=proofs['brandon-royval'].bouts.find(x=>x.opponent==='Joshua Van');
 assert.ok(van&&royval);assert.equal(van.fightUrl,royval.fightUrl);
 assert.equal(van.result,'win');assert.equal(royval.result,'loss');
});

test('Wave93 fail-closed: no omitted original bout, invented identity, inverted result, duplicate source or feeder contamination may certify',()=>{
 for(const slug of Object.keys(cases)){
  const p=proofs[slug];
  assert.equal(gate(slug,{...p,bouts:p.bouts.slice(1)}),false,slug+' omissions');
  assert.equal(gate(slug,{...p,verifiedNumericFighterIds:['999999']}),false,slug+' fabricated numeric athlete');
  assert.equal(gate(slug,{...p,bouts:p.bouts.map((b,i)=>i?b:{...b,result:b.result==='win'?'loss':'win'})}),false,slug+' wrong winner');
  assert.equal(gate(slug,{...p,bouts:p.bouts.map((b,i)=>i?b:{...b,fightUrl:p.bouts[1].fightUrl})}),false,slug+' duplicated independent fight identity');
  if(p.sourceVerifiedExcludedFeederBouts.length)
   assert.equal(gate(slug,{...p,bouts:[...p.bouts,{...p.bouts[0],nativeBoutId:p.sourceVerifiedExcludedFeederBouts[0].nativeBoutId,fightUrl:'https://ufcstats.com/fight-details/0000000000000000'}]}),false,slug+' feeder contamination');
 }
});
