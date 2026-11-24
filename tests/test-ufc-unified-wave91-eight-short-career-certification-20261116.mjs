import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';

const load=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const approved=load('ufc-36-month-roster-approval.json');
const census=load('ufc-36-month-candidates.json');
const profiles=load('ufcalendar-fighter-research.json').profiles;
const native=load('ufcalendar-rich-progress.json');
const proofs=load('ufc-independent-full-career-verification.json').fighters;
const linkedFeederEvidence=load('ufc-feeder-bout-evidence.json').bouts;
const targets={
 'farid-basharat':{boutCount:7,id:'185',feeders:1},
 'ismael-bonfim':{boutCount:7,id:'427',feeders:1},
 'tom-nolan':{boutCount:7,id:'92',feeders:1},
 'azamat-murzakanov':{boutCount:8,id:'452',feeders:1},
 'charles-radtke':{boutCount:8,id:'413',feeders:0},
 'joe-pyfer':{boutCount:8,id:'201',feeders:1},
 'brendson-ribeiro':{boutCount:9,id:'263',feeders:1},
 'denise-gomes':{boutCount:9,id:'421',feeders:1}
};
const documentedFeeder=(slug,r)=>linkedFeederEvidence.some(x=>x.fighterSlug===slug&&String(x.boutId)===String(r.boutId)&&x.date===r.date&&x.opponent===r.opponent&&String(x.sourceUrl).startsWith('https://www.ufc.com/'));
const nativeHistory=slug=>(profiles[slug]?.recentHistory||[]).filter(r=>
 r.source==='native'&&r.promotion==='ufc'&&r.boutId&&
 !/contender series|road to ufc|\bdwcs\b/i.test(native.bouts[r.boutId]?.event||'')&&
 !documentedFeeder(slug,r));
const certified=(slug,proof)=>evaluateCareerEvidence(profiles[slug],nativeHistory(slug),
 census.fighters.find(x=>x.slug===slug).lastUfcFight,approved.rosterAsOf,proof,native.bouts).independentlyVerified;

test('Wave91: eight UFC careers exactly match independent source identities, both original corners, outcomes, positive measured rounds and separate feeder exclusions',()=>{
 assert.equal(approved.approvedFighters.length,783);
 let total=0;
 for(const [slug,{boutCount,id,feeders}] of Object.entries(targets)){
  assert.ok(approved.approvedFighters.includes(slug),slug+' frozen cohort membership');
  const p=proofs[slug];
  assert.equal(p.sourceCoverageAttested,true);
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.officialUfcCareerBoutCount,boutCount);
  assert.equal(p.bouts.length,boutCount);
  assert.equal(nativeHistory(slug).length,boutCount,slug+' full native UFC history');
  assert.deepEqual(p.verifiedNumericFighterIds,[id]);
  assert.equal(p.sourceVerifiedExcludedFeederBouts.length,feeders);
  assert.equal(p.sourceSnapshot.fightResultsBlobSha,'80258ab3d9f413cad9be13fde64beb66dd0bcfa6');
  const sourceIds=new Set(),nativeIds=new Set();
  for(const f of p.sourceVerifiedExcludedFeederBouts){
   const b=native.bouts[f.nativeBoutId];
   const verified=linkedFeederEvidence.some(x=>x.fighterSlug===slug&&String(x.boutId)===f.nativeBoutId&&x.date===f.date&&x.opponent===f.opponent&&x.sourceUrl===f.sourceUrl);
   assert.ok((b&&/contender series|dwcs/i.test(b.event))||verified,'source-confirmed feeder exclusion required');
   assert.ok(!p.bouts.some(b=>b.nativeBoutId===f.nativeBoutId));
  }
  for(const f of p.bouts){
   assert.match(f.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   assert.ok(!sourceIds.has(f.fightUrl),'distinct source bout');
   assert.ok(!nativeIds.has(f.nativeBoutId),'distinct native bout');
   sourceIds.add(f.fightUrl);nativeIds.add(f.nativeBoutId);
   assert.equal(f.nativeFighterId,id);
   const b=native.bouts[f.nativeBoutId];
   assert.equal(b?.org,'ufc');
   assert.ok(Number(native.roundDone[f.nativeBoutId])>0);
   assert.ok(Math.abs(Date.parse(b.eventDate)-Date.parse(f.date))<=86400000);
   const own=b.a.id===id?b.a:b.b.id===id?b.b:null;
   assert.ok(own,'exact own native fighter identity');
   const opponent=own===b.a?b.b:b.a;
   assert.equal(opponent.name,f.opponent);
   const outcome=b.status==='no_contest'?'no_contest':
    b.status==='draw'||(!b.result?.winnerId&&b.result?.method==='draw')?'draw':
    b.result?.winnerId===own.id?'win':b.result?.winnerId===opponent.id?'loss':null;
   assert.equal(f.result,outcome);
  }
  if(slug==='azamat-murzakanov'){
   assert.ok(profiles[slug].recentHistory.some(r=>r.boutId==='83876'),'original 2021 DWCS row preserved');
   assert.ok(p.sourceVerifiedExcludedFeederBouts.some(r=>r.nativeBoutId==='83876'),'exclude only corroborated feeder');
  }
  assert.equal(certified(slug,p),true,slug+' strict Stage 3 source gate');
  total+=boutCount;
 }
 assert.equal(total,63,'all 63 independent official Octagon source fights match'); 
});

test('Wave91: strict certification rejects missing UFC bouts, invented IDs, outcome inversion, duplicated source URLs, and feeder contamination',()=>{
 for(const slug of Object.keys(targets)){
  const p=proofs[slug];
  assert.equal(certified(slug,{...p,bouts:p.bouts.slice(1)}),false,slug+' omission');
  assert.equal(certified(slug,{...p,verifiedNumericFighterIds:['999999']}),false,slug+' forged fighter ID');
  assert.equal(certified(slug,{...p,bouts:p.bouts.map((b,i)=>i?b:{...b,result:b.result==='win'?'loss':'win'})}),false,slug+' inverted winner');
  assert.equal(certified(slug,{...p,bouts:p.bouts.map((b,i)=>i?b:{...b,fightUrl:p.bouts[1].fightUrl})}),false,slug+' duplicate independent source identity');
  if(p.sourceVerifiedExcludedFeederBouts.length){
   assert.equal(certified(slug,{...p,bouts:[...p.bouts,{...p.bouts[0],nativeBoutId:p.sourceVerifiedExcludedFeederBouts[0].nativeBoutId,fightUrl:'https://ufcstats.com/fight-details/0000000000000000'}]}),false,slug+' feeder contamination');
  }
 }
});
