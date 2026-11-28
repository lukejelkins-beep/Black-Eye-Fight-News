/* BEFN Sumo basho analysis (Basho review and live basho). Renders sumo-analysis-data.mjs.
   h = { e, head(id), cutout(id), known(id) } as for the Sumo home. Day buttons carry
   data-analysis-day; sumo.js re-renders the page for the chosen day and keeps the scroll place. */
import { face, who, head, sanyakuBlock } from './sumo-home.mjs?v=20261128-brief1';
import { shortRank, plainRank, bashoName } from './sumo-home-data.mjs?v=20261124-review1';
import { recapCard } from './sumo-live.mjs?v=20261124-live1';

/* Categorical slots 1-4 of the validated chart palette (dataviz reference), in fixed order. */
const SERIES = ['#257de0', '#f47230', '#00b894', '#f2a600'];
const pct = p => Math.round(p * 100) + '%';
const rec = x => x.w + '–' + x.l;
const dateOf = (start, day) => { if (!start) return ''; const d = new Date(start); d.setUTCDate(d.getUTCDate() + day - 1); return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };
const photoOf = (h, id) => h.cutout(id) || h.head(id);

/* Net wins by day for the men on top, with the chosen day marked. Days not yet fought stay empty. */
export function raceChart(h, A) {
  const S = A.race;
  if (!S.length || A.completed < 2) return '';
  const legend = '<ul class="sana-legend">' + S.map((s, i) => '<li style="--c:' + SERIES[i] + '"><i aria-hidden="true"></i>' + face(h, s.id) + '<span>' + who(h, s.id, s.name) + '<small>' + h.e(shortRank(s.rank)) + ' · ' + rec(s.points[s.points.length - 1]) + '</small></span></li>').join('') + '</ul>';
  const table = '<details class="sana-table"><summary>Chart as a table</summary><div class="sana-tscroll"><table><thead><tr><th scope="col">Day</th>' + S.map(s => '<th scope="col">' + h.e(s.name) + '</th>').join('') + '</tr></thead><tbody>' +
    S[0].points.map((_, d) => '<tr><th scope="row">' + (d + 1) + '</th>' + S.map(s => '<td>' + rec(s.points[d]) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div></details>';
  /* Two drawings of the same chart, so text stays 12 px or more: a wide one for desktop and a narrow one for phones. */
  return '<section class="shome-block">' + head(h, 'The title race', null, 'Wins minus losses after each day for the top ' + S.length + (A.completed < 15 ? ' so far' : '') + '. Tap a day to see it.') +
    '<div class="shome-card sana-chart">' + legend + chartSvg(h, A, 760, 270, 'is-wide') + chartSvg(h, A, 360, 240, 'is-narrow') + table + '</div></section>';
}

function chartSvg(h, A, W, H, cls) {
  const S = A.race;
  const narrow = W < 500;
  const L = 30, R = narrow ? 12 : 110, T = 14, B = 28;
  const nets = S.flatMap(s => s.points.map(p => p.net));
  let lo = Math.min(-1, ...nets), hi = Math.max(2, ...nets);
  if ((hi - lo) % 2) lo--;
  const x = d => L + (d - 1) * (W - L - R) / 14, y = v => T + (hi - v) * (H - T - B) / (hi - lo);
  const grid = [];
  for (let v = lo; v <= hi; v += (hi - lo > 10 ? 4 : 2)) grid.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"' + (v === 0 ? ' class="is-zero"' : '') + '/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + (v > 0 ? '+' + v : v) + '</text>');
  if (!grid.some(g => g.includes('is-zero'))) grid.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '" class="is-zero"/>');
  const days = Array.from({ length: 15 }, (_, i) => i + 1);
  const ticks = days.filter(d => d % (narrow ? 2 : 1) === 1 || d === 15 || !narrow).map(d => '<text x="' + x(d) + '" y="' + (H - 8) + '" text-anchor="middle">' + d + '</text>').join('');
  const band = '<rect class="sana-sel" x="' + (x(A.day) - 9) + '" y="' + T + '" width="18" height="' + (H - T - B) + '" rx="4"/>';
  /* Level lines would hide each other: each series sits a hair apart. */
  const off = i => (i - (S.length - 1) / 2) * 2.2;
  const ends = S.map((s, i) => ({ i, y: y(s.points[s.points.length - 1].net) + off(i), x: x(s.points.length) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 15) ends[k].y = ends[k - 1].y + 15;
  const lines = S.map((s, i) => {
    const pts = s.points.map(p => x(p.day) + ',' + (y(p.net) + off(i)).toFixed(1)).join(' ');
    const end = ends.find(e => e.i === i);
    return '<g class="sana-line" style="--c:' + SERIES[i] + '"><polyline points="' + pts + '"/>' +
      s.points.map(p => '<circle cx="' + x(p.day) + '" cy="' + (y(p.net) + off(i)).toFixed(1) + '" r="' + (p.day === A.day ? 5.5 : 3.5) + '"><title>' + h.e(s.name) + ', day ' + p.day + ': ' + p.w + '–' + p.l + '</title></circle>').join('') +
      (narrow ? '' : '<text class="sana-end" x="' + (end.x + 10) + '" y="' + (end.y + 4) + '">' + h.e(s.name) + '</text>') + '</g>';
  }).join('');
  const hits = days.filter(d => d <= A.completed).map(d => '<rect class="sana-hit" data-analysis-day="' + d + '" x="' + (x(d) - 11) + '" y="' + T + '" width="22" height="' + (H - T) + '"><title>Show day ' + d + '</title></rect>').join('');
  return '<svg class="' + cls + '" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Title race: wins minus losses by day for ' + h.e(S.map(s => s.name).join(', ')) + '">' +
    '<g class="sana-grid">' + grid.join('') + ticks + '</g>' + band + lines + hits + '</svg>';
}

/* A long list shows its first `n` items; the rest open in place. */
function folded(items, n, noun) {
  if (items.length <= n + 2) return '<ul>' + items.join('') + '</ul>';
  return '<ul>' + items.slice(0, n).join('') + '</ul><details class="sana-fold"><summary>All ' + items.length + ' ' + noun + '</summary><ul>' + items.slice(n).join('') + '</ul></details>';
}

function dayPicker(h, A) {
  const btn = d => '<button type="button" data-analysis-day="' + d + '" aria-pressed="' + (d === A.day) + '"' + (d > A.completed ? ' disabled' : '') + '>' + d + '</button>';
  return '<div class="slive-daypick sana-pick" role="group" aria-label="Choose a day">' + Array.from({ length: 15 }, (_, i) => btn(i + 1)).join('') + '</div>';
}

function boutRow(h, b) {
  /* "Upset" only when the predictor clearly had the other man (under 40%); a near coin-flip is just a miss. */
  const tag = b.kinboshi ? '<span class="sana-tag is-gold">★ Kinboshi</span>' : b.p < 0.4 ? '<span class="sana-tag">Upset</span>' : '';
  return '<li class="sana-bout' + (b.called ? '' : ' is-miss') + '">' + face(h, b.winner.id) +
    '<div class="sana-bw"><strong>' + who(h, b.winner.id, b.winner.name) + ' <small>' + h.e(shortRank(b.winner.rank)) + '</small></strong>' +
    '<span>beat ' + who(h, b.loser.id, b.loser.name) + ' <small>' + h.e(shortRank(b.loser.rank)) + '</small>' + (b.kimarite ? ' · <a href="#kimarite?term=' + h.e(encodeURIComponent(b.kimarite)) + '">' + h.e(b.kimarite) + '</a>' : '') + '</span></div>' +
    '<div class="sana-odds">' + tag + '<b>' + pct(b.p) + '</b></div></li>';
}

function tableBlock(h, A) {
  const move = x => {
    if (!x.today) return '<span class="sana-res">–</span>';
    return '<span class="sana-res is-' + x.today + '" title="Day ' + A.day + ': ' + x.today + '">' + (x.today === 'win' ? 'W' : 'L') + '</span>';
  };
  return '<div class="shome-card sana-standings"><h3>Standings after day ' + A.day + '</h3><ol>' + A.table.map(x => '<li><span class="sana-pl">' + x.place + '</span>' + face(h, x.id) +
    '<span class="sana-nm">' + who(h, x.id, x.name) + '<small>' + h.e(shortRank(x.rank)) + '</small></span>' + move(x) + '<b>' + rec(x) + '</b></li>').join('') + '</ol>' +
    '<a class="sana-more" href="#basho">Full standings ›</a></div>';
}

/* The chosen day: its results with the predictor's morning chance, and the table after it. */
export function dayBlock(h, A, { recap, start, live } = {}) {
  if (!A.completed) return '';
  const s = A.dayScore, sh = A.dayShock;
  const summary = A.hasModel && s.n ? '<p class="sana-sum"><b>The predictor called ' + s.hit + ' of ' + s.n + '</b> Makuuchi bouts on day ' + A.day + '.' +
    (sh ? ' Biggest shock: ' + who(h, sh.winner.id, sh.winner.name) + ' over ' + who(h, sh.loser.id, sh.loser.name) + ', given ' + pct(sh.p) + ' that morning.' : ' No upsets.') + '</p>' : '';
  return '<section class="shome-block sana-days" id="day-by-day">' + head(h, 'Day by day', ['#predict', 'How the predictor works'], (live ? 'Pick any day fought so far.' : 'Pick a day.') + ' Results with each winner’s chance that morning, and the table after the day.') +
    dayPicker(h, A) +
    '<div class="sana-dayhead"><h3>Day ' + A.day + '</h3><span>' + h.e(dateOf(start, A.day)) + '</span>' +
    (A.day > 1 ? '<button type="button" data-analysis-day="' + (A.day - 1) + '">‹ Day ' + (A.day - 1) + '</button>' : '') +
    (A.day < A.completed ? '<button type="button" data-analysis-day="' + (A.day + 1) + '">Day ' + (A.day + 1) + ' ›</button>' : '') + '</div>' +
    summary +
    '<div class="sana-grid2"><div class="shome-card sana-bouts"><h3>Makuuchi results <span>Winner’s chance that morning</span></h3>' + folded(A.bouts.map(b => boutRow(h, b)), 10, 'results') + '</div>' + tableBlock(h, A) + '</div>' +
    (recap ? recapCard(h, recap, { label: 'After day ' + A.day }) : '') + '</section>';
}

/* Who did well and who did not, against what the predictor expected of each man's bouts. */
export function expectationsBlock(h, A, { live } = {}) {
  if (!A.hasModel || (!A.over.length && !A.under.length)) return '';
  const card = (x, up) => {
    const img = photoOf(h, x.id);
    return '<article class="sana-ex ' + (up ? 'is-up' : 'is-down') + '"><div class="sana-ex-ph">' + (img ? '<img src="' + h.e(img) + '" alt="" loading="lazy">' : '<span aria-hidden="true">相</span>') + '</div>' +
      '<div class="sana-ex-bd"><strong>' + who(h, x.id, x.name) + '</strong><small>' + h.e(plainRank(x.rank)) + '</small>' +
      '<b>' + (up ? '+' : '−') + Math.abs(x.delta).toFixed(1) + '</b><span>' + x.wins + (x.wins === 1 ? ' win' : ' wins') + ' from ' + x.bouts + ' bouts; the predictor expected ' + x.expected.toFixed(1) + '</span></div></article>';
  };
  const row = (title, list, up) => list.length ? '<div class="sana-exrow"><h3>' + title + '</h3><div class="sana-excards">' + list.map(x => card(x, up)).join('') + '</div></div>' : '';
  return '<section class="shome-block">' + head(h, live ? 'Beating the odds so far' : 'Beat the odds, fell short', null,
    'Wins against the predictor’s expected wins in Makuuchi' + (live ? ' through day ' + A.day : '') + '. Men who missed bouts are left out of “fell short”.') +
    row(live ? 'Ahead of expectations' : 'Beat the odds', A.over, true) + row(live ? 'Behind expectations' : 'Fell short', A.under, false) + '</section>';
}

/* Live mode: tomorrow's picks once the torikumi is out. */
export function picksBlock(h, P) {
  if (!P.length) return '';
  const fav = m => m.p >= 0.5 ? { f: m.a, u: m.b, p: m.p } : { f: m.b, u: m.a, p: 1 - m.p };
  return '<section class="shome-block">' + head(h, 'Day ' + P[0].day + ' picks', ['#matchups', 'All bouts'], 'Makuuchi bouts announced for day ' + P[0].day + ', with the predictor’s favourite and his chance.') +
    '<div class="shome-card sana-picks">' + folded(P.map(m => { const v = fav(m); return '<li>' + face(h, v.f.id) + '<span><strong>' + who(h, v.f.id, v.f.name) + '</strong> <small>' + h.e(shortRank(v.f.rank)) + '</small> v ' + who(h, v.u.id, v.u.name) + ' <small>' + h.e(shortRank(v.u.rank)) + '</small></span>' +
      '<span class="sana-pbar" aria-hidden="true"><i style="width:' + (v.p * 100).toFixed(0) + '%"></i></span><b>' + pct(v.p) + '</b></li>'; }), 8, 'bouts') + '</div></section>';
}

/* The predictor's running score for this basho. */
export function scoreBlock(h, A, model) {
  if (!A.hasModel || !A.soFar.n) return '';
  const t = model?.backtest?.test?.makuuchi;
  const sh = A.bashoShock;
  return '<section class="shome-block"><div class="shome-card sana-score"><div><span class="shome-kicker">Predictor</span><b>' + pct(A.soFar.hit / A.soFar.n) + '</b><small>' + A.soFar.hit + ' of ' + A.soFar.n + ' Makuuchi bouts called' + (A.day < A.completed || A.completed < 15 ? ' through day ' + A.day : '') + '</small></div>' +
    (t ? '<div><span class="shome-kicker">Usual rate</span><b>' + pct(t.model.accuracy) + '</b><small>over ' + t.model.bouts + ' test bouts; “higher rank wins” gets ' + pct(t.higherRankWins.accuracy) + '</small></div>' : '') +
    (sh ? '<div><span class="shome-kicker">Biggest shock</span><b>' + pct(sh.p) + '</b><small>' + h.e(sh.winner.name) + ' over ' + h.e(sh.loser.name) + ', day ' + sh.day + '</small></div>' : '') +
    '<a class="sana-more" href="#predict">Predictor ›</a></div></section>';
}

/* The live basho page (#review while a basho is on). */
export function renderLiveAnalysis(d, A, h) {
  const name = bashoName(d.bashoId);
  const L = A.table.filter(x => x.place === 1);
  const title = !A.completed ? name + ' basho: day 1 is coming' : L.length === 1 ? h.e(L[0].name) + ' leads at <span class="nw">' + rec(L[0]) + '</span>' : (L.length <= 3 ? h.e(L.map(x => x.name).join(', ').replace(/, ([^,]*)$/, ' and $1')) : L.length + ' wrestlers') + ' share the lead at <span class="nw">' + rec(L[0]) + '</span>';
  const pics = L.slice(0, 3).filter(x => h.cutout(x.id));
  return '<div class="sumo-home sumo-review sana-live">' +
    '<section class="shome-hero slive-hero">' + (d.preview ? '<div class="slive-preview">Preview: ' + h.e(name) + ' replayed as of day ' + A.completed + '</div>' : '') +
    '<div class="shome-hero-copy"><div class="shome-kicker"><span class="slive-dot" aria-hidden="true"></span>Live basho · ' + h.e(name) + (A.completed ? ' · Day ' + A.completed + ' of 15' : '') + '</div><h1>' + title + '</h1>' +
    '<p>The tournament so far, day by day: the race, every Makuuchi result with the predictor’s chance, and who is beating expectations. Past tournaments are under Basho review.</p>' +
    (h.selector || '') + '</div>' + (pics.length ? '<div class="slive-cast">' + pics.map(x => '<img src="' + h.e(h.cutout(x.id)) + '" alt="' + h.e(x.name) + '">').join('') + '</div>' : '') + '</section>' +
    picksBlock(h, d.picks || []) + raceChart(h, A) + dayBlock(h, A, { recap: d.recap, start: d.start, live: true }) + expectationsBlock(h, A, { live: true }) + scoreBlock(h, A, d.model) +
    (d.sanyakuView ? '<section class="shome-block">' + sanyakuBlock(h, d.sanyakuView) + '</section>' : '') +
    '<p class="shome-source">From the Sumo API record of the ' + h.e(name) + ' basho, refreshed during the tournament. Chances are BEFN’s predictor, made with only what was known the morning of each bout.</p></div>';
}
