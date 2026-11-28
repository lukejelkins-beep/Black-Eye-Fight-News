/* BEFN Sumo predictor page (sumo.html#predict?a=ID&b=ID): pick two wrestlers, see each man's chance
   and what decides it, a power table, and the predictor's track record. Model: sumo-predict.mjs (v2)
   with the saved data/sumo/predictor.json. h = { e, head(id), cutout(id), known(id) } as for the Sumo home. */
import { nextMorning, pickWith, power } from './sumo-predict.mjs?v=20261128-model2';
import { face, who, head } from './sumo-home.mjs?v=20261124-review1';
import { position, isMakuuchi, tierOf, shortRank, plainRank, rows } from './sumo-home-data.mjs?v=20261124-review1';
import { completedDay, through } from './sumo-live-data.mjs?v=20261124-live1';

const pct = p => Math.round(p * 100) + '%';

/* Wrestlers to choose from: Makuuchi and Juryo on the current banzuke, with this basho's record if one is on. */
export function pool({ roster, details, live }) {
  const day = live ? completedDay(details) : 0;
  const now = new Map(rows(details?.banzuke).map(r => [Number(r.rikishiID), r]));
  return (roster?.rikishi || []).filter(w => isMakuuchi(w.currentRank) || tierOf(w.currentRank) === 'Juryo')
    .map(w => { const r = now.get(Number(w.sourceId)); const t = day && r ? through(r, day) : null; return { id: Number(w.sourceId), name: w.shikonaEn, rank: (live && r?.rank) || w.currentRank, record: t }; })
    .sort((a, b) => position(a.rank) - position(b.rank));
}

/* The page's numbers, without HTML (tests use this). */
export function predictorView({ model, roster, details, h2h, a, b }) {
  const live = !!(details && model?.state && String(details.bashoId) > String(model.state.lastBasho) && completedDay(details));
  const list = pool({ roster, details, live });
  const M = nextMorning(model, live ? { details, completed: completedDay(details) } : { ranks: new Map(list.map(w => [w.id, w.rank])) });
  const maku = list.filter(w => isMakuuchi(w.rank));
  const pw = new Map(power(M, model, maku.map(w => w.id)).map(x => [x.id, x.power]));
  const table = maku.map(w => ({ ...w, power: pw.get(w.id) })).filter(w => w.power != null).sort((x, y) => y.power - x.power).map((w, i) => ({ ...w, place: i + 1 }));
  const byId = new Map(list.map(w => [w.id, w]));
  /* Default pair: the top two of the power table. */
  let A = byId.get(Number(a)) || byId.get(table[0]?.id), B = byId.get(Number(b)) || byId.get(table[1]?.id);
  if (A && B && A.id === B.id) B = byId.get(table.find(w => w.id !== A.id)?.id);
  const q = A && B ? pickWith(M, model, A.id, B.id) : null;
  const key = A && B ? [A.id, B.id].sort((x, y) => x - y).join(':') : '';
  const pair = h2h?.activePairs?.[key] || null;
  const met = pair ? { total: pair.total, a: pair.a === A.id ? pair.winsA : pair.winsB, b: pair.a === A.id ? pair.winsB : pair.winsA } : null;
  return { list, table, A, B, p: q, met, live, day: M?.day || 1 };
}

function side(h, w, chance, cls) {
  const img = h.cutout(w.id) || h.head(w.id);
  return '<div class="spr-side ' + cls + '"><div class="spr-ph">' + (img ? '<img src="' + h.e(img) + '" alt="' + h.e(w.name) + '">' : '<span aria-hidden="true">相</span>') + '</div>' +
    '<b class="spr-pct">' + pct(chance) + '</b><strong>' + who(h, w.id, w.name) + '</strong><small>' + h.e(plainRank(w.rank)) + (w.record ? ' · ' + w.record.w + '–' + w.record.l + ' this basho' : '') + '</small></div>';
}

const yrs = x => x == null ? '?' : Math.floor(x);
const net = n => (n > 0 ? '+' : '') + n;
const styleOf = x => !x || x.styleN < 15 ? 'too few wins to say' : x.pull > 0.3 ? 'pulls and slaps down' : x.push > x.belt + 0.1 ? 'pusher' : x.belt > x.push + 0.1 ? 'belt fighter' : 'mixed';
function why(h, v) {
  const { A, B, p } = v, m = p.mine, t = p.theirs;
  const row = (label, val, note) => {
    const w = Math.min(50, Math.abs(val) / 0.8 * 50);
    const toward = val >= 0 ? A : B;
    return '<li><span class="spr-wl">' + h.e(label) + '</span><span class="spr-wbar" aria-hidden="true"><i class="' + (val >= 0 ? 'is-a' : 'is-b') + '" style="width:' + w.toFixed(1) + '%"></i></span>' +
      '<span class="spr-wn">' + (Math.abs(val) < 0.02 ? 'Level' : 'Favours ' + h.e(toward.name)) + '<small>' + h.e(note) + '</small></span></li>';
  };
  const prev = x => x.pw == null ? 'not in the top three divisions' : x.pw + '–' + x.pl + (x.pa ? '–' + x.pa + ' absent' : '');
  return '<div class="shome-card spr-why"><h3>What decides it</h3><ul>' +
    row('Rank', p.parts.rank, shortRank(A.rank) + ' v ' + shortRank(B.rank)) +
    row('Rating', p.parts.rating, 'Built from every bout in the top three divisions since 2000; it moves fastest for newcomers') +
    row('This basho', p.parts.basho, v.live ? (m.w + '–' + m.l + (m.ab ? '–' + m.ab : '') + ' v ' + t.w + '–' + t.l + (t.ab ? '–' + t.ab : '')) + (m.must || t.must ? '; one needs every remaining win for a winning record' : '') : 'No basho on: level') +
    row('Age and career', p.parts.career, 'Age ' + yrs(m.age) + ' v ' + yrs(t.age) + '; ' + yrs(m.since / 6) + ' v ' + yrs(t.since / 6) + ' years in sumo; ' + m.maku + ' v ' + t.maku + ' basho in Makuuchi since 2000') +
    row('Head-to-head', p.parts.h2h, p.met.mine + p.met.theirs ? p.met.mine + '–' + p.met.theirs + ' in meetings since 2000' : 'Never met since 2000') +
    row('Last basho', p.parts.last, prev(m) + ' v ' + prev(t)) +
    row('Style and background', p.parts.style, styleOf(m) + ' v ' + styleOf(t)) +
    '</ul>' + (v.met ? '<p class="shome-note">All-time meetings: ' + h.e(A.name) + ' ' + v.met.a + ', ' + h.e(B.name) + ' ' + v.met.b + '. <a href="#headtohead/' + A.id + '/' + B.id + '">Every meeting ›</a></p>' : '') + '</div>';
}

function chooser(h, v) {
  const opts = sel => v.list.map(w => '<option value="' + w.id + '"' + (w.id === sel.id ? ' selected' : '') + '>' + h.e(w.name) + ' · ' + h.e(shortRank(w.rank)) + '</option>').join('');
  return '<div class="spr-pick"><label>Wrestler<select data-predict-select="a">' + opts(v.A) + '</select></label><span aria-hidden="true">v</span><label>Opponent<select data-predict-select="b">' + opts(v.B) + '</select></label>' +
    '<button type="button" class="spr-swap" data-predict-swap aria-label="Swap the two wrestlers">⇄</button></div>';
}

function powerBlock(h, v) {
  return '<section class="shome-block" id="power">' + head(h, 'Power table', null, 'Makuuchi ranked by the predictor: each man’s average chance against every other man in Makuuchi' + (v.live ? ' tomorrow' : ' on day 1') + '.') +
    '<ol class="shome-card spr-power">' + v.table.slice(0, 16).map(w => '<li><span class="sana-pl">' + w.place + '</span>' + face(h, w.id) +
      '<span class="sana-nm">' + who(h, w.id, w.name) + '<small>' + h.e(shortRank(w.rank)) + '</small></span>' +
      '<span class="spr-pbar" aria-hidden="true"><i style="width:' + (w.power * 100).toFixed(0) + '%"></i></span><b>' + pct(w.power) + '</b>' +
      '<a class="spr-try" href="#predict?a=' + w.id + '&b=' + (v.table[w.place === 1 ? 1 : 0].id) + '" aria-label="Compare ' + h.e(w.name) + '">Compare</a></li>').join('') + '</ol></section>';
}

function trackBlock(h, model) {
  const t = model.backtest.test, g = model.backtest.gainVsV1, y = model.backtest.byYear;
  const cal = model.backtest.calibration.filter(c => c.bouts >= 10);
  return '<section class="shome-block" id="track-record">' + head(h, 'Track record', null, 'Fitted on 2003 to 2024, then scored on every bout of 2025 and 2026, which it had not seen. Each bout was predicted the morning of its day.') +
    '<div class="spr-stats"><div class="shome-card"><b>' + pct(t.makuuchi.model.accuracy) + '</b><span>of ' + t.makuuchi.model.bouts.toLocaleString('en-AU') + ' Makuuchi bouts called</span></div>' +
    '<div class="shome-card"><b>' + pct(t.makuuchi.higherRankWins.accuracy) + '</b><span>“higher rank wins” on the same bouts</span></div>' +
    '<div class="shome-card"><b>' + pct(t.all.model.accuracy) + '</b><span>of ' + t.all.model.bouts.toLocaleString('en-AU') + ' bouts in Makuuchi, Juryo and Makushita</span></div></div>' +
    '<div class="shome-card spr-cal"><h3>When it says a man is the favourite, how often does he win?</h3><ul>' + cal.map(c => '<li><span>' + pct(c.from) + '–' + pct(Math.min(c.to, 1)) + '</span><span class="spr-calbar" aria-hidden="true"><i style="width:' + (c.actual * 100).toFixed(0) + '%"></i><em style="left:' + (c.expected * 100).toFixed(0) + '%"></em></span><b>' + pct(c.actual) + '</b><small>' + c.bouts.toLocaleString('en-AU') + ' bouts</small></li>').join('') + '</ul>' +
    '<p class="shome-note">Bar: how often the favourite won. Mark: the chance the predictor gave. Sumo is close: most bouts sit between 50% and 60%. Above 70% the predictor is a little too sure of the favourite.</p></div>' +
    '<details class="srev-notes"><summary>How the predictor works</summary><ul>' +
    '<li>It learns from ' + model.data.bouts.toLocaleString('en-AU') + ' bouts in Makuuchi, Juryo and Makushita from ' + model.data.from.slice(0, 4) + ' to ' + model.data.to.slice(0, 4) + ', using only what was known the morning of each bout.</li>' +
    '<li>What it weighs: rank; a rating that starts from rank and moves after every bout (faster for newcomers); wins, losses and absences so far this basho, and whether a man still needs wins for a winning record while his opponent’s is settled; age, years in sumo and time in Makuuchi; head-to-head; the last basho’s record, absences and promotion or demotion; fighting style from past winning techniques; and birthplace (born abroad or in Japan).</li>' +
    '<li>Tested and left out: height and weight (no gain, and dated measurements are sparse), a tree model (no better than this one), and sharpening the chances (it would make the favourite even more over-confident).</li>' +
    '<li>Against the earlier BEFN predictor (rank, rating against rank and form) on the same 2025-2026 bouts: Brier score ' + t.all.model.brier.toFixed(4) + ' v ' + t.all.v1.brier.toFixed(4) + ' over all bouts, ' + t.makuuchi.model.brier.toFixed(4) + ' v ' + t.makuuchi.v1.brier.toFixed(4) + ' in Makuuchi (95% interval of the gain ' + g.makuuchi.interval95[0].toFixed(4) + ' to ' + g.makuuchi.interval95[1].toFixed(4) + '). Makuuchi bouts called: ' + pct(y[2025].makuuchi.model) + ' v ' + pct(y[2025].makuuchi.v1) + ' in 2025, ' + pct(y[2026].makuuchi.model) + ' v ' + pct(y[2026].makuuchi.v1) + ' in 2026.</li>' +
    '<li>It does not know about injuries until a man misses bouts, or anything said in the stable. Fusen and absences are never rated.</li></ul></details></section>';
}

export function renderPredictor(input, h) {
  const v = predictorView(input);
  if (!v.A || !v.B) return '<div class="sumo-home"><p class="srev-loading">No wrestlers to compare yet.</p></div>';
  return '<div class="sumo-home spr">' +
    '<section class="shome-hero spr-hero"><div class="shome-hero-copy"><div class="shome-kicker">Sumo predictor</div><h1>Who wins?</h1><p>Pick any two men in Makuuchi or Juryo. The chance weighs rank, a rating built from every bout since 2000, this basho’s form, age and career, head-to-head, the last basho and style.</p>' + chooser(h, v) + '</div></section>' +
    '<section class="shome-block"><div class="shome-card spr-face">' + side(h, v.A, v.p.p, 'is-a') + '<div class="spr-mid"><span class="spr-split" aria-hidden="true"><i style="width:' + (v.p.p * 100).toFixed(1) + '%"></i></span><span class="spr-v">v</span></div>' + side(h, v.B, 1 - v.p.p, 'is-b') + '</div>' + why(h, v) + '</section>' +
    powerBlock(h, v) + trackBlock(h, input.model) +
    '<p class="shome-source">From BEFN’s saved Sumo API basho records. A chance, not a tip: ' + pct(input.model.backtest.test.makuuchi.model.accuracy) + ' of Makuuchi bouts called in testing.</p></div>';
}
