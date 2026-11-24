/* BEFN Sumo Insights page (sumo.html#insights) and the Sumo home teaser.
   Renders sumo-insights-data.mjs. h = { e, head(id), cutout(id), known(id) }. */
import { face, who, head } from './sumo-home.mjs?v=20261124-insights1';
import { shortRank, plainRank, bashoName } from './sumo-home-data.mjs?v=20261124-insights1';
import { OZEKI_BAR } from './sumo-insights-data.mjs?v=20261124-insights1';

const photo = (h, id, cls) => { const src = h.cutout(id); return src ? '<img class="' + cls + '" src="' + h.e(src) + '" alt="" loading="lazy">' : '<span class="' + cls + ' is-empty" aria-hidden="true">相</span>'; };
const nextName = id => { let y = Number(id.slice(0, 4)), m = Number(id.slice(4)) + 2; if (m > 11) { m = 1; y++; } return bashoName(String(y) + String(m).padStart(2, '0')); };

function runsBlock(h, R) {
  const next = R.next ? nextName(R.next) : 'the next basho';
  const card = r => {
    const pct = Math.min(100, r.soFar / OZEKI_BAR * 100);
    return '<article class="sin-run">' + photo(h, r.id, 'sin-run-ph') + '<div class="sin-run-bd"><span class="sin-tag">' + h.e(plainRank(r.rank)) + '</span><strong>' + who(h, r.id, r.name) + '</strong>' +
      '<div class="sin-steps">' + r.steps.map(s => '<span><small>' + h.e(bashoName(s.bashoId).split(' ')[0].slice(0, 3)) + ' · ' + h.e(shortRank(s.rank)) + '</small><b>' + s.wins + '</b></span>').join('<i>+</i>') + '<i>+</i><span class="is-next"><small>' + h.e(next.split(' ')[0].slice(0, 3)) + '</small><b>?</b></span></div>' +
      '<div class="sin-bar" role="img" aria-label="' + r.soFar + ' of ' + OZEKI_BAR + ' wins"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
      '<p><b>' + r.soFar + '</b> wins so far; needs <b>' + r.needed + '</b> in ' + h.e(next) + ' to reach ' + OZEKI_BAR + '.</p></div></article>';
  };
  const yok = R.yokozuna.map(y => '<article class="sin-run is-yok">' + photo(h, y.id, 'sin-run-ph') + '<div class="sin-run-bd"><span class="sin-tag is-gold">Yokozuna watch</span><strong>' + who(h, y.id, y.name) + '</strong>' +
    '<p>Won the ' + h.e(bashoName(y.bashoId)) + ' title as Ozeki at ' + y.wins + '–' + y.losses + '. A second straight title (or close to it) is the usual path to Yokozuna.</p></div></article>').join('');
  const body = R.ozeki.length || yok ? '<div class="sin-runs">' + yok + R.ozeki.map(card).join('') + '</div>' : '<p class="shome-note">No Sekiwake or Komusubi has two straight basho in sanyaku with a realistic route to ' + OZEKI_BAR + ' wins.</p>';
  return '<section class="shome-block" id="runs">' + head(h, 'Promotion watch', null, 'The usual benchmark for Ozeki is about ' + OZEKI_BAR + ' wins over three straight basho in sanyaku, the last at Sekiwake. It is a guide the Japan Sumo Association applies with judgement, not a written rule.') + body + '</section>';
}

function rivalBlock(h, list) {
  if (!list.length) return '';
  const card = r => {
    const pa = r.a.wins / r.total * 100;
    return '<article class="sin-rv">' + '<div class="sin-rv-faces">' + photo(h, r.a.id, 'sin-rv-ph') + '<span class="sin-vs">v</span>' + photo(h, r.b.id, 'sin-rv-ph') + '</div>' +
      '<div class="sin-rv-names"><strong>' + who(h, r.a.id, r.a.name) + '</strong><strong>' + who(h, r.b.id, r.b.name) + '</strong></div>' +
      '<div class="sin-rv-bar"><i style="width:' + pa.toFixed(1) + '%"></i></div>' +
      '<div class="sin-rv-score"><b>' + r.a.wins + '</b><span>' + (r.level ? 'Level after ' : '') + r.total + ' meetings</span><b>' + r.b.wins + '</b></div>' +
      '<a class="sin-rv-link" href="#headtohead/' + r.a.id + '/' + r.b.id + '">Every meeting ›</a></article>';
  };
  return '<section class="shome-block" id="rivalries">' + head(h, 'Rivalries', ['#h2h', 'Head-to-head board'], 'Most-fought pairings between wrestlers in Makuuchi now, all-time, from BEFN’s saved head-to-head records.') + '<div class="sin-rvs">' + list.map(card).join('') + '</div></section>';
}

function stableBlock(h, list, bashoId) {
  if (!list.length) return '';
  const rows = list.slice(0, 12).map((s, i) => '<tr><td>' + (i + 1) + '</td><td><strong>' + h.e(s.heya) + '</strong></td><td class="sin-top">' + face(h, s.top.id) + '<span>' + who(h, s.top.id, s.top.name) + '<small>' + h.e(shortRank(s.top.rank)) + '</small></span></td>' +
    '<td>' + s.wrestlers + '</td><td>' + s.sekitori + '</td><td><b>' + s.wins + '–' + s.losses + (s.absences ? '–' + s.absences : '') + '</b></td><td>' + s.winning + '</td></tr>').join('');
  return '<section class="shome-block" id="stables">' + head(h, 'Stable leaderboard', ['sumo-stables.html', 'All stables'], 'The ' + bashoName(bashoId) + ' basho, Makuuchi to Makushita, by the stable each wrestler is in now. Ranked by total wins.') +
    '<div class="sin-scroll"><table class="sin-table"><thead><tr><th>#</th><th>Stable</th><th>Top wrestler</th><th>Wrestlers</th><th>Sekitori</th><th>Record</th><th>Winning records</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';
}

function recordsBlock(h, R) {
  const col = (title, note, list, fmt) => list.length ? '<div class="shome-card sin-rec"><h3>' + h.e(title) + '</h3><p>' + h.e(note) + '</p><ol>' +
    list.map(x => '<li>' + face(h, x.id) + '<span class="sin-rec-n">' + who(h, x.id, x.name) + '<small>' + h.e(fmt(x)) + '</small></span></li>').join('') + '</ol></div>' : '';
  return '<section class="shome-block" id="records">' + head(h, 'Records and milestones', null, 'Titles, gold stars and streaks across the saved basho (' + R.span + '); the rest from BEFN’s rank history.') + '<div class="sin-recs">' +
    col('Most Makuuchi titles', R.span, R.titles, x => x.n + (x.n === 1 ? ' title' : ' titles')) +
    col('Most gold stars', 'Kinboshi won, ' + R.span, R.stars, x => x.n + ' kinboshi') +
    col('Longest win streaks', 'Straight wins inside one basho, Makuuchi', R.streaks, x => x.n + ' straight · ' + bashoName(x.bashoId)) +
    col('Fastest to Makuuchi', 'Basho from debut to the top division, wrestlers in Makuuchi now', R.fastest, x => x.n + ' basho · ' + bashoName(x.to)) +
    col('Longest way back', 'Basho spent out of Makuuchi before returning', R.comebacks, x => x.n + ' basho out · back ' + bashoName(x.back)) +
    col('Youngest sekitori', 'Juryo or above now', R.youngest, x => 'Born ' + new Date(x.born + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) + ' · ' + shortRank(x.rank)) +
    '</div></section>';
}

export function renderInsights(d, h) {
  return '<div class="sumo-home sumo-insights"><section class="sbz-hero"><div class="sbz-hero-in"><div><div class="shome-kicker">Sumo insights</div><h1>Runs, rivals, stables and records</h1>' +
    '<p>Who is chasing promotion, the rivalries that keep coming round, which stables are winning, and the records of the last two years.</p>' +
    '<nav class="sin-jump" aria-label="On this page"><a href="#insights/runs">Promotion watch</a><a href="#insights/rivalries">Rivalries</a><a href="#insights/stables">Stables</a><a href="#insights/records">Records</a></nav></div></div></section>' +
    runsBlock(h, d.runs) + rivalBlock(h, d.rivalries) + stableBlock(h, d.stables, d.latestId) + recordsBlock(h, d.records) +
    '<p class="shome-source">Worked out from BEFN’s saved Sumo API records: the basho archive, rank history, roster and head-to-head summary.</p></div>';
}

/* Sumo home teaser: one card each for the closest promotion run, the leading stable and the top rivalry. */
export function insightsTeaser(h, t) {
  const cards = [];
  const run = t.runs.yokozuna[0] || t.runs.ozeki[0];
  if (run) cards.push(['Promotion watch', run.id, run.name, t.runs.yokozuna[0] ? 'Ozeki champion: a second title would usually mean Yokozuna' : run.soFar + ' wins in two basho; needs ' + run.needed + ' for ' + OZEKI_BAR, 'runs']);
  const r = t.rivalries[0];
  if (r) cards.push(['Rivalry', r.a.id, r.a.name + ' v ' + r.b.name, r.a.wins + '–' + r.b.wins + ' after ' + r.total + ' meetings', 'rivalries']);
  const s = t.stables[0];
  if (s) cards.push(['Top stable', s.top.id, s.heya, s.wins + '–' + s.losses + ' this basho · ' + s.sekitori + ' sekitori', 'stables']);
  if (!cards.length) return '';
  return '<section class="shome-block">' + head(h, 'Insights', ['#insights', 'All insights']) + '<div class="sin-teasers">' +
    cards.map(([k, id, title, line, anchor]) => '<a class="shome-card sin-teaser" href="#insights/' + anchor + '">' + photo(h, id, 'sin-teaser-ph') + '<span><small>' + h.e(k) + '</small><strong>' + h.e(title) + '</strong><em>' + h.e(line) + '</em></span></a>').join('') + '</div></section>';
}
