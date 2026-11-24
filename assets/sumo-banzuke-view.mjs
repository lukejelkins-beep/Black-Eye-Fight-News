/* BEFN Banzuke changes page (sumo.html#changes/YYYYMM). Renders buildChanges() from
   sumo-banzuke-changes.mjs. h = { e, head(id), cutout(id), known(id), releases: [YYYYMM newest first] }. */
import { face, who, head } from './sumo-home.mjs?v=20261124-banzuke1';
import { plainRank, shortRank, bashoName } from './sumo-home-data.mjs?v=20261124-banzuke1';
import { tableRows } from './sumo-banzuke-changes.mjs?v=20261124-banzuke1';

const n = (k, one, many) => k + ' ' + (k === 1 ? one : many);

function summary(c) {
  const H = c.headline, bits = [];
  if (H.yokozuna.length) bits.push(n(H.yokozuna.length, 'new Yokozuna', 'new Yokozuna'));
  if (H.ozekiUp.length) bits.push(n(H.ozekiUp.length, 'new Ozeki', 'new Ozeki'));
  if (H.ozekiDown.length) bits.push(n(H.ozekiDown.length, 'Ozeki demoted', 'Ozeki demoted'));
  if (!bits.length) bits.push('No change at Yokozuna or Ozeki');
  bits.push(n(H.intoSanyaku.length, 'new face in sanyaku', 'new faces in sanyaku'));
  bits.push(n(H.intoMakuuchi.length, 'promotion to Makuuchi', 'promotions to Makuuchi'));
  bits.push(n(H.intoJuryo.length, 'new or returning sekitori', 'new or returning sekitori'));
  return bits.join(' · ');
}

function picker(h, c) {
  const ids = h.releases || [];
  if (ids.length < 2) return '';
  return '<div class="srev-pick"><label for="sbz-pick">Banzuke</label><select id="sbz-pick" data-changes-select>' +
    ids.map(id => '<option value="' + h.e(id) + '"' + (id === c.bashoId ? ' selected' : '') + '>' + h.e(bashoName(id)) + '</option>').join('') + '</select></div>';
}

function hero(h, c, released) {
  return '<section class="shome-hero srev-hero sbz-hero"><div class="shome-hero-copy"><div class="shome-kicker">Banzuke changes · ranks for the ' + h.e(c.name) + ' basho</div>' +
    '<h1>' + h.e(c.name) + ' banzuke</h1><p>' + h.e(summary(c)) + '. Every move below is read against the wrestler’s record at the ' + h.e(c.previousName) + ' basho.</p>' +
    (released ? '<p class="sbz-released">' + h.e(released) + '</p>' : '') + picker(h, c) + '</div></section>';
}

const line = (h, m, extra) => '<li><span class="sbz-who">' + face(h, m.id) + '<span><strong>' + who(h, m.id, m.name) + '</strong><small>' + h.e(plainRank(m.from)) + ' → ' + h.e(plainRank(m.to)) + ' · ' + h.e(m.record) + '</small></span></span>' + (extra ? '<em>' + h.e(extra) + '</em>' : '') + '</li>';

function topBlock(h, c) {
  const H = c.headline;
  const groups = [['New Yokozuna', H.yokozuna, 'is-up'], ['New Ozeki', H.ozekiUp, 'is-up'], ['Ozeki demoted', H.ozekiDown, 'is-down'], ['Kadoban Ozeki (must win 8 this basho)', H.kadoban, 'is-warn']].filter(g => g[1].length);
  return '<section class="shome-block">' + head(h, 'At the top', ['#banzuke', 'Current rankings']) +
    (groups.length ? '<div class="sbz-groups">' + groups.map(([t, list, cls]) => '<div class="shome-card sbz-group ' + cls + '"><h3>' + h.e(t) + '</h3><ul>' + list.map(m => line(h, m)).join('') + '</ul></div>').join('') + '</div>'
      : '<p class="shome-note">No promotions or demotions at Yokozuna or Ozeki, and no Ozeki is kadoban.</p>') + '</section>';
}

function linesBlock(h, c) {
  const H = c.headline;
  const pair = (title, ins, outs) => '<div class="shome-card sbz-line"><h3>' + h.e(title) + '</h3><div class="sbz-io"><div class="is-up"><div class="shome-colhead">▲ In</div>' +
    (ins.length ? '<ul>' + ins.map(m => line(h, m, m.note)).join('') + '</ul>' : '<p class="shome-note">None</p>') + '</div><div class="is-down"><div class="shome-colhead">▼ Out</div>' +
    (outs.length ? '<ul>' + outs.map(m => line(h, m)).join('') + '</ul>' : '<p class="shome-note">None</p>') + '</div></div></div>';
  return '<section class="shome-block">' + head(h, 'Across the lines', null, 'Who crossed into or out of sanyaku, Makuuchi and Juryo (the salaried sekitori ranks).') +
    pair('Sanyaku', H.intoSanyaku, H.outOfSanyaku) + pair('Makuuchi', H.intoMakuuchi, H.outOfMakuuchi) + pair('Juryo', H.intoJuryo, H.outOfJuryo) + '</section>';
}

function swingBlock(h, c) {
  const col = (title, list, cls) => '<div class="shome-card ' + cls + '"><div class="shome-colhead">' + title + '</div>' + list.map(m => '<div class="shome-mv">' + face(h, m.id) + '<div><strong>' + who(h, m.id, m.name) + '</strong><span>' + h.e(plainRank(m.from)) + ' → ' + h.e(plainRank(m.to)) + '</span></div><em>' + h.e(m.record) + '</em></div>').join('') + '</div>';
  return '<section class="shome-block">' + head(h, 'Biggest climbs and falls', null, 'Makuuchi and Juryo, with the record that earned the move.') +
    '<div class="shome-moves">' + col('▲ Climbs', c.climbs, 'is-up') + col('▼ Falls', c.falls, 'is-down') + '</div></section>';
}

function observationsBlock(h, c) {
  if (!c.observations.length) return '';
  return '<section class="shome-block">' + head(h, 'Worth noticing', null, 'Each is a plain rule applied to the records; the Japan Sumo Association does not publish its reasons.') + '<div class="sbz-obs">' +
    c.observations.map(o => '<div class="shome-card sbz-ob is-' + h.e(o.kind) + '"><h3>' + h.e(o.title) + '</h3><p>' + h.e(o.text) + '</p>' + (o.list.length ? '<ul>' + o.list.map(m => line(h, m)).join('') + '</ul>' : '') + '</div>').join('') + '</div></section>';
}

function tableBlock(h, c) {
  const rows = tableRows(c);
  const tr = m => '<tr><td>' + h.e(shortRank(m.to)) + '</td><td>' + who(h, m.id, m.name) + '</td><td>' + h.e(shortRank(m.from)) + '</td><td>' + h.e(m.record) + '</td><td class="' + (m.change > 0 ? 'is-up' : m.change < 0 ? 'is-down' : '') + '">' + (m.change > 0 ? '▲' : m.change < 0 ? '▼' : '=') + '</td></tr>';
  const table = (list, caption) => '<div class="sbz-scroll"><table class="sbz-table"><caption>' + h.e(caption) + '</caption><thead><tr><th>New rank</th><th>Wrestler</th><th>Was</th><th>Record</th><th><span class="visually-hidden">Move</span></th></tr></thead><tbody>' + list.map(tr).join('') + '</tbody></table></div>';
  const maku = rows.filter(m => m.levelTo >= 3), juryo = rows.filter(m => m.levelTo === 2);
  return '<section class="shome-block">' + head(h, 'The full list') + table(maku, 'Makuuchi') +
    '<details class="sbz-more"><summary>Juryo (' + juryo.length + ')</summary>' + table(juryo, 'Juryo') + '</details></section>';
}

export function renderChanges(c, h, { released } = {}) {
  return '<div class="sumo-home sumo-banzuke">' + hero(h, c, released) + topBlock(h, c) + linesBlock(h, c) + swingBlock(h, c) + observationsBlock(h, c) + tableBlock(h, c) +
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
    return '<div class="sbz-card"><span class="shome-kicker">Next banzuke</span><strong><b>' + h.e(big) + '</b> until the ' + h.e(name) + ' banzuke</strong><span>Expected ' + h.e(when) + ' (Japan time)' +
      (info.status === 'confirmed' ? '' : ', as listed by sumo calendars; the Japan Sumo Association confirms on the day') + '. BEFN checks for it every day.</span>' + latest + '</div>';
  }
  return '<div class="sbz-card"><span class="shome-kicker">Next banzuke</span><strong>The ' + h.e(name) + ' banzuke</strong><span>Published by the Japan Sumo Association before day 1' + (info.day1 ? ' (' + h.e(new Date(info.day1 + 'T12:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', timeZone: 'UTC' })) + ')' : '') + '. BEFN checks for it every day.</span>' + latest + '</div>';
}
