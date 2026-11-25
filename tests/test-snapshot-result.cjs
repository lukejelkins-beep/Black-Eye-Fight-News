/* Finished UFC bout snapshot: analysis rules, notable stats, form line, hero and video markup (assets/snapshot-result.js). */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const R = require('../assets/snapshot-result.js');
const load = slug => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'ufc-stats', 'fighters', slug + '.json'), 'utf8'));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' ' + a + ' vs ' + b);

// ---- real fixture: Prochazka vs Stirling, 2026-11-21 (saved round-by-round stats) ----
const jp = load('jiri-prochazka'), ns = load('navajo-stirling');
const names = ['Jiří Procházka', 'Navajo Stirling'];
let m = R.analyse(jp, ns, names, '2026-11-21', 1);
assert.ok(m, 'model built');
assert.deepStrictEqual(m.short, ['Procházka', 'Stirling']);
assert.strictEqual(m.fight.T[0].sigLanded, 23); assert.strictEqual(m.fight.T[1].sigLanded, 48);
assert.strictEqual(m.fight.T[1].legLanded, 31); assert.strictEqual(m.fight.T[0].legLanded, 12);
assert.strictEqual(m.fight.method, 'ko'); assert.strictEqual(m.fight.endRound, 2); assert.strictEqual(m.fight.endTime, '4:58');
assert.deepStrictEqual(m.chips.slice(0, 4).map(c => c.big), ['+25', '1–0', '31–12', '9–0']);
assert.ok(m.chips[0].small.includes('Stirling'));
// form: Stirling came in ahead (about +4.2 a minute against about -0.3) and the result followed it
near(m.prior[1].diffPm, 4.21, 0.05); near(m.prior[0].diffPm, -0.28, 0.05);
assert.deepStrictEqual(m.form, { fav: 1, followed: true });
assert.ok(m.verdict.lead.startsWith('Form favoured Stirling'));
assert.ok(/went to the legs/.test(m.verdict.mark) && /under half/.test(m.verdict.mark));
assert.deepStrictEqual(m.cards.map(c => c.id), ['form', 'plan', 'gap', 'finish']);
const plan = m.cards.find(c => c.id === 'plan');
near(plan.cmp[0].usual, 17, 1); near(plan.cmp[0].now, 65, 1);
near(plan.cmp[plan.cmp.length - 1].usual, 1.1, 0.1); near(plan.cmp[plan.cmp.length - 1].now, 3.1, 0.1);
const gap = m.cards.find(c => c.id === 'gap');
near(gap.cmp[0].usual, 6.0, 0.1); near(gap.cmp[0].now, 2.3, 0.1);
assert.ok(/not how often/.test(gap.text), 'winner also landed less: edge was where, not how often');
assert.ok(m.cards.find(c => c.id === 'finish').head.startsWith('KO/TKO in round 2 at 4:58'));
// the same bout read from the other fighter's file, in the other card order, gives the same facts
const m2 = R.analyse(ns, jp, [names[1], names[0]], '2026-11-21', 0);
assert.strictEqual(m2.fight.T[0].legLanded, 31); assert.deepStrictEqual(m2.form, { fav: 0, followed: true });
assert.strictEqual(m2.verdict.mark, m.verdict.mark);
// only one file held: the fight is still found from it
const m3 = R.analyse(null, ns, names, '2026-11-21', 1);
assert.strictEqual(m3.fight.T[1].sigLanded, 48); assert.strictEqual(m3.prior, null, 'no comparison without both fighters');
assert.strictEqual(m3.cards.map(c => c.id).join(), 'finish');
assert.ok(!/^Form/.test(m3.verdict.lead) && m3.verdict.mark.includes('out-landed'));
// wrong day: nothing to show
assert.strictEqual(R.analyse(jp, ns, names, '2020-01-01', 1), null);
// last five up to and including the fight, newest first
const l5 = R.lastFive(jp, '2026-11-21');
assert.deepStrictEqual(l5.map(x => x.outcome + ' ' + x.opponent + ' ' + x.method), ['L Stirling KO R2', 'L Ulberg KO R1', 'W Rountree KO R3', 'W Hill KO R3', 'L Pereira KO R2']);
assert.strictEqual(R.lastFive(jp, '2025-01-18')[0].opponent, 'Hill', 'as of an earlier day, later fights are not included');

// ---- synthetic files: build a stats file whose fights have chosen totals ----
const FIELDS = ['sigLanded', 'sigAttempted', 'totalLanded', 'headLanded', 'bodyLanded', 'legLanded', 'distanceLanded', 'clinchLanded', 'groundLanded', 'knockdowns', 'takedowns', 'takedownAttempts', 'subAttempts', 'controlSec'];
const row = o => FIELDS.map(k => o[k] || 0);
const fightRec = (date, opp, outcome, method, secs, own, opp2, extra) => ({ date, opponent: opp, outcome, method, endRound: 3, endTime: '5:00', seconds: secs, statsComplete: true, mainEvent: false,
  rounds: [[1, secs, row(own), row(opp2)]], ...extra });
const file = (name, fights) => ({ schema: 1, name, roundFields: FIELDS, fights });
const base = { sigLanded: 60, headLanded: 40, bodyLanded: 10, legLanded: 10, distanceLanded: 60 };
// X: strong form (lands 120 absorbs 60 over 600 s, i.e. +6 a minute). Y: weak form (lands 60 absorbs 120).
const strong = o => ({ ...base, sigLanded: 120, headLanded: 80, bodyLanded: 20, legLanded: 20, distanceLanded: 120, ...o });
const weak = o => ({ ...base, sigLanded: 60, ...o });
const priors = (opp, own, them) => [0, 1, 2, 3, 4].map(i => fightRec('2026-0' + (i + 1) + '-10', opp + i, 'W', 'dec', 600, own, them));
const nm = ['Xavier Strong', 'Yuri Weak'];
const mk = (xThis, yThis, xOutcome, method) => {
  const x = file(nm[0], [fightRec('2026-10-10', nm[1], xOutcome, method, 600, xThis, yThis), ...priors('P', strong(), weak())]);
  const y = file(nm[1], [fightRec('2026-10-10', nm[0], xOutcome === 'W' ? 'L' : 'W', method, 600, yThis, xThis), ...priors('Q', weak(), strong())]);
  return [x, y];
};
// form favours X and X wins: "followed it"
let [x, y] = mk(strong({ sigLanded: 130 }), weak({ sigLanded: 50 }), 'W', 'dec');
let a = R.analyse(x, y, nm, '2026-10-10', 0);
assert.deepStrictEqual(a.form, { fav: 0, followed: true }); assert.ok(a.verdict.lead.startsWith('Form favoured Strong'));
assert.ok(a.cards.find(c => c.id === 'finish').head.startsWith('Went the distance'), 'a decision has no stoppage line');
// form favours X but Y wins: "Against the form"
[x, y] = mk(strong({ sigLanded: 130 }), weak({ sigLanded: 50 }), 'L', 'ko');
a = R.analyse(x, y, nm, '2026-10-10', 1);
assert.deepStrictEqual(a.form, { fav: 0, followed: false });
assert.ok(a.verdict.lead.startsWith('Against the form: Strong came in ahead'), a.verdict.lead);
// form too close: no form fighter
const even = { sigLanded: 90, headLanded: 60, bodyLanded: 15, legLanded: 15 };
const ex = file(nm[0], [fightRec('2026-10-10', nm[1], 'W', 'dec', 600, even, even), ...priors('P', even, even)]);
const ey = file(nm[1], [fightRec('2026-10-10', nm[0], 'L', 'dec', 600, even, even), ...priors('Q', even, even)]);
a = R.analyse(ex, ey, nm, '2026-10-10', 0);
assert.strictEqual(a.form.fav, null); assert.ok(a.verdict.lead.startsWith('Form was close'));
// fewer than three earlier stat-complete fights for one fighter: no comparison
const thin = file(nm[1], [fightRec('2026-10-10', nm[0], 'L', 'dec', 600, even, even), ...priors('Q', even, even).slice(0, 2)]);
a = R.analyse(ex, thin, nm, '2026-10-10', 0);
assert.strictEqual(a.prior, null); assert.ok(!a.cards.some(c => c.id === 'form' || c.id === 'plan' || c.id === 'gap'));
// the card row and the stats record disagree on the winner, or the card names none: numbers only
a = R.analyse(ex, ey, nm, '2026-10-10', 1);
assert.strictEqual(a.verdict, null); assert.strictEqual(a.winner, -1);
a = R.analyse(ex, ey, nm, '2026-10-10', -1);
assert.strictEqual(a.verdict, null); assert.strictEqual(R.analysisHTML(a), ''); assert.ok(R.statsHTML(a).includes('Fight statistics'));
// a drawn fight in the stats record has numbers and no verdict
const dr = JSON.parse(JSON.stringify(ex)); dr.fights[0].outcome = 'D';
a = R.analyse(dr, null, nm, '2026-10-10', undefined);
assert.strictEqual(a.verdict, null);
// a fight whose stats are incomplete is not used
const bad = JSON.parse(JSON.stringify(ex)); bad.fights[0].statsComplete = false;
assert.strictEqual(R.analyse(bad, null, nm, '2026-10-10', 0), null);

// ---- notable rules ----
assert.strictEqual(R.isNotable('legLanded', 31, 12), true);
assert.strictEqual(R.isNotable('legLanded', 9, 6), false, 'under 5 apart');
assert.strictEqual(R.isNotable('sigLanded', 60, 50), false, 'under 1.5 times');
assert.strictEqual(R.isNotable('bodyLanded', 5, 0), true, 'a lead of 5 from zero');
assert.strictEqual(R.isNotable('knockdowns', 1, 0), true); assert.strictEqual(R.isNotable('knockdowns', 1, 1), false);
assert.strictEqual(R.isNotable('controlSec', 75, 10), true); assert.strictEqual(R.isNotable('controlSec', 50, 0), false);
assert.strictEqual(R.isNotable('takedowns', 3, 1), true); assert.strictEqual(R.isNotable('takedowns', 2, 1), false);

// ---- markup ----
const html = R.analysisHTML(m) + R.statsHTML(m);
assert.ok(html.includes('<mark>') && html.includes('How it was won') && html.includes('Fight statistics'));
assert.strictEqual((html.match(/class="sr-row is-hot"/g) || []).length, m.rows.reduce((n, g) => n + g.rows.filter(r => r.hot).length, 0));
assert.ok(!html.includes('NaN') && !html.includes('undefined'));
const sides = [{ name: 'A <b>', record: '1-0', fig: { cutout: 'assets/img/ufc-cutouts/a.webp' }, initials: 'A' }, { name: 'B', record: '2-0', fig: { photo: 'assets/img/ufc/b-thumb.webp' }, initials: 'B' }];
const hero = R.heroHTML(sides, { winner: 0, kicker: 'Final', headline: 'A wins', chip: ['Main event', '', '5 rounds'] });
assert.ok(hero.includes('A &lt;b&gt;') && !hero.includes('A <b>'), 'names are escaped');
assert.ok(hero.includes('sr-cut') && hero.includes('sr-ph') && hero.includes('is-lost') && hero.includes('Won') && hero.includes('Lost'));
assert.ok(!R.heroHTML(sides, { winner: null, headline: 'Draw' }).includes('Won'));
assert.strictEqual(R.videoHTML({ id: 'bad id' }, sides), '');
assert.strictEqual(R.videoHTML(null, sides), '');
const vid = R.videoHTML({ id: 'FZ-7oEF9u8w', kind: 'finish', publisher: 'UFC', title: 'T' }, sides, { finish: 'Watch the finish' }, 0);
assert.ok(vid.includes('befn-finish-play') && vid.includes('data-finish-id="FZ-7oEF9u8w"') && vid.includes('Watch the finish') && !vid.includes('<iframe'), 'the player is not loaded until the tap');
assert.ok(!/i\.ytimg|youtube/.test(vid.replace(/data-finish-id="[^"]*"/, '')), 'no third-party picture on the poster');
console.log('snapshot-result tests ok');
