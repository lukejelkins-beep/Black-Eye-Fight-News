import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
// Research-only wave78: no certificates until exact-current-SHA strict full 783 Stage 3 audit passes.
const read=f=>JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const proof=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const rich=read('ufcalendar-rich-progress.json');
const approval=read('ufc-36-month-roster-approval.json');
const cases={
  "thiago-moises": {
    "count": 16,
    "id": "565",
    "wins": 8,
    "losses": 8,
    "draws": 0,
    "noContests": 0,
    "aliases": []
  },
  "joanne-wood": {
    "count": 17,
    "id": "1182",
    "wins": 9,
    "losses": 8,
    "draws": 0,
    "noContests": 0,
    "aliases": [
      {
        "date": "2019-01-19",
        "sourceOpponent": "Ariane da Silva",
        "nativeOpponent": "Ariane Lipski da Silva"
      },
      {
        "date": "2014-12-12",
        "sourceOpponent": "Seo Hee Ham",
        "nativeOpponent": "Ham Seo Hee"
      }
    ]
  },
  "katlyn-cerminara": {
    "count": 18,
    "id": "930",
    "wins": 12,
    "losses": 6,
    "draws": 0,
    "noContests": 0,
    "aliases": []
  },
  "karolina-kowalkiewicz": {
    "count": 19,
    "id": "164",
    "wins": 9,
    "losses": 10,
    "draws": 0,
    "noContests": 0,
    "aliases": []
  },
  "stipe-miocic": {
    "count": 19,
    "id": "1946",
    "wins": 14,
    "losses": 5,
    "draws": 0,
    "noContests": 0,
    "aliases": [
      {
        "date": "2012-02-15",
        "sourceOpponent": "Philip De Fries",
        "nativeOpponent": "Phil De Fries"
      }
    ]
  },
  "tai-tuivasa": {
    "count": 19,
    "id": "324",
    "wins": 8,
    "losses": 11,
    "draws": 0,
    "noContests": 0,
    "aliases": []
  },
  "alexander-volkov": {
    "count": 20,
    "id": "5",
    "wins": 15,
    "losses": 5,
    "draws": 0,
    "noContests": 0,
    "aliases": [
      {
        "date": "2023-03-11",
        "sourceOpponent": "Alexandr Romanov",
        "nativeOpponent": "Alexander Romanov"
      }
    ]
  },
  "gillian-robertson": {
    "count": 21,
    "id": "538",
    "wins": 14,
    "losses": 7,
    "draws": 0,
    "noContests": 0,
    "aliases": []
  },
  "santiago-ponzinibbio": {
    "count": 21,
    "id": "1135",
    "wins": 12,
    "losses": 9,
    "draws": 0,
    "noContests": 0,
    "aliases": []
  },
  "aljamain-sterling": {
    "count": 23,
    "id": "274",
    "wins": 18,
    "losses": 5,
    "draws": 0,
    "noContests": 0,
    "aliases": []
  },
  "deiveson-figueiredo": {
    "count": 23,
    "id": "52",
    "wins": 14,
    "losses": 8,
    "draws": 1,
    "noContests": 0,
    "aliases": []
  },
  "jan-blachowicz": {
    "count": 23,
    "id": "365",
    "wins": 12,
    "losses": 9,
    "draws": 2,
    "noContests": 0,
    "aliases": []
  },
  "nikita-krylov": {
    "count": 23,
    "id": "329",
    "wins": 12,
    "losses": 11,
    "draws": 0,
    "noContests": 0,
    "aliases": []
  },
  "dan-hooker": {
    "count": 25,
    "id": "328",
    "wins": 14,
    "losses": 11,
    "draws": 0,
    "noContests": 0,
    "aliases": []
  }
};
const history=slug=>(profiles[slug]?.recentHistory||[]).filter(h=>
 h.promotion==='ufc'&&h.source==='native'&&rich.bouts[h.boutId]?.org==='ufc'&&
 !/Dana White|Road to UFC/i.test(rich.bouts[h.boutId]?.event||''));
const gate=(slug,entry)=>{
 const h=history(slug);
 return evaluateCareerEvidence(profiles[slug],h,h.map(x=>x.date).sort().at(-1),
  '2026-11-16',entry,rich.bouts,approval.rosterAsOf).independentlyVerified;
};
test('wave78 immutable approved 783, 14 distinct new careers',()=>{
 assert.equal(approval.approvedFighters.length,783);
 assert.equal(new Set(approval.approvedFighters).size,783);
 assert.equal(Object.keys(cases).length,14);
 for(const slug of Object.keys(cases))assert.ok(approval.approvedFighters.includes(slug));
});
for(const [slug,x] of Object.entries(cases)){
 test('wave78 one-to-one full career source/native/round crosscheck: '+slug,()=>{
  const p=proof[slug],h=history(slug);
  assert.ok(p&&profiles[slug]);
  assert.equal(p.sourceCoverageAttested,true);
  assert.equal(p.scope,'complete_official_ufc_career');
  assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.equal(p.sourceSnapshot?.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
  assert.equal(p.sourceSnapshot?.fighterDetailsBlobSha,'7141332f0b319edbc10d006b229050ee947e7336');
  assert.equal(p.sourceSnapshot?.eventDetailsBlobSha,'00cee85291a014d1d65e3f638129bac0a6d50f61');
  assert.deepEqual(p.verifiedNumericFighterIds,[x.id]);
  assert.equal(h.length,x.count);
  assert.equal(p.officialUfcCareerBoutCount,x.count);
  assert.equal(p.bouts.length,x.count);
  assert.equal(p.bouts.filter(b=>b.result==='win').length,x.wins);
  assert.equal(p.bouts.filter(b=>b.result==='loss').length,x.losses);
  assert.equal(p.bouts.filter(b=>b.result==='draw').length,x.draws);
  assert.equal(p.bouts.filter(b=>b.result==='no_contest').length,x.noContests);
  assert.equal(new Set(p.bouts.map(b=>b.fightUrl)).size,x.count);
  assert.equal(new Set(p.bouts.map(b=>b.nativeBoutId)).size,x.count);
  if(x.aliases.length)assert.deepEqual(p.sourcePresentationAliases,x.aliases);
  for(const row of p.bouts){
   assert.match(row.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
   const native=rich.bouts[row.nativeBoutId];
   assert.equal(native?.org,'ufc');
   assert.ok(native?.a?.id&&native?.b?.id);
   assert.equal(row.nativeFighterId,x.id);
   assert.ok(Number(rich.roundDone[row.nativeBoutId])>0);
   assert.equal(h.filter(b=>String(b.boutId)===String(row.nativeBoutId)&&b.result===row.result).length,1);
  }
  assert.equal(gate(slug,p),true);
 });
 test('wave78 missing, duplicate, flipped and invented identity fail closed: '+slug,()=>{
  const entry=proof[slug];assert.equal(gate(slug,entry),true);
  const missing=structuredClone(entry);missing.bouts.pop();assert.equal(gate(slug,missing),false);
  const duplicate=structuredClone(entry);duplicate.bouts[1].nativeBoutId=duplicate.bouts[0].nativeBoutId;
  assert.equal(gate(slug,duplicate),false);
  const inverted=structuredClone(entry);inverted.bouts[0].result=inverted.bouts[0].result==='win'?'loss':'win';
  assert.equal(gate(slug,inverted),false);
  const fabricated=structuredClone(entry);fabricated.verifiedNumericFighterIds=['999999'];
  assert.equal(gate(slug,fabricated),false);
 });
}
