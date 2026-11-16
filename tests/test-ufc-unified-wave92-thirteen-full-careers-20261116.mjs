import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';

const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const approval=read('ufc-36-month-roster-approval.json'),roster=read('ufc-36-month-candidates.json');
const profiles=read('ufcalendar-fighter-research.json').profiles,cache=read('ufcalendar-rich-progress.json');
const register=read('ufc-independent-full-career-verification.json').fighters;
const curated=read('ufc-feeder-bout-evidence.json').bouts;
const cases={
 'jiri-prochazka':[9,'196',0],
 'andre-muniz':[10,'188',2],
 'ilia-topuria':[10,'99',0],
 'jordan-leavitt':[10,'89',1],
 'khamzat-chimaev':[10,'1',0],
 'tatsuro-taira':[10,'4',0],
 'vitor-petrino':[10,'173',1],
 'jamall-emmers':[10,'425',1],
 'veronica-hardy':[10,'141',0],
 'kyler-phillips':[10,'570',1],
 'dricus-du-plessis':[11,'2739',0],
 'vanessa-demopoulos':[11,'769',1],
 'carlos-ulberg':[11,'219',1]
};
const curatedFeeder=(slug,row)=>curated.some(x=>
 x.fighterSlug===slug&&String(x.boutId)===String(row.boutId)&&
 x.date===row.date&&x.opponent===row.opponent&&
 String(x.sourceUrl).startsWith('https://www.ufc.com/'));
const history=slug=>(profiles[slug]?.recentHistory||[]).filter(row=>
 row.source==='native'&&row.promotion==='ufc'&&row.boutId&&
 !/contender series|road to ufc|\bdwcs\b/i.test(cache.bouts[row.boutId]?.event||'')&&
 !curatedFeeder(slug,row));
const verify=(slug,proof)=>evaluateCareerEvidence(
 profiles[slug],history(slug),
 roster.fighters.find(x=>x.slug===slug).lastUfcFight,
 approval.rosterAsOf,proof,cache.bouts).independentlyVerified;

test('Wave92 13 exhaustive independent UFCStats career listings reproduce 132 exact original Octagon fights with positive measured rounds',()=>{
 assert.equal(approval.approvedFighters.length,783);
 let total=0;const combinedSourceIds=new Set();
 for(const [slug,[length,id,feeders]] of Object.entries(cases)){
  const p=register[slug],saved=history(slug);
  assert.ok(approval.approvedFighters.includes(slug),slug+' approved immutable cohort');
  assert.ok(p?.sourceCoverageAttested,slug+' has independent full career attestation');
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.sourceSnapshot.fightResultsBlobSha,'80258ab3d9f413cad9be13fde64beb66dd0bcfa6');
  assert.equal(p.bouts.length,length);
  assert.equal(saved.length,length,slug+' exact full saved history excludes confirmed feeder');
  assert.equal(p.officialUfcCareerBoutCount,length);
  assert.deepEqual(p.verifiedNumericFighterIds,[id]);
  assert.equal(p.sourceVerifiedExcludedFeederBouts.length,feeders);
  const urls=new Set(),nativeIds=new Set();
  for(const row of p.sourceVerifiedExcludedFeederBouts){
   assert.ok(profiles[slug].recentHistory.some(h=>String(h.boutId)===String(row.nativeBoutId)),slug+' source history preserves feeder');
   const indexed=cache.bouts[row.nativeBoutId],verified=curated.some(x=>
    x.fighterSlug===slug&&String(x.boutId)===String(row.nativeBoutId)&&x.date===row.date&&x.opponent===row.opponent&&x.sourceUrl===row.sourceUrl);
   assert.ok((indexed&&/contender series|dwcs|road to ufc/i.test(indexed.event))||verified,slug+' independently reviewed feeder exclusion');
   assert.ok(!p.bouts.some(x=>x.nativeBoutId===row.nativeBoutId));
  }
  for(const bout of p.bouts){
   assert.match(bout.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   assert.ok(!urls.has(bout.fightUrl),slug+' unique source bout');
   assert.ok(!nativeIds.has(bout.nativeBoutId),slug+' unique original native bout');
   urls.add(bout.fightUrl);nativeIds.add(bout.nativeBoutId);
   const indexed=cache.bouts[bout.nativeBoutId];
   assert.equal(indexed?.org,'ufc');
   assert.ok(Number(cache.roundDone[bout.nativeBoutId])>0,slug+' positive saved measured round');
   assert.ok(Math.abs(Date.parse(indexed.eventDate)-Date.parse(bout.date))<=86400000);
   const own=indexed.a.id===id?indexed.a:indexed.b.id===id?indexed.b:null;
   assert.ok(own,slug+' original numeric fighter corner');
   const other=own===indexed.a?indexed.b:indexed.a;
   assert.equal(other.name,bout.opponent);
   const outcome=indexed.status==='no_contest'?'no_contest':
    indexed.status==='draw'||(!indexed.result?.winnerId&&indexed.result?.method==='draw')?'draw':
    indexed.result?.winnerId===own.id?'win':indexed.result?.winnerId===other.id?'loss':null;
   assert.equal(outcome,bout.result,slug+' exact outcome');
   combinedSourceIds.add(bout.fightUrl);
  }
  assert.equal(verify(slug,p),true,slug+' strict full career gate');
  total+=p.bouts.length;
 }
 assert.equal(total,132);
 assert.ok(combinedSourceIds.size>=120,'paired UFC fighters may legitimately share exact original source bout');
});

test('Wave92 every source history must fail closed against omitted, inverted, repeated and forged evidence',()=>{
 for(const slug of Object.keys(cases)){
  const p=register[slug];
  assert.equal(verify(slug,{...p,bouts:p.bouts.slice(1)}),false,slug+' omitted UFC bout');
  assert.equal(verify(slug,{...p,verifiedNumericFighterIds:['999999']}),false,slug+' forged native identity');
  assert.equal(verify(slug,{...p,bouts:p.bouts.map((b,i)=>i?b:{...b,result:b.result==='win'?'loss':'win'})}),false,slug+' inverted winner');
  assert.equal(verify(slug,{...p,bouts:p.bouts.map((b,i)=>i?b:{...b,fightUrl:p.bouts[1].fightUrl})}),false,slug+' duplicate UFCStats source ID');
  if(p.sourceVerifiedExcludedFeederBouts.length)
   assert.equal(verify(slug,{...p,bouts:[...p.bouts,{...p.bouts[0],nativeBoutId:p.sourceVerifiedExcludedFeederBouts[0].nativeBoutId,fightUrl:'https://ufcstats.com/fight-details/0000000000000000'}]}),false,slug+' feeder contamination');
 }
});
