/* Home landing page (design D): lead story, this week's fights, one column per sport, latest news.
 * Pure functions so tests run in Node. The page passes its own helpers (esc, safeURL, meta, photo). */
(function (root) {
  'use strict';

  const SPORT = { boxing: 'Boxing', mma: 'MMA', sumo: 'Sumo' };
  const MONTH = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const time = a => Date.parse(a.publishedAt) || 0;
  const dayKey = ms => new Date(ms).toISOString().slice(0, 10);
  const slug = name => String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  /* Boxing and MMA cards from today to 14 days ahead, soonest first, at most six. */
  function fixtures(events, now) {
    const from = dayKey(now), to = dayKey(now + 14 * 86400000);
    return (events || [])
      .filter(e => e && Array.isArray(e.bouts) && e.bouts.length && /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') && e.title && ['boxing', 'mma'].includes(String(e.sport || '').toLowerCase()))
      .filter(e => e.date >= from && e.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.startAt || '').localeCompare(String(b.startAt || '')))
      .slice(0, 6);
  }

  /* Latest finished main bout with a named winner. A recent one whose winner has a cutout wins;
   * otherwise the newest main bout is shown without a picture. Nothing is guessed. */
  function latestResult(results, cutouts, now) {
    const events = results && Array.isArray(results.events) ? results.events : [];
    const bouts = new Map((results && Array.isArray(results.results) ? results.results : []).map(b => [b.id, b]));
    const mains = events
      .filter(e => e.status === 'completed' && e.mainBoutId && bouts.has(e.mainBoutId))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(e => ({ event: e, bout: bouts.get(e.mainBoutId) }))
      .filter(x => Number.isInteger(x.bout.winner) && x.bout.fighters && x.bout.fighters[x.bout.winner] && x.bout.fighters[1 - x.bout.winner]);
    if (!mains.length) return null;
    const recent = dayKey(now - 7 * 86400000);
    const hasCutout = x => cutouts && cutouts[slug(x.bout.fighters[x.bout.winner].name)] && cutouts[slug(x.bout.fighters[x.bout.winner].name)].ok === true;
    const pick = mains.find(x => x.event.date >= recent && hasCutout(x)) || mains[0];
    const w = pick.bout.fighters[pick.bout.winner].name, l = pick.bout.fighters[1 - pick.bout.winner].name;
    return {
      eventName: pick.event.name || pick.bout.event || '', date: pick.event.date,
      winner: w, loser: l, method: pick.bout.method || '', round: pick.bout.round || null,
      cutout: hasCutout(pick) ? 'assets/img/ufc-cutouts/' + slug(w) + '.webp' : ''
    };
  }

  function resultTileHTML(r, h) {
    if (!r) return '';
    const how = r.method ? ' by ' + r.method + (r.round ? ' in round ' + r.round : '') : '';
    return '<div class="lp-result"><div class="lp-result-copy"><div class="lp-kicker">Latest result · ' + h.esc(r.eventName) + '</div>' +
      '<p class="lp-result-title">' + h.esc(r.winner) + ' beats ' + h.esc(r.loser) + h.esc(how) + '</p>' +
      '<a class="lp-button" href="#results">Full result ›</a></div>' +
      (r.cutout ? '<img class="lp-cutout" src="' + h.safeURL(r.cutout) + '" alt="' + h.esc(r.winner) + '" loading="lazy" decoding="async">' : '') + '</div>';
  }

  function leadHTML(a, h) {
    if (!a) return '';
    const photo = h.photo(a);
    const img = photo && photo.url
      ? '<span class="lp-lead-photo"><img class="live-news-image" src="' + h.safeURL(photo.url) + '" alt="' + h.esc(photo.alt || '') + '" loading="eager" decoding="async" referrerpolicy="no-referrer"></span>'
      : '';
    return '<a class="lp-lead" href="' + h.safeURL(a.url) + '" target="_blank" rel="noopener noreferrer" aria-label="Read ' + h.esc(a.title) + '">' + img +
      '<span class="lp-lead-copy"><span class="lp-chip">' + h.esc(SPORT[a.sport] || 'Combat sports') + ' · Lead story</span>' +
      '<span class="lp-lead-title">' + h.esc(a.title) + '</span><span class="lp-meta">' + h.meta(a) + '</span></span></a>';
  }

  function fixtureHTML(e, h) {
    const day = Number(e.date.slice(8, 10)), mon = MONTH[Number(e.date.slice(5, 7)) - 1] || '';
    const sport = String(e.sport).toLowerCase();
    return '<a class="lp-fixture lp-' + sport + '" href="#fights"><span class="lp-date"><b>' + day + '</b><i>' + mon + '</i></span>' +
      '<span class="lp-fixture-copy"><span class="lp-fixture-title">' + h.esc(e.title) + '</span>' +
      '<span class="lp-meta">' + h.esc(SPORT[sport]) + (e.promotion ? ' · ' + h.esc(e.promotion) : '') + '</span></span></a>';
  }

  function columnHTML(key, stories, upcoming, h, opts) {
    if (!stories.length) return '';
    const lead = stories[0], rest = stories.slice(1, 3), photo = h.photo(lead);
    const img = photo && photo.url ? '<span class="lp-col-photo"><img src="' + h.safeURL(photo.url) + '" alt="' + h.esc(photo.alt || '') + '" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>' : '';
    const foot = key === 'sumo'
      ? '<div class="lp-col-foot"><b>Tournament</b><a href="' + h.safeURL(opts.sumoHref) + '">Bouts, standings and head-to-heads ›</a></div>'
      : (upcoming.length ? '<div class="lp-col-foot"><b>Next up</b>' + upcoming.map(e => '<a href="#fights">' + h.esc(e.title) + ' · ' + Number(e.date.slice(8, 10)) + ' ' + MONTH[Number(e.date.slice(5, 7)) - 1] + '</a>').join('') + '</div>' : '');
    const link = (a, cls) => '<a class="' + cls + '" href="' + h.safeURL(a.url) + '" target="_blank" rel="noopener noreferrer">' + h.esc(a.title) + '</a>';
    return '<section class="lp-col lp-' + key + '" aria-label="' + SPORT[key] + ' news"><header class="lp-col-head"><h3>' + SPORT[key] + '</h3>' +
      (key === 'sumo' ? '<a href="' + h.safeURL(opts.sumoHref) + '">Hub ›</a>' : '<a href="#fights">Fights ›</a>') + '</header><div class="lp-col-body">' + img +
      link(lead, 'lp-col-lead') + '<span class="lp-meta">' + h.meta(lead) + '</span>' + rest.map(a => link(a, 'lp-col-item')).join('') + foot +
      (key === 'sumo' ? '<span class="lp-note">Headlines translated by DeepL</span>' : '') + '</div></section>';
  }

  /* ctx: { lead, stories (eligible, newest first), language, events, results, cutouts, now }. */
  function build(ctx, h) {
    const now = ctx.now || Date.now();
    const stories = (ctx.stories || []).filter(a => a && a.url && a.title);
    const lead = ctx.lead || stories[0] || null;
    const others = stories.filter(a => !lead || a.url !== lead.url);
    const fx = fixtures(ctx.events, now);
    const upcoming = sport => (ctx.events || []).filter(e => Array.isArray(e.bouts) && e.bouts.length && String(e.sport).toLowerCase() === sport && e.date >= dayKey(now)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 2);
    const cols = ['boxing', 'mma'].map(k => columnHTML(k, others.filter(a => a.sport === k).sort((a, b) => time(b) - time(a)), upcoming(k), h, ctx))
      .concat(columnHTML('sumo', (ctx.sumo || []).slice(0, 3), [], h, ctx)).filter(Boolean);
    const inCols = new Set();
    ['boxing', 'mma'].forEach(k => others.filter(a => a.sport === k).sort((a, b) => time(b) - time(a)).slice(0, 3).forEach(a => inCols.add(a.url)));
    const latest = others.filter(a => !inCols.has(a.url)).slice(0, 5);
    return '<div class="lp">' +
      '<section class="lp-top" aria-label="Lead story">' + leadHTML(lead, h) + '<div class="lp-side">' + resultTileHTML(latestResult(ctx.results, ctx.cutouts, now), h) + '</div></section>' +
      (fx.length ? '<section class="lp-section" aria-label="This week and next"><div class="lp-head"><h2>This week and next</h2><a href="#fights">Full schedule ›</a></div><div class="lp-fixtures">' + fx.map(e => fixtureHTML(e, h)).join('') + '</div></section>' : '') +
      (cols.length ? '<section class="lp-section" aria-label="By sport"><div class="lp-head"><h2>By sport</h2></div><div class="lp-cols">' + cols.join('') + '</div></section>' : '') +
      '<section class="lp-section lp-bottom"><div><div class="lp-head"><h2>Latest news</h2><a href="#news">All stories ›</a></div><div class="lp-latest">' +
      latest.map(a => '<a class="lp-latest-row" href="' + h.safeURL(a.url) + '" target="_blank" rel="noopener noreferrer"><span class="lp-tag">' + h.esc(SPORT[a.sport] || 'Combat sports') + '</span><span class="lp-latest-title">' + h.esc(a.title) + '</span><span class="lp-meta">' + h.meta(a) + '</span></a>').join('') +
      '</div></div><aside class="lp-talk"><div class="lp-kicker">Fight Talk</div><p>What fighters and promoters are posting, each with its source and date.</p><a class="lp-button" href="#social">Open Fight Talk ›</a></aside></section></div>';
  }

  const api = { fixtures, latestResult, build, slug };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BEFNLanding = api;
})(typeof window !== 'undefined' ? window : globalThis);
