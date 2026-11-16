import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCareerEvidence} from '../scripts/ufc-36-month-stage3-progress.mjs';
// Wave82 research only; full 783-cohort strict Stage3 audit is the only certificate gate.
const read = f => JSON.parse(readFileSync(new URL('../data/'+f,import.meta.url),'utf8'));
const approval = read('ufc-36-month-roster-approval.json');
const cases = {
  "li-jingliang": {
    "numeric": "1057",
    "boutCount": 18,
    "wins": 11,
    "losses": 7,
    "first": "2014-05-24",
    "last": "2024-08-17"
  },
  "robert-whittaker": {
    "numeric": "1043",
    "boutCount": 25,
    "wins": 18,
    "losses": 7,
    "first": "2012-12-15",
    "last": "2026-07-11"
  }
};
const proofs = read('ufc-independent-full-career-verification.json').fighters;
const profiles = read('ufcalendar-fighter-research.json').profiles;
const rich = read('ufcalendar-rich-progress.json');
const history = slug => profiles[slug].recentHistory.filter(h =>
  h.promotion === 'ufc' && h.source === 'native' && rich.bouts[h.boutId]?.org === 'ufc');
const gate = (slug,proof) => {
  const h = history(slug);
  return evaluateCareerEvidence(profiles[slug],h,
    h.map(b => b.date).sort().at(-1),'2026-11-16',proof,
    rich.bouts,approval.rosterAsOf).independentlyVerified;
};
test('wave82 reuses the one immutable 783-fighter UFC roster',()=>{
  assert.equal(approval.status,'approved');
  assert.equal(approval.approvedFighters.length,783);
  assert.equal(new Set(approval.approvedFighters).size,783);
  assert.deepEqual(Object.keys(cases),['li-jingliang','robert-whittaker']);
});
for (const [slug,c] of Object.entries(cases)) {
  test('wave82 exact full Greco/UFC/native career and positive rounds: '+slug,()=>{
    assert.ok(approval.approvedFighters.includes(slug));
    const p=proofs[slug],h=history(slug);
    assert.equal(p.sourceCoverageAttested,true);
    assert.equal(p.scope,'complete_official_ufc_career');
    assert.equal(p.verificationMethod,'full_official_ufc_fight_listing_crosscheck');
    assert.equal(p.officialUfcCareerBoutCount,c.boutCount);
    assert.equal(p.bouts.length,c.boutCount);
    assert.equal(h.length,c.boutCount);
    assert.deepEqual(p.verifiedNumericFighterIds,[c.numeric]);
    assert.equal(p.sourceSnapshot.fightResultsBlobSha,'699c9b6cebb542bf458807563d93ed2406d8728f');
    assert.equal(p.sourceSnapshot.fighterDetailsBlobSha,'7141332f0b319edbc10d006b229050ee947e7336');
    assert.equal(p.sourceSnapshot.eventDetailsBlobSha,'00cee85291a014d1d65e3f638129bac0a6d50f61');
    assert.equal(p.bouts[0].date,c.last);
    assert.equal(p.bouts.at(-1).date,c.first);
    assert.equal(p.bouts.filter(b=>b.result==='win').length,c.wins);
    assert.equal(p.bouts.filter(b=>b.result==='loss').length,c.losses);
    assert.equal(new Set(p.bouts.map(b=>b.fightUrl)).size,c.boutCount);
    assert.equal(new Set(p.bouts.map(b=>b.nativeBoutId)).size,c.boutCount);
    for (const b of p.bouts) {
      assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[a-f0-9]{16}$/);
      const n=rich.bouts[b.nativeBoutId];
      assert.equal(n?.org,'ufc');
      assert.ok(n?.a?.id && n?.b?.id);
      assert.ok(n.a.id===c.numeric||n.b.id===c.numeric);
      assert.equal(b.nativeFighterId,c.numeric);
      assert.ok(Number(rich.roundDone[b.nativeBoutId])>0);
      assert.equal(h.filter(x=>String(x.boutId)===String(b.nativeBoutId)&&x.result===b.result).length,1);
    }
    assert.equal(gate(slug,p),true);
  });
  test('wave82 omitting/duplicating/inverting/fabricating fails strict source gate: '+slug,()=>{
    const p=proofs[slug];assert.equal(gate(slug,p),true);
    const missing=structuredClone(p);missing.bouts.pop();assert.equal(gate(slug,missing),false);
    const duplicate=structuredClone(p);duplicate.bouts[1].nativeBoutId=duplicate.bouts[0].nativeBoutId;assert.equal(gate(slug,duplicate),false);
    const inverted=structuredClone(p);inverted.bouts[0].result=inverted.bouts[0].result==='win'?'loss':'win';assert.equal(gate(slug,inverted),false);
    const fabricated=structuredClone(p);fabricated.verifiedNumericFighterIds=['999999'];assert.equal(gate(slug,fabricated),false);
  });
  test('wave82 primary-source date local alignment documented: '+slug,()=>{
    const corrections=proofs[slug].sourceDateReconciliations;
    assert.equal(corrections.length,1);
    assert.equal(corrections[0].officialSourceUrl,'https://www.ufc.com/athlete/'+slug);
    const a=Date.parse(corrections[0].pinnedGrecoEventDate+'T00:00:00Z');
    const b=Date.parse(corrections[0].ufcOfficialDate+'T00:00:00Z');
    const c=Date.parse(corrections[0].savedNativeEventDate+'T00:00:00Z');
    assert.equal(Math.abs(a-b),86400000);
    assert.equal(Math.abs(b-c),86400000);
    assert.equal(gate(slug,proofs[slug]),true);
  });
}
