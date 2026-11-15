import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';

/** Research-only regression for 30 previously untested wave72 source attestations.
 * These tests do not grant certification; the successful 783-person strict
 * Stage3 CI at the exact head remains the sole certification authority.
 * They make omission, duplicate identities, wrong corners, reversed outcomes,
 * missing measured data, and stale/partial native histories fail closed.
 */
const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const register=read('ufc-independent-full-career-verification.json').fighters;
const profiles=read('ufcalendar-fighter-research.json').profiles;
const rich=read('ufcalendar-rich-progress.json');
const approval=read('ufc-36-month-roster-approval.json');
const approved=new Set(approval.approvedFighters);
const cases={
  "aleksandar-rakic": {
    "n": 12,
    "id": "451",
    "latest": "2026-08-01",
    "w": 7
  },
  "junyong-park": {
    "n": 13,
    "id": "439",
    "latest": "2025-10-25",
    "w": 9
  },
  "norma-dumont": {
    "n": 13,
    "id": "407",
    "latest": "2026-09-26",
    "w": 9
  },
  "douglas-silva-de-andrade": {
    "n": 14,
    "id": "473",
    "latest": "2026-02-28",
    "w": 7
  },
  "irene-aldana": {
    "n": 14,
    "id": "2536",
    "latest": "2024-09-14",
    "w": 8
  },
  "mickey-gall": {
    "n": 14,
    "id": "1039",
    "latest": "2026-10-31",
    "w": 6
  },
  "miesha-tate": {
    "n": 14,
    "id": "1181",
    "latest": "2025-05-03",
    "w": 7
  },
  "trevin-giles": {
    "n": 14,
    "id": "1087",
    "latest": "2024-11-02",
    "w": 7
  },
  "yan-xiaonan": {
    "n": 14,
    "id": "1111",
    "latest": "2026-08-29",
    "w": 9
  },
  "arnold-allen": {
    "n": 15,
    "id": "27",
    "latest": "2026-05-16",
    "w": 12
  },
  "gabriel-benitez": {
    "n": 15,
    "id": "1166",
    "latest": "2024-04-27",
    "w": 7
  },
  "jonathan-martinez": {
    "n": 15,
    "id": "1098",
    "latest": "2024-11-16",
    "w": 10
  },
  "chris-padilla": {
    "n": 6,
    "id": "428",
    "latest": "2026-08-22",
    "w": 5
  },
  "christian-leroy-duncan": {
    "n": 11,
    "id": "426",
    "latest": "2026-10-10",
    "w": 8
  },
  "lerone-murphy": {
    "n": 11,
    "id": "531",
    "latest": "2026-03-21",
    "w": 9
  },
  "loma-lookboonmee": {
    "n": 11,
    "id": "75",
    "latest": "2026-05-30",
    "w": 7
  },
  "pat-sabatini": {
    "n": 11,
    "id": "21",
    "latest": "2026-05-09",
    "w": 9
  },
  "sean-brady": {
    "n": 11,
    "id": "7",
    "latest": "2026-05-09",
    "w": 9
  },
  "fares-ziam": {
    "n": 12,
    "id": "91",
    "latest": "2026-09-05",
    "w": 8
  },
  "khaos-williams": {
    "n": 12,
    "id": "951",
    "latest": "2026-10-03",
    "w": 7
  },
  "miranda-maverick": {
    "n": 12,
    "id": "1141",
    "latest": "2025-06-14",
    "w": 8
  },
  "nate-landwehr": {
    "n": 12,
    "id": "581",
    "latest": "2026-10-17",
    "w": 5
  },
  "paulo-costa": {
    "n": 12,
    "id": "578",
    "latest": "2026-04-11",
    "w": 8
  },
  "rodolfo-vieira": {
    "n": 12,
    "id": "404",
    "latest": "2026-09-26",
    "w": 7
  },
  "jamie-mullarkey": {
    "n": 13,
    "id": "216",
    "latest": "2026-01-31",
    "w": 6
  },
  "karol-rosa": {
    "n": 13,
    "id": "674",
    "latest": "2026-06-20",
    "w": 8
  },
  "ludovit-klein": {
    "n": 13,
    "id": "442",
    "latest": "2026-08-01",
    "w": 8
  },
  "yana-santos": {
    "n": 13,
    "id": "186",
    "latest": "2026-10-31",
    "w": 7
  },
  "benoit-saint-denis": {
    "n": 13,
    "id": "254",
    "latest": "2026-07-11",
    "w": 9
  },
  "youssef-zalal": {
    "n": 13,
    "id": "199",
    "latest": "2026-04-25",
    "w": 8
  }
};

test('wave72: the research list contains 30 distinct approved subjects',()=>{
  assert.equal(approval.status,'approved');
  assert.equal(approved.size,783);
  assert.equal(Object.keys(cases).length,30);
  assert.equal(new Set(Object.keys(cases)).size,30);
});

for(const [slug,x] of Object.entries(cases)){
 test('wave72 complete-source and original-native proof: '+slug,()=>{
  assert.equal(approved.has(slug),true);
  const proof=register[slug],profile=profiles[slug];
  assert.ok(proof&&profile,'retain canonical source proof and cached fighter');
  const history=profile.recentHistory.filter(b=>b.promotion==='ufc');
  assert.equal(proof.scope,'complete_official_ufc_career');
  assert.equal(proof.sourceCoverageAttested,true);
  assert.equal(proof.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
  assert.match(proof.officialFighterUrl,/^https:\/\/www\.ufc\.com\/athlete\//);
  assert.match(proof.fighterUrl,/^https:\/\/ufcstats\.com\/fighter-details\/[a-f0-9]+$/);
  assert.deepEqual(proof.verifiedNumericFighterIds,[x.id]);
  assert.deepEqual([
    proof.sourceSnapshot.fightResultsBlobSha,
    proof.sourceSnapshot.fighterDetailsBlobSha,
    proof.sourceSnapshot.eventDetailsBlobSha
  ],[
    '699c9b6cebb542bf458807563d93ed2406d8728f',
    '7141332f0b319edbc10d006b229050ee947e7336',
    '00cee85291a014d1d65e3f638129bac0a6d50f61'
  ]);
  assert.equal(proof.officialUfcCareerBoutCount,x.n);
  assert.equal(proof.bouts.length,x.n);
  assert.equal(history.length,x.n,'cached career must not lose an official contest');
  assert.equal(proof.bouts[0].date,x.latest);
  assert.equal(proof.bouts.filter(b=>b.result==='win').length,x.w);
  assert.equal(new Set(proof.bouts.map(b=>b.fightUrl)).size,x.n);
  assert.equal(new Set(proof.bouts.map(b=>b.nativeBoutId)).size,x.n);
  for(const bout of proof.bouts){
    assert.match(bout.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
    assert.equal(bout.nativeFighterId,x.id,'native corner cannot change');
    const native=rich.bouts[bout.nativeBoutId];
    assert.equal(native?.org,'ufc');
    assert.ok(native.a?.id&&native.b?.id,'both original numeric corners retained');
    assert.ok(Number(rich.roundDone[bout.nativeBoutId])>0,'never backfill missing statistics with zero');
    assert.ok(history.some(h=>String(h.boutId)===String(bout.nativeBoutId)&&
      h.source==='native'&&h.result===bout.result),'original native bout and outcome required');
  }
  const latest=history.map(h=>h.date).sort().at(-1);
  const gate=evaluateCareerEvidence(profile,history,latest,'2026-11-15',proof,
    rich.bouts,approval.rosterAsOf);
  assert.equal(gate.independentlyVerified,true,
    'incomplete/ambiguous source data must remain uncertified');
 });
}

test('wave72: all thirty source histories must fail closed if one fight is removed',()=>{
 for(const slug of Object.keys(cases)){
  const proof=register[slug],profile=profiles[slug];
  const history=profile.recentHistory.filter(h=>h.promotion==='ufc');
  const check=p=>evaluateCareerEvidence(profile,history,
    history.map(h=>h.date).sort().at(-1),'2026-11-15',p,rich.bouts,
    approval.rosterAsOf).independentlyVerified;
  const missing=structuredClone(proof);missing.bouts.pop();
  assert.equal(check(missing),false,slug+': missing fight');
  const duplicate=structuredClone(proof);duplicate.bouts[1].nativeBoutId=duplicate.bouts[0].nativeBoutId;
  assert.equal(check(duplicate),false,slug+': repeated native bout');
  const inverted=structuredClone(proof);
  inverted.bouts[0].result=inverted.bouts[0].result==='win'?'loss':'win';
  assert.equal(check(inverted),false,slug+': inverted outcome');
  const fakeId=structuredClone(proof);fakeId.verifiedNumericFighterIds=['999999'];
  assert.equal(check(fakeId),false,slug+': false athlete identity');
 }
});
