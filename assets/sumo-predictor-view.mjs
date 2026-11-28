/* BEFN Sumo predictor page (sumo.html#predict?a=ID&b=ID): pick two wrestlers, see each man's chance
   and why, a power table, and the predictor's track record. Model: sumo-predict.mjs with the saved
   data/sumo/predictor.json. h = { e, head(id), cutout(id), known(id) } as for the Sumo home. */
import { pick, strength, ratingsMap, sigmoid } from './sumo-predict.mjs?v=20261128-analysis1';
import { face, who, head } from './sumo-home.mjs?v=20261124-review1';
import { position, isMakuuchi, tierOf, shortRank, plainRank, rows } from './sumo-home-data.mjs?v=20261124-review1';
import { completedDay, through } from './sumo-live-data.mjs?v=20261124-live1';

const pct = p => Math.round(p * 100) + '%';
const LN10 = Math.log(10);

/* Wrestlers to choose from: Makuuchi and Juryo on the current banzuke, with form if a basho is on. */
export function pool({ roster, details }) {
  const live = details && completedDay(details) && !(details.basho?.data?.yusho || []).length;
  const day = live ? completedDay(details) : 0;
  const now = new Map(rows(details?.banzuke).map(r => [Number(r.rikishiID), r]));
  return (roster?.rikishi || []).filter(w => ['Makuuchi', 'Juryo'].some(d => d === (isMakuuchi(w.currentRank) ? 'Makuuchi' : tierOf(w.currentRank))))
    .map(w => { const r = now.get(Number(w.sourceId)); const t = day && r ? through(r, day) : null; return { id: Number(w.sourceId), name: w.shikonaEn, rank: w.currentRank, form: t ? t.w - t.l : 0, record: t, heya: w.heya }; })
    .sort((a, b) => position(a.rank) - position(b.rank));
}

/* The page's numbers, without HTML (tests use this). */
export function predictorView({ model, roster, details, h2h, a, b }) {
  const list = pool({ roster, details });
  const R = ratingsMap(model.ratings);
  const power = list.map(w => ({ ...w, rating: R.get(w.id) || 0, s: strength(w.rank, R.get(w.id) || 0, model) }));
  const ref = strength('Maegashira 8 East', 0, model);
  const table = power.filter(w => isMakuuchi(w.rank)).sort((x, y) => y.s - x.s).map((w, i) => ({ ...w, place: i + 1, vsAverage: sigmoid(w.s - ref), sameRank: sigmoid(model.coef.rating * w.rating * LN10 / 400) }));
  const byId = new Map(list.map(w => [w.id, w]));
  /* Default pair: the top two of the power table. */
  let A = byId.get(Number(a)) || byId.get(table[0]?.id), B = byId.get(Number(b)) || byId.get(table[1]?.id);
  if (A && B && A.id === B.id) B = byId.get(table.find(w => w.id !== A.id)?.id);
  const p = A && B ? pick(A, B, model, { formA: A.form, formB: B.form }) : null;
  const key = A && B ? [A.id, B.id].sort((x, y) => x - y).join(':') : '';
  const pair = h2h?.activePairs?.[key] || null;
  const met = pair ? { total: pair.total, a: pair.a === A.id ? pair.winsA : pair.winsB, b: pair.a === A.id ? pair.winsB : pair.winsA } : null;
  return { list, table, A, B, p, met, coef: model.coef, since: model.builtFrom.basho[0].slice(0, 4) };
}

function side(h, w, chance, cls) {
  const img = h.cutout(w.id) || h.head(w.id);
  return '<div class="spr-side ' + cls + '"><div class="spr-ph">' + (img ? '<img src="' + h.e(img) + '" alt="' + h.e(w.name) + '">' : '<span aria-hidden="true">相</span>') + '</div>' +
    '<b class="spr-pct">' + pct(chance) + '</b><strong>' + who(h, w.id, w.name) + '</strong><small>' + h.e(plainRank(w.rank)) + (w.record ? ' · ' + w.record.w + '–' + w.record.l + ' this basho' : '') + '</small></div>';
}

function why(h, v) {
  const { A, B, p } = v;
  const row = (label, val, note) => {
    const w = Math.min(50, Math.abs(val) / 1.2 * 50);
    const toward = val >= 0 ? A : B;
    return '<li><span class="spr-wl">' + h.e(label) + '</span><span class="spr-wbar" aria-hidden="true"><i class="' + (val >= 0 ? 'is-a' : 'is-b') + '" style="width:' + w.toFixed(1) + '%"></i></span>' +
      '<span class="spr-wn">' + (Math.abs(val) < 0.02 ? 'Level' : 'Favours ' + h.e(toward.name)) + '<small>' + h.e(note) + '</small></span></li>';
  };
  const same = r => pct(sigmoid(v.coef.rating * r * LN10 / 400));
  return '<div class="shome-card spr-why"><h3>What decides it</h3><ul>' +
    row('Rank', p.parts.rank, shortRank(A.rank) + ' v ' + shortRank(B.rank)) +
    row('Rating', p.parts.rating, 'Results against his rank since ' + v.since + '. Chance against an average man of his own rank: ' + same(p.ratingA) + ' v ' + same(p.ratingB)) +
    row('This basho', p.parts.form, A.record || B.record ? (A.record ? A.record.w + '–' + A.record.l : '0–0') + ' v ' + (B.record ? B.record.w + '–' + B.record.l : '0–0') : 'No basho on: level') +
    '</ul>' + (v.met ? '<p class="shome-note">They have met ' + v.met.total + ' times: ' + h.e(A.name) + ' ' + v.met.a + ', ' + h.e(B.name) + ' ' + v.met.b + '. <a href="#headtohead/' + A.id + '/' + B.id + '">Every meeting ›</a> Head-to-head is shown for context only: tested on BEFN’s saved basho it made no clear difference to the predictor, so it is not part of the chance.</p>' : '') + '</div>';
}

function chooser(h, v) {
  const opts = sel => v.list.map(w => '<option value="' + w.id + '"' + (w.id === sel.id ? ' selected' : '') + '>' + h.e(w.name) + ' · ' + h.e(shortRank(w.rank)) + '</option>').join('');
  return '<div class="spr-pick"><label>Wrestler<select data-predict-select="a">' + opts(v.A) + '</select></label><span aria-hidden="true">v</span><label>Opponent<select data-predict-select="b">' + opts(v.B) + '</select></label>' +
    '<button type="button" class="spr-swap" data-predict-swap aria-label="Swap the two wrestlers">⇄</button></div>';
}

function powerBlock(h, v) {
  return '<section class="shome-block" id="power">' + head(h, 'Power table', null, 'Makuuchi ranked by the predictor: rank and rating together. The chance is against an average Maegashira 8 with no form.') +
    '<ol class="shome-card spr-power">' + v.table.slice(0, 16).map(w => '<li><span class="sana-pl">' + w.place + '</span>' + face(h, w.id) +
      '<span class="sana-nm">' + who(h, w.id, w.name) + '<small>' + h.e(shortRank(w.rank)) + '</small></span>' +
      '<span class="spr-pbar" aria-hidden="true"><i style="width:' + (w.vsAverage * 100).toFixed(0) + '%"></i></span><b>' + pct(w.vsAverage) + '</b>' +
      '<a class="spr-try" href="#predict?a=' + w.id + '&b=' + (v.table[w.place === 1 ? 1 : 0].id) + '" aria-label="Compare ' + h.e(w.name) + '">Compare</a></li>').join('') + '</ol></section>';
}

function trackBlock(h, model) {
  const t = model.backtest.test, g = model.backtest.brierGainVsRankOnly;
  const cal = model.backtest.calibration.filter(c => c.bouts >= 10);
  return '<section class="shome-block" id="track-record">' + head(h, 'Track record', null, 'Scored on the ' + model.builtFrom.test.length + ' newest saved basho, which the predictor was not fitted on. Every bout was predicted the morning of its day.') +
    '<div class="spr-stats"><div class="shome-card"><b>' + pct(t.makuuchi.model.accuracy) + '</b><span>of ' + t.makuuchi.model.bouts + ' Makuuchi bouts called</span></div>' +
    '<div class="shome-card"><b>' + pct(t.makuuchi.higherRankWins.accuracy) + '</b><span>“higher rank wins” on the same bouts</span></div>' +
    '<div class="shome-card"><b>' + pct(t.all.model.accuracy) + '</b><span>of ' + t.all.model.bouts + ' bouts in Makuuchi, Juryo and Makushita</span></div></div>' +
    '<div class="shome-card spr-cal"><h3>When it says a man is the favourite, how often does he win?</h3><ul>' + cal.map(c => '<li><span>' + pct(c.from) + '–' + pct(Math.min(c.to, 1)) + '</span><span class="spr-calbar" aria-hidden="true"><i style="width:' + (c.actual * 100).toFixed(0) + '%"></i><em style="left:' + (c.expected * 100).toFixed(0) + '%"></em></span><b>' + pct(c.actual) + '</b><small>' + c.bouts + ' bouts</small></li>').join('') + '</ul>' +
    '<p class="shome-note">Bar: how often the favourite won. Mark: the chance the predictor gave. Sumo is close: most bouts sit between 50% and 60%, and the predictor rarely goes above 80%.</p></div>' +
    '<details class="srev-notes"><summary>How the predictor works</summary><ul>' +
    '<li>Three things known before the bout: rank on the banzuke (the gap between Yokozuna and Ozeki counts more than between two low Maegashira), a rating of how each man has done against his rank, and wins minus losses so far in this basho.</li>' +
    '<li>The rating starts level for everyone and moves after every fought bout in Makuuchi, Juryo and Makushita since ' + h.e(model.builtFrom.basho[0].slice(0, 4)) + ' (' + model.builtFrom.basho.length + ' basho saved). A man who keeps beating higher-ranked opponents rises.</li>' +
    '<li>The weights were fitted on the older basho only, then tested on the newest ' + model.builtFrom.test.length + '. Against rank alone it is better on every test measure (Brier score ' + t.all.model.brier.toFixed(3) + ' v ' + t.all.rankOnly.brier.toFixed(3) + '; 95% interval of the gain ' + g.interval95[0].toFixed(3) + ' to ' + g.interval95[1].toFixed(3) + ', above zero). The weights used on the site are then refitted on every saved basho.</li>' +
    '<li>Not used: age, weight and stable. Head-to-head was tested (meetings in the saved basho before each bout) and made no clear difference: slightly better over all bouts, slightly worse in Makuuchi. Fusen and absences are never rated. It does not know about injuries.</li></ul></details></section>';
}

export function renderPredictor(input, h) {
  const v = predictorView(input);
  if (!v.A || !v.B) return '<div class="sumo-home"><p class="srev-loading">No wrestlers to compare yet.</p></div>';
  return '<div class="sumo-home spr">' +
    '<section class="shome-hero spr-hero"><div class="shome-hero-copy"><div class="shome-kicker">Sumo predictor</div><h1>Who wins?</h1><p>Pick any two men in Makuuchi or Juryo. The chance comes from rank, a two-year rating and this basho’s form.</p>' + chooser(h, v) + '</div></section>' +
    '<section class="shome-block"><div class="shome-card spr-face">' + side(h, v.A, v.p.p, 'is-a') + '<div class="spr-mid"><span class="spr-split" aria-hidden="true"><i style="width:' + (v.p.p * 100).toFixed(1) + '%"></i></span><span class="spr-v">v</span></div>' + side(h, v.B, 1 - v.p.p, 'is-b') + '</div>' + why(h, v) + '</section>' +
    powerBlock(h, v) + trackBlock(h, input.model) +
    '<p class="shome-source">From BEFN’s saved Sumo API basho records. A chance, not a tip: ' + pct(input.model.backtest.test.makuuchi.model.accuracy) + ' of Makuuchi bouts called in testing.</p></div>';
}
