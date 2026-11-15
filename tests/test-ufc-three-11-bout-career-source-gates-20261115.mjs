import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';

const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const official=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const rich=read('ufcalendar-rich-progress.json');
const approval=read('ufc-36-month-roster-approval.json');
const cohort=new Set(approval.approvedFighters);
const cases={
  'adrian-yanez':{name:'Adrian Yanez',id:'513',wins:7,losses:3,draws:1,feeder:'Brady Huang'},
  'ignacio-bahamondes':{name:'Ignacio Bahamondes',id:'520',wins:7,losses:4,draws:0,feeder:'Edson Gomez'},
  'joanderson-brito':{name:'Joanderson Brito',id:'90',wins:8,losses:3,draws:0,feeder:'Diego Lopes'}
};
const officialHistory=(slug)=>{
 const ids=new Set(Object.values(rich.bouts)
   .filter(b=>b?.org==='ufc'&&['completed','draw','no_contest'].includes(b.status)&&
     (b.a?.slug===slug||b.b?.slug===slug)&&
     !/contender series|road to ufc/i.test(b.event||''))
   .map(b=>String(b.id)));
 return (profiles[slug]?.recentHistory||[])
   .filter(h=>h?.source==='native'&&h.promotion==='ufc'&&ids.has(String(h.boutId)));
};
const gate=(slug,p)=>{
 const history=officialHistory(slug),profile=profiles[slug];
 const latest=history.map(h=>h.date).sort().at(-1);
 return evaluateCareerEvidence(profile,history,latest,'2026-11-15',p,
   rich.bouts,approval.rosterAsOf).independentlyVerified;
};
for(const [slug,expect] of Object.entries(cases)){
 test('complete native + independent 11-bout official UFC chronology: '+slug,()=>{
  const p=official[slug],history=officialHistory(slug);
  assert.equal(cohort.size,783);assert.ok(cohort.has(slug));
  assert.equal(p?.fighterName,expect.name);
  assert.equal(p?.sourceCoverageAttested,true);
  assert.equal(p?.scope,'complete_official_ufc_career');
  assert.equal(p?.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p?.sourceSnapshot?.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(p?.sourceSnapshot?.fighterDetailsBlobSha,'7141332f0b319edbc10d006b229050ee947e7336');
  assert.equal(p?.sourceSnapshot?.eventDetailsBlobSha,'00cee85291a014d1d65e3f638129bac0a6d50f61');
  assert.equal(p?.officialUfcCareerBoutCount,11);
  assert.equal(p?.bouts?.length,11);
  assert.equal(history.length,11);
  assert.deepEqual(p?.verifiedNumericFighterIds,[expect.id]);
  assert.equal(p?.bouts?.filter(b=>b.result==='win').length,expect.wins);
  assert.equal(p?.bouts?.filter(b=>b.result==='loss').length,expect.losses);
  assert.equal(p?.bouts?.filter(b=>b.result==='draw').length,expect.draws);
  assert.equal(new Set(p?.bouts?.map(b=>b.fightUrl)).size,11);
  assert.equal(new Set(p?.bouts?.map(b=>b.nativeBoutId)).size,11);
  assert.ok(profiles[slug]?.recentHistory?.some(h=>h.opponent===expect.feeder),
    'verify separately saved feeder representation exists');
  assert.equal(p?.sourceVerifiedExcludedFeederBouts?.[0]?.opponent,expect.feeder,
    'do not silently count a feeder bout as an Octagon fight');
  assert.ok(p?.bouts?.every(b=>b.opponent!==expect.feeder));
  for(const b of p.bouts){
    assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
    const n=rich.bouts[b.nativeBoutId];
    assert.equal(n?.org,'ufc');
    assert.ok(n?.a?.id&&n?.b?.id);
    assert.equal(b.nativeFighterId,expect.id);
    assert.ok(Number(rich.roundDone[b.nativeBoutId])>0,
      'missing measured round may never be imputed to zero');
    assert.equal(history.filter(h=>String(h.boutId)===b.nativeBoutId&&h.result===b.result).length,1);
  }
  assert.equal(gate(slug,p),true,'must pass exact independent native fighter/corner/result source gate');
 });
 test('fail-closed missing, duplicate, inverted and invented source: '+slug,()=>{
  const original=official[slug];assert.equal(gate(slug,original),true);
  const dropped=structuredClone(original);dropped.bouts.splice(1,1);
  assert.equal(gate(slug,dropped),false);
  const duplicate=structuredClone(original);duplicate.bouts[0].fightUrl=duplicate.bouts[1].fightUrl;
  assert.equal(gate(slug,duplicate),false);
  const inverted=structuredClone(original);inverted.bouts[0].result=inverted.bouts[0].result==='win'?'loss':'win';
  assert.equal(gate(slug,inverted),false);
  const invented=structuredClone(original);invented.verifiedNumericFighterIds=['999999'];
  assert.equal(gate(slug,invented),false);
 });
}
