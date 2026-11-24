/* BEFN Sumo live basho mode: the Sumo home during a basho, and the day-by-day recap on the Basho
   review. Renders sumo-live-data.mjs. h = { e, head(id), cutout(id), known(id) }. */
import { face, who, head, sanyakuBlock } from './sumo-home.mjs?v=20261124-live1';
import { shortRank, plainRank, bashoName, bashoStart } from './sumo-home-data.mjs?v=20261124-live1';

const photo = (h, id, cls) => { const s = h.cutout(id); return s ? '<img class="' + cls + '" src="' + h.e(s) + '" alt="" loading="lazy">' : ''; };
const list = (h, a, max = 4) => a.slice(0, max).map(x => who(h, x.id, x.name)).join(', ') + (a.length > max ? ' and ' + (a.length - max) + ' more' : '');

function liveHero(h, d) {
  const r = d.recap, L = r.race.leaders, name = bashoName(d.bashoId);
  const title = r.playoff ? h.e(L.map(x => x.name).join(' and ')) + ' level at <span class="nw">' + L[0].w + '–' + L[0].l + '</span>'
    : L.length === 1 ? h.e(L[0].name) + ' leads at <span class="nw">' + L[0].w + '–' + L[0].l + '</span>'
    : (L.length <= 3 ? h.e(L.map(x => x.name).join(', ').replace(/, ([^,]*)$/, ' and $1')) : L.length + ' wrestlers') + ' share the lead at <span class="nw">' + L[0].w + '–' + L[0].l + '</span>';
  const sub = r.playoff ? 'A playoff decides the title.' : (r.race.daysLeft ? r.race.daysLeft + (r.race.daysLeft === 1 ? ' day' : ' days') + ' left' : 'Final day') +
    (r.race.one.length ? ' · ' + r.race.one.length + ' one behind' : '') + (r.race.two.length ? ' · ' + r.race.two.length + ' two behind' : '');
  const pics = L.slice(0, 3).filter(x => h.cutout(x.id));
  return '<section class="shome-hero slive-hero">' + (d.preview ? '<div class="slive-preview">Preview: ' + h.e(name) + ' replayed as of day ' + r.day + '</div>' : '') +
    '<div class="shome-hero-copy"><div class="shome-kicker"><span class="slive-dot" aria-hidden="true"></span>' + h.e(name) + ' basho · Day ' + r.day + ' of 15</div><h1>' + title + '</h1><p>' + h.e(sub) + '</p>' +
    '<a class="shome-btn" href="#matchups">' + (d.preview ? 'Bouts' : 'Today’s bouts') + ' ›</a><a class="shome-btn is-ghost" href="#basho">Results and standings</a></div>' +
    (pics.length ? '<div class="slive-cast">' + pics.map(x => '<img src="' + h.e(h.cutout(x.id)) + '" alt="' + h.e(x.name) + '">').join('') + '</div>' : '') + '</section>';
}

function raceBlock(h, r) {
  const card = (x, cls) => '<article class="slive-c ' + cls + '">' + photo(h, x.id, 'slive-c-ph') + '<div class="slive-c-bd"><strong>' + who(h, x.id, x.name) + '</strong><span>' + h.e(shortRank(x.rank)) + '</span><b>' + x.w + '–' + x.l + '</b>' +
    (x.notMet.length && cls !== 'is-two' ? '<small>Still to face: ' + x.notMet.map(o => h.e(o.name)).join(', ') + '</small>' : '') + '</div></article>';
  const row = (title, a, cls) => a.length ? '<div class="slive-row"><h3>' + h.e(title) + '</h3><div class="slive-cards">' + a.slice(0, 8).map(x => card(x, cls)).join('') + (a.length > 8 ? '<span class="slive-more">and ' + (a.length - 8) + ' more</span>' : '') + '</div></div>' : '';
  return '<section class="shome-block">' + head(h, 'Title race', ['#basho', 'Full standings'], 'Makuuchi after day ' + r.day + ', by losses. Absences count as losses.') +
    row(r.playoff ? 'Level on the final day' : 'Leaders', r.leaders, 'is-lead') + row('One behind', r.one, '') + (r.day >= 5 ? row('Two behind', r.two, 'is-two') : '') + '</section>';
}

function highlightBlock(h, hi) {
  if (!hi.upset && !hi.kinboshi.length) return '';
  const u = hi.upset;
  const up = u ? '<article class="slive-up"><div class="slive-up-ph">' + photo(h, u.winner.id, 'slive-up-img') + '</div><div class="slive-up-bd"><span class="sin-tag">Upset of the day</span>' +
    '<strong>' + who(h, u.winner.id, u.winner.name) + ' <small>' + h.e(shortRank(u.winner.rank)) + '</small></strong><span>beat ' + face(h, u.loser.id) + ' ' + who(h, u.loser.id, u.loser.name) + ' <small>' + h.e(shortRank(u.loser.rank)) + '</small></span>' +
    (u.kimarite ? '<a href="#kimarite?term=' + h.e(encodeURIComponent(u.kimarite)) + '">' + h.e(u.kimarite) + '</a>' : '') + '</div></article>' : '';
  const kin = hi.kinboshi.map(k => '<article class="slive-up is-gold"><div class="slive-up-ph">' + photo(h, k.winner.id, 'slive-up-img') + '</div><div class="slive-up-bd"><span class="sin-tag is-gold">★ Kinboshi</span>' +
    '<strong>' + who(h, k.winner.id, k.winner.name) + ' <small>' + h.e(shortRank(k.winner.rank)) + '</small></strong><span>beat Yokozuna ' + face(h, k.loser.id) + ' ' + who(h, k.loser.id, k.loser.name) + '</span>' +
    (k.kimarite ? '<a href="#kimarite?term=' + h.e(encodeURIComponent(k.kimarite)) + '">' + h.e(k.kimarite) + '</a>' : '') + '</div></article>').join('');
  return '<section class="shome-block">' + head(h, 'Day ' + hi.day + ' highlights') + '<div class="slive-ups">' + up + kin + '</div></section>';
}

/* The recap card: copy or share the day's summary. */
export function recapCard(h, r, { label } = {}) {
  return '<div class="slive-recap"><div class="shome-kicker">' + h.e(label || 'Day ' + r.day + ' recap') + '</div><p data-recap-text>' + h.e(r.text) + '</p>' +
    '<div class="slive-recap-act"><button type="button" data-recap-copy>Copy</button><button type="button" data-recap-share>Share</button><span class="slive-recap-ok" role="status" aria-live="polite"></span></div></div>';
}

export function renderLiveHome(d, h) {
  if (!d.recap) {
    /* Banzuke out, day 1 not yet fought. */
    const y = Number(String(d.bashoId).slice(0, 4)), m = Number(String(d.bashoId).slice(4));
    const start = new Date(bashoStart(y, m) + 'T12:00:00Z').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    return '<div class="sumo-home sumo-live">' + (h.afterHero ? '<div class="shome-next">' + h.afterHero + '</div>' : '') +
      '<section class="shome-hero slive-hero"><div class="shome-hero-copy"><div class="shome-kicker">' + h.e(bashoName(d.bashoId)) + ' basho</div><h1>Day 1 is ' + h.e(start) + '</h1><p>The banzuke is out. Bouts, the title race and daily highlights start on day 1.</p>' +
      '<a class="shome-btn" href="#changes">Banzuke changes ›</a><a class="shome-btn is-ghost" href="#banzuke">Rankings</a></div></section>' + (h.extra || '') + (h.explore || '') + '</div>';
  }
  return '<div class="sumo-home sumo-live">' + liveHero(h, d) + '<section class="shome-block">' + recapCard(h, d.recap) + '</section>' +
    raceBlock(h, d.recap.race) + highlightBlock(h, d.recap.highlights) +
    '<section class="shome-block">' + sanyakuBlock(h, d.sanyakuView) + '</section>' + (h.extra || '') + (h.explore || '') +
    '<p class="shome-source">From the Sumo API record of the ' + h.e(bashoName(d.bashoId)) + ' basho, refreshed during the tournament. Wins are counted from each wrestler’s bouts.</p></div>';
}

/* Basho review: pick a day, see the recap, leaders and highlights after it. */
export function dayByDay(h, recaps) {
  const days = recaps.filter(Boolean);
  if (!days.length) return '';
  const last = days[days.length - 1].day;
  return '<section class="shome-block slive-days">' + head(h, 'Day by day', null, 'The race, the upset and any kinboshi after each day.') +
    '<div class="slive-daypick" role="group" aria-label="Choose a day">' + days.map(r => '<button type="button" data-recap-day="' + r.day + '" aria-pressed="' + (r.day === last) + '">' + r.day + '</button>').join('') + '</div>' +
    days.map(r => '<div class="slive-daypanel" data-recap-panel="' + r.day + '"' + (r.day === last ? '' : ' hidden') + '>' + recapCard(h, r, { label: 'After day ' + r.day }) +
      '<p class="slive-daylead"><b>' + (r.playoff ? 'Level' : r.race.leaders.length === 1 ? 'Leader' : 'Leaders') + ':</b> ' + list(h, r.race.leaders) + ' (' + r.race.leaders[0].w + '–' + r.race.leaders[0].l + ')' +
      (r.race.one.length ? ' · <b>One behind:</b> ' + list(h, r.race.one) : '') + '</p>' + highlightBlock(h, r.highlights) + '</div>').join('') + '</section>';
}
