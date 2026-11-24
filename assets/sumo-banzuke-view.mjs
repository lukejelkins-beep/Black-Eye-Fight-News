/* BEFN Banzuke changes page (sumo.html#changes/YYYYMM), design A with a desktop slope chart
   (owner, 24 Nov 2026: "A but I want a slope chart on desktop"). Renders buildChanges() from
   sumo-banzuke-changes.mjs. h = { e, head(id), cutout(id), known(id), releases: [YYYYMM newest first] }. */
import { face, who } from './sumo-home.mjs?v=20261124-banzuke2';
import { shortRank, bashoName, position, tierOf, parseRank } from './sumo-home-data.mjs?v=20261124-banzuke2';

/* Move size: exact rank numbers within Maegashira or Juryo; otherwise an arrow only, because
   division sizes vary and a place count across divisions would be an estimate. */
function moveLabel(m) {
  if (m.change === 0) return '<b class="sbz-eq" aria-label="No change">–</b>';
  const up = m.change > 0, a = parseRank(m.from), b = parseRank(m.to);
  const same = a && b && a.tier === b.tier && (a.tier === 'Maegashira' || a.tier === 'Juryo');
  const n = same ? Math.abs(a.number - b.number) : 0;
  const text = (up ? '▲' : '▼') + (n ? ' ' + n : '');
  return '<b class="' + (up ? 'sbz-up' : 'sbz-dn') + '" aria-label="' + (up ? 'Up' : 'Down') + (n ? ' ' + n : '') + '">' + text + '</b>';
}

/* One tag per wrestler for the line he crossed or his Ozeki status. */
function tags(c) {
  const H = c.headline, t = new Map();
  const put = (list, label, cls) => list.forEach(m => { if (!t.has(m.id)) t.set(m.id, { label: label || m.note, cls }); });
  put(H.yokozuna, 'New Yokozuna', 'up'); put(H.ozekiUp, 'New Ozeki', 'up'); put(H.ozekiDown, 'Ozeki demoted', 'dn'); put(H.kadoban, 'Kadoban', 'warn');
  put(H.intoSanyaku, null, 'up'); put(H.outOfSanyaku, 'Out of sanyaku', 'dn');
  put(H.intoMakuuchi, null, 'up'); put(H.outOfMakuuchi, 'Out of Makuuchi', 'dn');
  put(H.intoJuryo, null, 'up'); put(H.outOfJuryo, 'Out of Juryo', 'dn');
  return t;
}

/* The wrestlers behind the headline moves, as overlapping cut-outs in the hero. */
function cast(h, c) {
  const H = c.headline, seen = new Set(), people = [];
  for (const m of [...H.yokozuna, ...H.ozekiUp, ...H.ozekiDown, ...H.kadoban, ...H.intoSanyaku, ...H.intoMakuuchi.filter(x => /debut/.test(x.note)), ...c.climbs])
    if (!seen.has(m.id) && h.cutout(m.id)) { seen.add(m.id); people.push(m); }
  if (!people.length) return '';
  return '<div class="sbz-cast" aria-hidden="true">' + people.slice(0, 5).map((m, i) => '<img src="' + h.e(h.cutout(m.id)) + '" alt="" style="z-index:' + (10 - i) + '">').join('') + '</div>';
}
function hero(h, c, released) {
  const H = c.headline;
  const tiles = [[H.yokozuna.length + H.ozekiUp.length, 'Promoted to Ozeki or above'], [H.ozekiDown.length, 'Ozeki demoted'], [H.kadoban.length, 'Kadoban Ozeki'],
    [H.intoSanyaku.length, 'Into sanyaku'], [H.intoMakuuchi.length, 'Up to Makuuchi'], [H.intoJuryo.length, 'New or returning sekitori']].filter(([n], i) => n > 0 || i >= 3);
  const ids = h.releases || [];
  return '<section class="sbz-hero"><div class="sbz-hero-in"><div><div class="shome-kicker">Banzuke changes · ' + h.e(c.name) + '</div><h1>' + h.e(c.name) + ' banzuke</h1>' +
    '<p>Each move read against the wrestler’s record at the ' + h.e(c.previousName) + ' basho.</p>' + (released ? '<p class="sbz-released">' + h.e(released) + '</p>' : '') +
    '<div class="sbz-tiles">' + tiles.map(([n, l]) => '<div class="sbz-tile"><b>' + n + '</b><span>' + h.e(l) + '</span></div>').join('') + '</div></div>' +
    cast(h, c) +
    (ids.length > 1 ? '<div class="sbz-pick"><label for="sbz-pick">Banzuke</label><select id="sbz-pick" data-changes-select>' + ids.map(id => '<option value="' + h.e(id) + '"' + (id === c.bashoId ? ' selected' : '') + '>' + h.e(bashoName(id)) + '</option>').join('') + '</select></div>' : '') +
    '</div></section>';
}

function stories(h, c) {
  const H = c.headline, list = [];
  const add = (arr, label, cls) => arr.forEach(m => { if (!list.some(x => x.m.id === m.id)) list.push({ m, label: label || m.note, cls }); });
  add(H.yokozuna, 'New Yokozuna', 'up'); add(H.ozekiUp, 'New Ozeki', 'up'); add(H.ozekiDown, 'Ozeki demoted', 'dn'); add(H.kadoban, 'Kadoban', 'warn');
  add(H.intoSanyaku, null, 'up'); add(H.outOfSanyaku, 'Out of sanyaku', 'dn');
  add(H.intoMakuuchi.filter(m => /debut/.test(m.note)), null, 'up'); add(H.intoJuryo.filter(m => /New sekitori/.test(m.note)), null, 'up');
  if (!list.length) return '';
  return '<div class="sbz-stories" aria-label="Biggest stories">' + list.slice(0, 10).map(({ m, label, cls }) => {
    const img = h.cutout(m.id);
    return '<article class="sbz-sc is-' + cls + '"><div class="sbz-ph">' + (img ? '<img src="' + h.e(img) + '" alt="" loading="lazy">' : '') + '</div><div class="sbz-bd"><span class="sbz-tag">' + h.e(label) + '</span>' +
      '<strong>' + who(h, m.id, m.name) + '</strong><span class="sbz-mv">' + h.e(shortRank(m.from)) + ' → ' + h.e(shortRank(m.to)) + '</span><span class="sbz-rec">' + h.e(m.record) + ' in ' + h.e(c.previousName.split(' ')[0]) + '</span></div></article>';
  }).join('') + '</div>';
}

/* Desktop slope chart: everyone in Makuuchi on either banzuke, old rank left, new rank right. */
function slope(h, c, tagMap) {
  const people = c.moves.filter(m => m.levelFrom >= 3 || m.levelTo >= 3);
  if (people.length < 10) return '';
  const left = people.slice().sort((a, b) => position(a.from) - position(b.from)), right = people.slice().sort((a, b) => position(a.to) - position(b.to));
  const row = 21, top = 34, W = 860, x1 = 250, x2 = W - 250;
  const yL = new Map(left.map((m, i) => [m.id, top + i * row])), yR = new Map(right.map((m, i) => [m.id, top + i * row]));
  const H = top + people.length * row + 6;
  const strong = m => tagMap.has(m.id) || Math.abs(m.change) >= 10;
  const col = m => m.change > 0 ? 'var(--sh-up)' : m.change < 0 ? 'var(--sh-down)' : '#bdb6ad';
  const sanyakuEnd = right.findIndex(m => tierOf(m.to) === 'Maegashira' || tierOf(m.to) === 'Juryo');
  const esc = h.e;
  return '<section class="shome-block sbz-chart-wrap"><div class="shome-head"><h2>The reshuffle at a glance</h2></div><p class="shome-sub-line">Makuuchi, ' + esc(c.previousName) + ' rank on the left and ' + esc(c.name) + ' rank on the right. Green climbed, red fell; thick lines crossed a line or moved ten places or more.</p>' +
    '<div class="shome-card sbz-chart"><svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Slope chart of Makuuchi rank changes; the same moves are listed below">' +
    '<text x="' + x1 + '" y="18" text-anchor="end" class="sbz-ax">' + esc(c.previousName) + '</text><text x="' + x2 + '" y="18" class="sbz-ax">' + esc(c.name) + '</text>' +
    (sanyakuEnd > 0 ? '<line x1="' + (x2 - 4) + '" x2="' + W + '" y1="' + (top + (sanyakuEnd - .5) * row + 4) + '" y2="' + (top + (sanyakuEnd - .5) * row + 4) + '" class="sbz-sep"/><text x="' + (W - 4) + '" y="' + (top + (sanyakuEnd - .5) * row) + '" text-anchor="end" class="sbz-sept">sanyaku</text>' : '') +
    left.filter(m => !strong(m)).concat(left.filter(strong)).map(m => '<line x1="' + (x1 + 6) + '" y1="' + yL.get(m.id) + '" x2="' + (x2 - 6) + '" y2="' + yR.get(m.id) + '" stroke="' + col(m) + '" stroke-width="' + (strong(m) ? 3 : 1.2) + '" opacity="' + (strong(m) ? 1 : .45) + '"/>').join('') +
    left.map(m => (strong(m) && h.head(m.id) ? '<image href="' + esc(h.head(m.id)) + '" x="' + (x1 - 20) + '" y="' + (yL.get(m.id) - 9) + '" width="18" height="18"/>' : '') +
      '<text x="' + (strong(m) && h.head(m.id) ? x1 - 24 : x1) + '" y="' + (yL.get(m.id) + 4) + '" text-anchor="end" class="sbz-lb' + (strong(m) ? ' is-s' : '') + '">' + esc(m.name) + ' <tspan class="sbz-rk">' + esc(shortRank(m.from)) + ' · ' + esc(m.record) + '</tspan></text>').join('') +
    right.map(m => (strong(m) && h.head(m.id) ? '<image href="' + esc(h.head(m.id)) + '" x="' + (x2 + 2) + '" y="' + (yR.get(m.id) - 9) + '" width="18" height="18"/>' : '') +
      '<text x="' + (strong(m) && h.head(m.id) ? x2 + 24 : x2) + '" y="' + (yR.get(m.id) + 4) + '" class="sbz-lb' + (strong(m) ? ' is-s' : '') + '"><tspan class="sbz-rk">' + esc(shortRank(m.to)) + '</tspan> ' + esc(m.name) + '</text>').join('') +
    '</svg></div></section>';
}

/* Biggest climbs and falls in Makuuchi and Juryo, as photo cards. */
function swings(h, c) {
  if (!c.climbs.length && !c.falls.length) return '';
  const card = (m, dir) => {
    const img = h.cutout(m.id);
    return '<article class="sbz-sw is-' + dir + '"><div class="sbz-sw-ph">' + (img ? '<img src="' + h.e(img) + '" alt="" loading="lazy">' : '<span aria-hidden="true">相</span>') + '<span class="sbz-sw-mv">' + moveLabel(m) + '</span></div>' +
      '<div class="sbz-sw-bd"><strong>' + who(h, m.id, m.name) + '</strong><span>' + h.e(shortRank(m.from)) + ' → ' + h.e(shortRank(m.to)) + '</span><span class="sbz-rc ' + (m.winning ? 'is-w' : 'is-l') + '">' + h.e(m.record) + '</span></div></article>';
  };
  const rail = (title, list, dir) => list.length ? '<div class="sbz-rail-wrap"><h3 class="sbz-rail-h is-' + dir + '">' + title + '</h3><div class="sbz-rail">' + list.map(m => card(m, dir)).join('') + '</div></div>' : '';
  return '<section class="shome-block">' + rail('▲ Biggest climbs', c.climbs, 'up') + rail('▼ Biggest falls', c.falls, 'dn') + '</section>';
}
function list(h, c, tagMap) {
  const row = m => {
    const t = tagMap.get(m.id);
    const dir = m.change > 0 ? 'up' : m.change < 0 ? 'dn' : 'eq';
    return '<div class="sbz-row is-' + dir + '" data-dir="' + dir + '" data-cross="' + (t ? 1 : 0) + '" data-win="' + (m.winning ? 1 : 0) + '">' +
      '<span class="sbz-nr">' + h.e(shortRank(m.to)) + '</span>' + face(h, m.id) + '<span class="sbz-nm"><strong>' + who(h, m.id, m.name) + '</strong>' + (t ? '<em class="is-' + t.cls + '">' + h.e(t.label) + '</em>' : '') + '</span>' +
      '<span class="sbz-was">from ' + h.e(shortRank(m.from)) + '</span><span class="sbz-rc ' + (m.winning ? 'is-w' : 'is-l') + '">' + h.e(m.record) + '</span><span class="sbz-dl">' + moveLabel(m) + '</span></div>';
  };
  const maku = c.moves.filter(m => m.levelTo >= 3), juryo = c.moves.filter(m => m.levelTo === 2), leftJuryo = c.moves.filter(m => m.levelFrom === 2 && m.levelTo === 1);
  const filters = [['all', 'All'], ['up', '▲ Up'], ['dn', '▼ Down'], ['cross', 'Crossed a line'], ['win', 'Winning record']];
  return '<div class="sbz-main"><div class="sbz-filters" role="group" aria-label="Filter the list">' + filters.map(([k, l], i) => '<button type="button" data-bz-filter="' + k + '" aria-pressed="' + (i === 0) + '">' + h.e(l) + '</button>').join('') + '</div>' +
    '<div class="sbz-list" data-filter="all"><h3 class="sbz-dh">Makuuchi</h3>' + maku.map(row).join('') + '<p class="sbz-empty">No wrestlers match this filter.</p>' +
    '<details class="sbz-juryo"><summary class="sbz-dh">Juryo (' + juryo.length + ')' + (leftJuryo.length ? ' and left Juryo (' + leftJuryo.length + ')' : '') + '</summary>' + juryo.map(row).join('') +
    (leftJuryo.length ? '<h3 class="sbz-dh">Left Juryo</h3>' + leftJuryo.map(row).join('') : '') + '</details></div></div>';
}

function sidebar(h, c) {
  if (!c.observations.length) return '<aside class="sbz-side"></aside>';
  return '<aside class="sbz-side"><h2 class="sbz-side-h">Worth noticing</h2><p class="shome-note">Plain rules applied to the records; the Japan Sumo Association does not publish its reasons.</p>' +
    c.observations.map(o => '<div class="shome-card sbz-ob"><h3>' + h.e(o.title) + '</h3><p>' + h.e(o.text) + '</p>' + (o.list.length ? '<ul>' + o.list.map(m => '<li>' + face(h, m.id) + '<span class="sbz-ob-t">' + who(h, m.id, m.name) + ' <span>' + h.e(shortRank(m.from)) + ' → ' + h.e(shortRank(m.to)) + ' · ' + h.e(m.record) + '</span></span></li>').join('') + '</ul>' : '') + '</div>').join('') + '</aside>';
}

export function renderChanges(c, h, { released } = {}) {
  const tagMap = tags(c);
  return '<div class="sumo-home sumo-banzuke">' + hero(h, c, released) + stories(h, c) + slope(h, c, tagMap) +
    swings(h, c) + '<section class="shome-block sbz-grid">' + list(h, c, tagMap) + sidebar(h, c) + '</section>' +
    '<p class="shome-source">From the saved Sumo API banzuke for ' + h.e(c.name) + ' and the ' + h.e(c.previousName) + ' results. Wins are counted from each wrestler’s bouts; absences count as losses for a winning or losing record.</p></div>';
}

/* The Sumo home's countdown or "it's out" card. info = { next: {id, month}, date, status, released, day1, now } */
export function releaseCard(h, info) {
  const name = bashoName(info.next.id);
  if (info.released) return '<a class="sbz-card is-out" href="#changes/' + h.e(info.next.id) + '"><span class="shome-kicker">New banzuke</span><strong>The ' + h.e(name) + ' banzuke is out</strong><span>See who moved up and down ›</span></a>';
  const latest = info.latest ? '<a href="#changes/' + h.e(info.latest) + '">Last time: the ' + h.e(bashoName(info.latest)) + ' changes ›</a>' : '';
  if (info.date) {
    const days = Math.ceil((Date.parse(info.date + 'T00:00:00+09:00') - info.now) / 86400000);
    const when = new Date(info.date + 'T12:00:00+09:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Tokyo' });
    const big = days > 1 ? days + ' days' : days === 1 ? 'Tomorrow' : 'Due now';
    const short = new Date(info.date + 'T12:00:00+09:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Asia/Tokyo' });
    return '<div class="sbz-card"><span class="shome-kicker">Next banzuke</span><strong><b>' + h.e(big) + '</b> until the ' + h.e(name) + ' banzuke<span class="sbz-card-date"> · ' + h.e(short) + '</span></strong><span class="sbz-card-more">Expected ' + h.e(when) + ' (Japan time)' +
      (info.status === 'confirmed' ? '' : ', as listed by sumo calendars; the Japan Sumo Association confirms on the day') + '. BEFN checks for it every day.</span>' + latest + '</div>';
  }
  return '<div class="sbz-card"><span class="shome-kicker">Next banzuke</span><strong>The ' + h.e(name) + ' banzuke</strong><span>Published by the Japan Sumo Association before day 1' + (info.day1 ? ' (' + h.e(new Date(info.day1 + 'T12:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', timeZone: 'UTC' })) + ')' : '') + '. BEFN checks for it every day.</span>' + latest + '</div>';
}
