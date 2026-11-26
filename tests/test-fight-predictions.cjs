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
assert(/href="#predictions\/ev1--b1"/.test(ref)); assert(/Magomedov 65%/.test(ref)); assert(/42% finish/.test(ref)); assert(!/low confidence/.test(ref));
assert(/low confidence/.test(P.refHTML(P.lookup(data, 'ev1', 'b2', ['Maycee Barber', 'Carli Judice']))));

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
console.log('fight predictions: ok');
