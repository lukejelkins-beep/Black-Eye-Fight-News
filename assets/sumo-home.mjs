/* BEFN Sumo home (Overview). Renders the storylines from sumo-home-data.mjs.
   h = { e: escape, head: id => verified head-crop path or '', cutout: id => verified cut-out path or '' }.
   During a basho (snapshot not finished) the champion and prize blocks wait for the final day and
   the watch list reads "if it ended today". */
import { plainRank, shortRank, bashoName } from './sumo-home-data.mjs';

const dayWord = n => 'day ' + n;
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const count = n => WORDS[n] || String(n);
function face(h, id, cls = 'shome-face') {
  const src = h.head(id);
  return src ? '<img class="' + cls + '" src="' + h.e(src) + '" alt="" loading="lazy" decoding="async">' : '<span class="' + cls + ' is-empty" aria-hidden="true">相</span>';
}
/* A wrestler with no BEFN profile (h.known says so) is shown without a link. */
const who = (h, id, name) => h.known && !h.known(id) ? h.e(name) : '<a href="#profile/' + Number(id) + '">' + h.e(name) + '</a>';
const head = (h, title, link, sub) => '<div class="shome-head"><h2>' + h.e(title) + '</h2>' + (link ? '<a href="' + h.e(link[0]) + '">' + h.e(link[1]) + ' ›</a>' : '') + '</div>' + (sub ? '<p class="shome-sub-line">' + h.e(sub) + '</p>' : '');
const andList = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

function hero(h, d) {
  const H = d.headline, c = H.champion;
  const kin = d.kinboshi.length;
  let title, text, stats;
  if (d.finished && c) {
    title = h.e(c.name) + ' wins the ' + H.name.split(' ')[0] + ' basho at <span class="nw">' + c.wins + '–' + c.losses + '</span>';
    const lost = c.lostTo.map(x => h.e(x.opponent) + ' on ' + dayWord(x.day));
    const ozeki = d.sanyaku.filter(r => r.flag);
    text = h.e(plainRank(c.rank)) + ' ' + h.e(c.name) + (lost.length ? ' lost only to ' + andList(lost) + '.' : ' did not lose a bout.') +
      (kin ? ' ' + count(kin) + ' gold star' + (kin > 1 ? 's were' : ' was') + ' won' + (new Set(d.kinboshi.map(k => k.yokozunaId)).size === 1 ? ' against ' + h.e(d.kinboshi[0].yokozuna) : '') + '.' : '') +
      ozeki.map(r => ' Ozeki ' + h.e(r.name) + ' finished ' + r.wins + '–' + r.losses + (r.flag === 'demoted' ? ' as kadoban and drops to Sekiwake.' : ', so he is kadoban in ' + h.e(d.watch.next.month) + '.')).join('');
    stats = [[c.wins + '–' + c.losses, 'Champion’s record'], [String(kin), 'Kinboshi (gold stars)'], [d.watch.next.month.slice(0, 3), 'Next basho · ' + d.watch.next.venue]];
  } else {
    title = h.e(H.name) + ' basho: in progress';
    text = 'Results, standings and today’s bouts are on the tournament desk.';
    stats = [[String(kin), 'Kinboshi so far']];
  }
  return '<section class="shome-hero"><div class="shome-hero-copy"><div class="shome-kicker">' + h.e(H.name.split(' ')[0]) + ' basho ' + h.e(H.bashoId.slice(0, 4)) + ' · ' + h.e(H.venue) + (d.finished ? ' · Final' : '') + '</div>' +
    '<h1>' + title + '</h1><p>' + text + '</p><div class="shome-stats">' + stats.map(([b, s]) => '<div class="shome-chip"><b>' + h.e(b) + '</b><span>' + h.e(s) + '</span></div>').join('') + '</div>' +
    (d.finished ? '<a class="shome-btn" href="#review">Basho review ›</a><a class="shome-btn is-ghost" href="#basho">Full results</a>' : '<a class="shome-btn" href="#basho">Full results ›</a><a class="shome-btn is-ghost" href="#matchups">Today’s bouts</a>') + '</div>' +
    (c && d.finished && h.cutout(c.id) ? '<div class="shome-hero-photo"><img src="' + h.e(h.cutout(c.id)) + '" alt="' + h.e(c.name) + '"><span class="shome-cup">Makuuchi champion</span></div>' : '') + '</section>';
}

function championsBlock(h, d, link = ['#basho', 'Standings']) {
  if (!d.finished || !d.champions.length) return '';
  return '<section class="shome-block" id="at-champions">' + head(h, 'Champions and prizes', link) + '<div class="shome-champs">' +
    d.champions.map(c => '<div class="shome-champ">' + face(h, c.id) + '<div><small>' + h.e(c.label) + '</small><strong>' + who(h, c.id, c.name) + '</strong></div></div>').join('') + '</div></section>';
}

function starsBlock(h, d) {
  const k = d.kinboshi;
  const body = k.length ? '<div class="shome-stars">' + k.map(s => '<div class="shome-star">' + face(h, s.id) + '<div><strong>' + who(h, s.id, s.name) + '</strong><span>' + h.e(shortRank(s.rank)) + ' · ' + dayWord(s.day) + (s.kimarite ? ' · <a href="#kimarite?term=' + h.e(encodeURIComponent(s.kimarite)) + '">' + h.e(s.kimarite) + '</a>' : '') + '</span><span>beat Yokozuna ' + h.e(s.yokozuna) + '</span></div><b class="shome-gold" aria-hidden="true">★</b></div>').join('') + '</div>' +
    (new Set(k.map(s => s.yokozunaId)).size === 1 && k.length > 1 ? '<p class="shome-note">' + (k.length === 2 ? 'Both' : 'All ' + count(k.length).toLowerCase()) + ' came against ' + h.e(k[0].yokozuna) + '.</p>' : '')
    : '<p class="shome-note">No Maegashira beat a Yokozuna this basho.</p>';
  return '<div id="at-stars">' + head(h, 'Gold stars', null, 'A Maegashira who beats a Yokozuna earns a kinboshi, a bonus paid for the rest of his career.') + body + '</div>';
}

function sanyakuBlock(h, d) {
  const row = r => {
    const total = Math.max(15, r.wins + r.losses + r.absences);
    const tag = r.flag === 'kadoban' ? ' <span class="shome-tag is-kadoban">Kadoban</span>' : r.flag === 'demoted' ? ' <span class="shome-tag is-down">To Sekiwake</span>' : '';
    const sub = r.flag === 'kadoban' ? r.tier + ' · must win 8 in ' + d.watch.next.month : r.tier;
    return '<div class="shome-srow"><div class="shome-who"><strong>' + who(h, r.id, r.name) + tag + '</strong><small>' + h.e(sub) + '</small></div>' +
      '<div class="shome-bar" role="img" aria-label="' + r.wins + ' wins, ' + r.losses + ' losses' + (r.absences ? ', ' + r.absences + ' absent' : '') + '"><i style="width:' + (r.wins / total * 100).toFixed(1) + '%"></i><u style="width:' + (r.losses / total * 100).toFixed(1) + '%"></u><em style="left:' + (8 / total * 100).toFixed(2) + '%"></em></div>' +
      '<div class="shome-rec">' + r.wins + '–' + r.losses + (r.absences ? '–' + r.absences : '') + '</div></div>';
  };
  return '<div id="at-sanyaku">' + head(h, 'Sanyaku scorecard', ['#banzuke', 'Rankings'], 'The top ranks. The line marks 8 wins, a winning record (kachi-koshi).') + '<div class="shome-card shome-sanyaku">' + d.sanyaku.map(row).join('') + '</div></div>';
}

function risingBlock(h, d) {
  if (!d.rising.length) return '';
  const card = r => {
    const img = h.cutout(r.id);
    const fromTier = r.from.split(' ')[0], toTier = r.to.split(' ')[0];
    const climb = fromTier === toTier ? 'Up from ' + plainRank(r.from) : 'From ' + fromTier + ' to ' + toTier;
    const line = climb + ' in ' + r.tournaments + ' basho, since ' + bashoName(r.fromBasho) + '.' +
      (r.youngestSekitori ? ' Born in ' + r.born + ', the youngest sekitori (Juryo or above) in the tracked field.' : '');
    return '<a class="shome-card shome-rcard" href="#profile/' + r.id + '"><div class="shome-ph">' + (img ? '<img src="' + h.e(img) + '" alt="" loading="lazy">' : '<span aria-hidden="true">相</span>') + '</div><div class="shome-bd"><strong>' + h.e(r.name) + '</strong>' +
      '<div class="shome-path"><span class="from">' + h.e(plainRank(r.from)) + '</span>→<span class="to">' + h.e(plainRank(r.to)) + '</span></div><p>' + h.e(line) + '</p></div></a>';
  };
  return '<section class="shome-block">' + head(h, 'Rising stars', ['#rikishi', 'All rikishi'], 'The biggest climbs over the last six basho, among wrestlers now in Juryo or above or near the top of Makushita.') + '<div class="shome-rise">' + d.rising.map(card).join('') + '</div></section>';
}

function moversBlock(h, d) {
  const m = d.movers;
  if (!m.up.length && !m.down.length) return '';
  const item = x => '<div class="shome-mv">' + face(h, x.id) + '<div><strong>' + who(h, x.id, x.name) + '</strong><span>' + h.e(plainRank(x.from)) + ' → ' + h.e(plainRank(x.to)) + '</span></div><em>' + h.e(x.note) + '</em></div>';
  return '<section class="shome-block" id="at-movers">' + head(h, 'On the move', ['#banzuke', 'Full rankings'], 'Biggest changes from the ' + bashoName(m.from) + ' to the ' + bashoName(m.to) + ' rankings.') +
    '<div class="shome-moves"><div class="shome-card is-up"><div class="shome-colhead">▲ Up</div>' + m.up.map(item).join('') + '</div><div class="shome-card is-down"><div class="shome-colhead">▼ Down</div>' + m.down.map(item).join('') + '</div></div></section>';
}

function watchBlock(h, d) {
  const w = d.watch;
  const col = (title, list) => list.length ? '<div class="shome-card shome-wcol"><h3>' + h.e(title) + '</h3><ul>' + list.map(x => '<li><span>' + who(h, x.id, x.name) + ' · ' + h.e(shortRank(x.rank)) + '</span><b>' + (x.champion ? h.e(x.record) + ' · champion' : h.e(x.record)) + '</b></li>').join('') + '</ul></div>' : '';
  const cols = col('Pushing for Makuuchi', w.pushing) + col('At risk in Makuuchi', w.atRisk) + col('Knocking on Juryo', w.knocking);
  if (!cols) return '';
  return '<section class="shome-block">' + head(h, (d.finished ? w.next.month + ' watch' : 'If it ended today'), null,
    'BEFN’s reading of the records. The Japan Sumo Association publishes the ' + w.next.month + ' rankings before the basho.') + '<div class="shome-watch">' + cols + '</div></section>';
}

function factBlock(h, d) {
  const f = d.fact;
  if (!f) return '<section class="shome-block"><a class="shome-fact" href="sumo-stories.html"><div><div class="shome-kicker">Sumo stories</div><h3>Fact of the day</h3><p>Sourced facts and records about this banzuke.</p></div></a></section>';
  return '<section class="shome-block"><div class="shome-fact"><div class="shome-pair">' + f.ids.map(id => face(h, id, 'shome-face is-big')).join('') + '</div><div><div class="shome-kicker">Fact of the basho</div><h3>' + h.e(f.title) + '</h3><p>' + h.e(f.text) + '</p>' +
    (f.sourceUrl ? '<small>Family link: <a href="' + h.e(f.sourceUrl) + '" target="_blank" rel="noopener noreferrer">' + h.e(f.source) + ' ↗</a></small>' : '') + '</div></div></section>';
}

const EXPLORE = [
  ['Fights', 'Results', '#basho', 'Each day’s results and the standings'], ['Fights', 'Bouts', '#matchups', 'Matchups with head-to-head records'],
  ['Fights', 'Head-to-head', '#h2h', 'Who leads whom on this banzuke'], ['Fighters', 'Rikishi', '#rikishi', 'Profiles of every tracked wrestler'],
  ['Fighters', 'Rankings', '#banzuke', 'The current banzuke'], ['Fighters', 'Banzuke changes', '#changes', 'Who moved up and down, and why'], ['Fighters', 'Stables', 'sumo-stables.html', 'The heya and their wrestlers'],
  ['Analysis', 'Basho review', '#review', 'Every tournament since Nov 2024'], ['Analysis', 'Insights', '#insights', 'Promotion runs, rivalries, stables, records'], ['Analysis', 'Stories', 'sumo-stories.html', 'Sourced facts and records'],
  ['Analysis', 'Techniques', '#kimarite', 'The winning moves, explained']
];
function exploreBlock(h) {
  return '<section class="shome-block">' + head(h, 'Explore sumo') + '<div class="shome-explore">' +
    EXPLORE.map(([g, t, href, s]) => '<a class="shome-card shome-ex" href="' + h.e(href) + '"><small>' + h.e(g) + '</small><strong>' + h.e(t) + '</strong><span>' + h.e(s) + '</span></a>').join('') + '</div></section>';
}

/* The basho in brief: one card each for the champions, gold stars, sanyaku and movers, linking to that
   section of the Basho review, which holds the detail (owner 28 Nov 2026: no repeats between the two). */
function briefBlock(h, d) {
  const faces = ids => '<span class="shome-bf">' + [...new Set(ids)].slice(0, 4).map(id => face(h, id)).join('') + '</span>';
  const cards = [];
  const c = d.headline.champion;
  if (d.finished && d.champions.length) {
    const prizes = d.champions.filter(x => /prize/i.test(x.label)).length;
    cards.push(['champions', 'Champions and prizes', d.champions.map(x => x.id), (c ? c.name + ' won Makuuchi' : 'Division champions') + (prizes ? ' · ' + prizes + ' special prize' + (prizes > 1 ? 's' : '') : '')]);
  }
  const k = d.kinboshi;
  const kn = [...new Set(k.map(x => x.name))];
  cards.push(['stars', 'Gold stars', k.map(x => x.id), k.length ? count(k.length) + ' kinboshi: ' + (kn.length > 3 ? kn.slice(0, 3).join(', ') + ' and ' + (kn.length - 3) + ' more' : andList(kn)) : 'No Maegashira beat a Yokozuna']);
  if (d.sanyaku.length) {
    const kk = d.sanyaku.filter(r => r.wins >= 8).length, flags = d.sanyaku.filter(r => r.flag);
    cards.push(['sanyaku', 'Sanyaku scorecard', (flags.length ? flags : d.sanyaku).map(r => r.id), kk + ' of ' + d.sanyaku.length + ' winning records' + (flags.length ? ' · ' + andList(flags.map(r => r.name + (r.flag === 'kadoban' ? ' kadoban' : ' to Sekiwake'))) : '')]);
  }
  const m = d.movers;
  if (m.up.length || m.down.length) cards.push(['movers', 'On the move', [...m.up, ...m.down].map(x => x.id), (m.up[0] ? m.up[0].name + ' up to ' + plainRank(m.up[0].to) : '') + (m.up[0] && m.down[0] ? ' · ' : '') + (m.down[0] ? m.down[0].name + ' down to ' + plainRank(m.down[0].to) : '')]);
  if (!cards.length) return '';
  return '<section class="shome-block">' + head(h, 'The basho in brief', ['#review', 'Basho review'], 'The detail is in the Basho review.') + '<div class="shome-brief">' +
    cards.map(([at, title, ids, line]) => '<a class="shome-card shome-bcard" href="#review?at=' + at + '">' + faces(ids) + '<span><strong>' + h.e(title) + '</strong><em>' + h.e(line) + '</em></span><b aria-hidden="true">›</b></a>').join('') + '</div></section>';
}

export function renderHome(d, h) {
  /* The next-banzuke card sits under the hero on desktop and above it on phones (CSS order). */
  return '<div class="sumo-home">' + (h.afterHero ? '<div class="shome-next">' + h.afterHero + '</div>' : '') + hero(h, d) + briefBlock(h, d) +
    risingBlock(h, d) + watchBlock(h, d) + (h.extra || '') + factBlock(h, d) + exploreBlock(h) +
    '<p class="shome-source">Worked out from the Sumo API snapshot of the ' + h.e(d.headline.name) + ' basho and BEFN’s saved rank history. Photographs: Japan Sumo Association.</p></div>';
}

/* Shared with the Basho review page (sumo-review.mjs). */
export { face, who, head, championsBlock, starsBlock, sanyakuBlock, moversBlock, exploreBlock };
