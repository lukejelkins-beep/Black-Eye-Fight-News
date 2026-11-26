/* Fight predictions page and card reference (owner, 26 Nov 2026). */
const assert = require('assert');
const P = require('../assets/fight-predictions.js');
const now = Date.parse('2026-12-01T00:00:00Z');
const bout = (id, a, b, pool, win, fin, extra = {}) => ({ id, status: 'ok', pool, division: 'Middleweight', title: false,
  fighters: [{ name: a, slug: P.fold(a) }, { name: b, slug: P.fold(b) }], winProbability: [win, +(1 - win).toFixed(4)], finishProbability: fin,
  outcomes: { 'a-ko': win * fin * .7, 'a-sub': win * fin * .3, 'a-dec': win * (1 - fin), 'b-ko': (1 - win) * fin * .7, 'b-sub': (1 - win) * fin * .3, 'b-dec': (1 - win) * (1 - fin) },
  confidence: extra.low ? 'low' : 'normal', lowConfidenceFor: extra.low ? [b] : [],
  details: [{ rating: 53.01, rank: 233, rankOf: 592, age: 37.4, ufcFights: 19 }, { rating: 66.09, rank: 104, rankOf: 592, age: 32.6, ufcFights: 7 }] });
const data = { events: [
  { id: 'ev1', title: 'UFC Fight Night: A vs B', date: '2026-12-05', bouts: [bout('b1', 'Israel Adesanya', 'Shara Magomedov', 'men', .35, .42), bout('b2', 'Maycee Barber', 'Carli Judice', 'women', .51, .44, { low: true }),
    { id: 'b3', status: 'skipped', reason: 'x', fighters: [{ name: 'New One' }, { name: 'New Two' }] }] },
  { id: 'old', title: 'Past card', date: '2026-10-01', bouts: [bout('o1', 'Old A', 'Old B', 'men', .5, .5)] }] };

// Whole percentages always add up to 100.
for (const v of [[.333, .333, .334], [.125, .125, .25, .5], [.6046 * .35, .6046 * .65, .3954]]) assert.strictEqual(P.wholePercents(v).reduce((x, y) => x + y, 0), 100);

// Folding names matches the card snapshots (accents and punctuation dropped).
assert.strictEqual(P.fold('Ion Cuțelaba'), 'ioncutelaba'); assert.strictEqual(P.fold('JunYong Park'), 'junyongpark');

// A card bout finds its estimate by ids, or by names when another feed renamed the ids; skipped bouts never match.
assert(P.lookup(data, 'ev1', 'b1', ['Israel Adesanya', 'Shara Magomedov']));
assert(P.lookup(data, 'ev1', 'zz', ['Shara Magomedov', 'Israel Adesanya']), 'names match whatever the bout id');
assert.strictEqual(P.lookup(data, 'ev1', 'b1', ['Someone', 'Else']), null);
assert.strictEqual(P.lookup(data, 'ev1', 'b3', ['New One', 'New Two']), null);
assert.strictEqual(P.lookup(data, 'nope', 'b1', ['Israel Adesanya', 'Shara Magomedov']), null);

// Summary: the favourite is the one with the higher chance; the six outcomes add up to 100.
const s = P.summary(data.events[0].bouts[0]);
assert.deepStrictEqual(s.win, [35, 65]); assert.strictEqual(s.favName, 'Shara Magomedov'); assert.strictEqual(s.finish + s.distance, 100);
assert.strictEqual(Object.values(s.cells).reduce((x, y) => x + y, 0), 100);

// Card reference: favourite surname and chance, finish chance, link to the bout on the page, low confidence marked.
const ref = P.refHTML(P.lookup(data, 'ev1', 'b1', ['Israel Adesanya', 'Shara Magomedov']));
assert(/href="#predictions\/ev1--b1"/.test(ref)); assert(/Magomedov 65 percent/.test(ref)); assert(/>65%</.test(ref)); assert(/42% ends early/.test(ref)); assert(!/Low confidence|High confidence/.test(ref));
assert(/Low confidence/.test(P.refHTML(P.lookup(data, 'ev1', 'b2', ['Maycee Barber', 'Carli Judice']))));
// Confidence: high only at 70% or more with nobody flagged; a flagged fighter is low whatever the chance.
assert.strictEqual(P.tier({ confidence: 'normal', winProbability: [.3, .7] }), 'high'); assert.strictEqual(P.tier({ confidence: 'normal', winProbability: [.35, .65] }), 'normal');
assert.strictEqual(P.tier({ confidence: 'low', winProbability: [.1, .9] }), 'low');
assert(/fp-tier-high/.test(P.refHTML({ event: { id: 'e' }, bout: { ...data.events[0].bouts[0], winProbability: [.2, .8] } })));
// Photos: BEFN's own files by slug, initials underneath; drivers show only when both fighters have them.
const rowHtml = P.pageHTML(data, null, now);
assert(/assets\/img\/ufc\/israeladesanya-card\.webp/.test(rowHtml) && /class="fp-ini"[^>]*>IA</.test(rowHtml));
const withDrivers = JSON.parse(JSON.stringify(data.events[0].bouts[0])); withDrivers.details.forEach((d, i) => d.drivers = { diffPm: i ? 1.8 : .3, ctrlShare: .03 + i / 10, td15: 0, sub15: 0 });
assert(/What decides it/.test(P.driversHTML(withDrivers)) && /\+1\.8/.test(P.driversHTML(withDrivers))); assert.strictEqual(P.driversHTML(data.events[0].bouts[0]), '');

// Page: only cards from two days ago on, a women's bout says so, skipped bouts are named once, not predicted, the disclaimer is there.
const model = { testFrom: '2024-01-01', winner: {
  men: { bouts: 1039, accuracy: .6449, brier: .2242, reliability: [{ from: .5, to: .6, n: 463, predicted: .5456, actual: .5745 }] },
  women: { bouts: 145, accuracy: .6828, brier: .2087, reliability: [{ from: .5, to: .6, n: 60, predicted: .55, actual: .6 }] } },
  finish: { bouts: 1255, byPool: { men: { brierGain: .0037, gainInterval: [-.0015, .0089] }, women: { brierGain: .0144, gainInterval: [.0059, .0227] } } },
  method: { bouts: 1255, byPool: { men: { logLossGain: .0432, gainInterval: [.0231, .0639] }, women: { logLossGain: .0691, gainInterval: [.0259, .1147] } } } };
const page = P.pageHTML(data, model, now);
assert(/UFC Fight Night: A vs B/.test(page)); assert(!/Past card/.test(page));
assert(/Women’s rankings/.test(page) && /Men’s rankings/.test(page));
assert(/No estimate for New One vs New Two/.test(page));
assert(/not betting advice/i.test(page)); assert(/id="fp-ev1--b1"/.test(page));
assert(/Low confidence/.test(page));
// Track record: men and women separately; a finish estimate whose range includes zero is not called better.
assert(/Men’s winners/.test(page) && /Women’s winners/.test(page)); assert(/small sample/.test(page), 'the women’s record is flagged small');
assert(/Men:<\/b> \+0\.0037 Brier[^<]*not clearly better/.test(page)); assert(/Women:<\/b> \+0\.0144 Brier[^<]*, better than the division finish rate/.test(page));
// No card, no page content: nothing to estimate says so.
assert(/No announced UFC cards/.test(P.pageHTML({ events: [] }, null, now)));
// Live record: only scored fights with a winner count; a draw is not scored; small samples say so; pending ones are counted.
const ent = (key, pool, win, fin, result, date = '2026-12-05') => ({ key, pool, date, fighters: ['A ' + key, 'B ' + key], winProbability: win, finishProbability: fin, result });
const log = { since: '2026-11-26', entries: [
  ent('1', 'men', [.35, .65], .4, { winner: 1, method: 'dec', date: '2026-12-05' }), ent('2', 'men', [.7, .3], .6, { winner: 1, method: 'ko', date: '2026-12-05' }),
  ent('3', 'women', [.55, .45], .3, { winner: 0, method: 'sub', date: '2026-12-12' }), ent('4', 'men', [.5, .5], .5, { winner: null, method: 'other', date: '2026-12-12' }), ent('5', 'men', [.6, .4], .5, null)] };
const L = P.liveSummary(log);
assert.deepStrictEqual(L.pools.men, { fights: 2, right: 1, finishCalls: 2, finishRight: 2 }); assert.strictEqual(L.pools.women.right, 1);
assert.strictEqual(L.pending, 1); assert.strictEqual(L.scored.length, 3);
const live = P.liveHTML(log);
assert(/1 of 2<\/b> winners picked/.test(live) && /too few fights to judge yet/.test(live)); assert(/1 saved and waiting/.test(live));
assert(/Right/.test(live) && /Wrong/.test(live)); assert.strictEqual(P.liveHTML(null), '');
assert(/id="fp-live"/.test(P.pageHTML(data, model, now, log)) && !/id="fp-live"/.test(P.pageHTML(data, model, now, null)));
console.log('fight predictions: ok');
