/* News page, design A "Front page + timeline" (owner, 25 Nov 2026).
 * Page head, sport chips and Latest / Most covered, a top section of up to four stories that have
 * their own photo, the translated sumo box, then a day-grouped timeline.
 * Pure functions so tests run them in Node; the page passes in esc, safeURL and the fighter names.
 * Times are the visitor's own: "58m ago" under 24 hours, otherwise "Tue 24 Nov". No zone names. */
(function (root) {
  'use strict';

  const SPORT = { boxing: 'Boxing', mma: 'MMA', sumo: 'Sumo' };
  const PAGE = 20;
  const time = a => Date.parse(a && a.publishedAt) || 0;
  const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

  /* ---- Local time ---- */
  function parts(ms, tz) {
    const o = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
    if (tz) o.timeZone = tz;
    const p = {};
    new Intl.DateTimeFormat('en-GB', o).formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
    return p;
  }
  function dayKey(ms, tz) { const p = parts(ms, tz); return p.year + ' ' + p.month + ' ' + p.day; }
  function shortDate(ms, tz) { const p = parts(ms, tz); return p.weekday + ' ' + p.day + ' ' + p.month; }

  /* "just now", "58m ago", "3h ago" inside 24 hours; otherwise the visitor's local date, "Tue 24 Nov". */
  function relTime(iso, now, tz) {
    const t = typeof iso === 'number' ? iso : Date.parse(iso);
    if (!Number.isFinite(t)) return '';
    const n = Number.isFinite(now) ? now : Date.now();
    const m = Math.floor((n - t) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    if (m < 24 * 60) return Math.floor(m / 60) + 'h ago';
    return shortDate(t, tz);
  }

  function dayLabel(iso, now, tz) {
    const t = typeof iso === 'number' ? iso : Date.parse(iso);
    const n = Number.isFinite(now) ? now : Date.now();
    const k = dayKey(Math.min(t, n), tz);
    if (k === dayKey(n, tz)) return 'Today';
    if (k === dayKey(n - 86400000, tz) || k === dayKey(n - 86400000 + 3600000, tz)) return 'Yesterday';
    return shortDate(t, tz);
  }

  /* ---- Images: only the publisher's own photo counts. ---- */
  /* Photos that failed to load in this visit count as no photo, so a redraw does not try them again. */
  const failed = new Set();
  function realImage(a) {
    const u = a && a.image && typeof a.image === 'object' ? a.image.url : '';
    return typeof u === 'string' && /^https:\/\//.test(u) && !failed.has(u) ? u : '';
  }

  /* ---- Duplicate groups ----
   * Two existing sources, no new similarity rule:
   * 1. publishing-time deduplication (scripts/news_dedupe.py): each kept story names the other outlets in
   *    `alsoCoveredBy`, and `deduplication.examples` keeps the removed copies' links (`keptUrl` points at the kept one);
   * 2. the display-time rule in assets/news-dedupe.js (BEFNNewsClusters), which folds any copies still in the feed. */
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; } }

  function buildClusters(articles, dedup, clusterFn) {
    const list = Array.isArray(articles) ? articles : [];
    const groups = typeof clusterFn === 'function' ? clusterFn(list) : list.map(item => ({ item, dupes: [] }));
    const examples = dedup && Array.isArray(dedup.examples) ? dedup.examples : [];
    return groups.map(g => {
      const a = g.item, members = [a].concat(g.dupes || []);
      const urls = new Set(members.map(m => m.url));
      const others = [], seen = new Set([norm(a.source)]);
      const add = (source, url, title) => {
        const k = norm(source);
        if (!k || seen.has(k)) return;
        seen.add(k); others.push({ source, url: url && /^https:\/\//.test(url) ? url : '', title: title || '' });
      };
      (g.dupes || []).forEach(d => add(d.source, d.url, d.title));
      const names = [];
      members.forEach(m => (Array.isArray(m.alsoCoveredBy) ? m.alsoCoveredBy : []).forEach(n => { if (!names.includes(n)) names.push(n); }));
      const ownHost = hostOf(a.url);
      const removed = examples.filter(e => e && urls.has(e.keptUrl) && e.url && hostOf(e.url) !== ownHost);
      const unmatched = [];
      removed.forEach(e => {
        const host = hostOf(e.url).replace(/[^a-z0-9]/g, '');
        const name = names.find(n => norm(n) && host.includes(norm(n)));
        if (name) add(name, e.url, e.title); else unmatched.push(e);
      });
      const left = names.filter(n => !seen.has(norm(n)));
      if (left.length === 1 && unmatched.length === 1) { add(left[0], unmatched[0].url, unmatched[0].title); unmatched.length = 0; }
      unmatched.forEach(e => add(hostOf(e.url), e.url, e.title));
      names.forEach(n => add(n, '', ''));
      return { story: a, others, size: 1 + others.length };
    });
  }

  function order(clusters, sort) {
    const by = sort === 'covered'
      ? (x, y) => y.size - x.size || time(y.story) - time(x.story)
      : (x, y) => time(y.story) - time(x.story);
    return clusters.slice().sort(by);
  }

  /* Up to four stories with their own photo, in the current order. */
  function pickTop(ordered, max) {
    return ordered.filter(c => realImage(c.story)).slice(0, max || 4);
  }

  /* ---- Fighter names: exact spelling only, from the names the page passes in. ---- */
  function nameMatcher(entries) {
    const byName = new Map();
    (entries || []).forEach(e => {
      if (!e || !e.name || !e.id) return;
      const k = e.name.replace(/[‘’]/g, "'");
      if (byName.has(k) && byName.get(k) !== e.id) byName.set(k, null); else byName.set(k, e.id);
    });
    const names = [...byName.keys()].filter(n => byName.get(n)).sort((a, b) => b.length - a.length);
    if (!names.length) return null;
    const quote = s => s.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
    const re = new RegExp('(^|[^\\p{L}\\p{N}])(' + names.map(quote).join('|') + ')(?=$|[^\\p{L}\\p{N}])', 'gu');
    return { re, byName };
  }

  function titleHTML(title, matcher, h) {
    const t = String(title || '');
    if (!matcher) return h.esc(t);
    const flat = t.replace(/[‘’]/g, "'");
    let out = '', pos = 0;
    const done = new Set();
    matcher.re.lastIndex = 0;
    for (const m of flat.matchAll(matcher.re)) {
      const at = m.index + m[1].length, name = m[2], id = matcher.byName.get(name);
      if (!id || done.has(id) || at < pos) continue;
      done.add(id);
      out += h.esc(t.slice(pos, at)) + '<a class="nwa-name" href="#fighter/' + h.esc(encodeURIComponent(id)) + '" aria-label="' + h.esc(t.slice(at, at + name.length)) + ': fighter profile">' + h.esc(t.slice(at, at + name.length)) + '</a>';
      pos = at + name.length;
    }
    return out + h.esc(t.slice(pos));
  }

  /* ---- Pieces ---- */
  let uid = 0;
  function sportTag(a) {
    const s = SPORT[a.sport] ? a.sport : '';
    return s ? '<span class="nwa-sport nwa-sp-' + s + '">' + SPORT[s] + '</span><span class="nwa-dot" aria-hidden="true">·</span>' : '';
  }
  function timeTag(a, now, tz) {
    const t = time(a);
    if (!t) return '';
    const indexed = Boolean(a.timeBasis);
    return '<span class="nwa-dot" aria-hidden="true">·</span><time datetime="' + new Date(t).toISOString() + '" data-nwa-rel="' + t + '"' +
      (indexed ? ' data-nwa-pre="indexed " title="When the story was indexed; the publisher gave no publication time"' : '') + '>' +
      (indexed ? 'indexed ' : '') + relTime(t, now, tz) + '</time>';
  }
  function outletsButton(c, id, h) {
    const n = c.others.length;
    if (!n) return '';
    return '<span class="nwa-dot" aria-hidden="true">·</span><button type="button" class="nwa-outlets-btn" data-nwa-outlets aria-expanded="false" aria-controls="' + id + '">+' + n + ' outlet' + (n === 1 ? '' : 's') + '</button>';
  }
  function outletsList(c, id, h) {
    if (!c.others.length) return '';
    return '<ul class="nwa-outlets" id="' + id + '" hidden>' + c.others.map(o => '<li>' +
      (o.url ? '<a href="' + h.safeURL(o.url) + '" target="_blank" rel="noopener noreferrer"><strong>' + h.esc(o.source) + '</strong>' + (o.title ? ' · ' + h.esc(o.title) : '') + ' <span aria-hidden="true">↗</span></a>'
        : '<span class="nwa-outlet-plain"><strong>' + h.esc(o.source) + '</strong> · also ran this story</span>') +
      '</li>').join('') + '</ul>';
  }
  function meta(c, id, o, h) {
    const a = c.story;
    return '<p class="nwa-meta">' + sportTag(a) + '<span class="nwa-src">' + h.esc(a.source || 'Publisher') + '</span>' + timeTag(a, o.now, o.tz) + outletsButton(c, id, h) + '</p>';
  }
  function hit(a, h) {
    return '<a class="nwa-hit" href="' + h.safeURL(a.url) + '" target="_blank" rel="noopener noreferrer" aria-label="' + h.esc(a.title) + ' (' + h.esc(a.source || 'publisher') + ')"></a>';
  }
  function img(url, h, cls) {
    return '<span class="' + cls + '"><img src="' + h.safeURL(url) + '" alt="" loading="' + (cls === 'nwa-thumb' ? 'lazy' : 'eager') + '" decoding="async" referrerpolicy="no-referrer" data-nwa-img data-src="' + h.esc(url) + '"></span>';
  }

  function leadHTML(c, o, h) {
    const a = c.story, id = 'nwa-o' + (++uid);
    return '<article class="nwa-lead" data-sport="' + h.esc(a.sport) + '">' + hit(a, h) + img(realImage(a), h, 'nwa-lead-img') +
      '<div class="nwa-lead-copy">' + meta(c, id, o, h) + '<h2 class="nwa-lead-title">' + titleHTML(a.title, o.matcher, h) + '</h2>' + outletsList(c, id, h) + '</div></article>';
  }
  function compactHTML(c, o, h) {
    const a = c.story, id = 'nwa-o' + (++uid);
    return '<article class="nwa-card" data-sport="' + h.esc(a.sport) + '">' + hit(a, h) + img(realImage(a), h, 'nwa-card-img') +
      '<div class="nwa-card-copy">' + meta(c, id, o, h) + '<h3 class="nwa-card-title">' + titleHTML(a.title, o.matcher, h) + '</h3>' + outletsList(c, id, h) + '</div></article>';
  }
  function rowHTML(c, o, h) {
    const a = c.story, id = 'nwa-o' + (++uid), pic = realImage(a);
    return '<article class="nwa-row' + (pic ? ' has-img' : '') + '" data-sport="' + h.esc(a.sport) + '" data-url="' + h.esc(a.url) + '">' + hit(a, h) +
      (pic ? img(pic, h, 'nwa-thumb') : '') +
      '<div class="nwa-row-copy">' + meta(c, id, o, h) + '<h3 class="nwa-row-title">' + titleHTML(a.title, o.matcher, h) + '</h3>' + outletsList(c, id, h) + '</div></article>';
  }

  function topHTML(top, o, h) {
    if (!top.length) return '';
    const [lead, ...rest] = top;
    return '<section class="nwa-top' + (rest.length ? '' : ' is-single') + '" aria-label="Top stories">' + leadHTML(lead, o, h) +
      (rest.length ? '<div class="nwa-side">' + rest.map(c => compactHTML(c, o, h)).join('') + '</div>' : '') + '</section>';
  }

  /* Translated sumo headlines: one per publisher first, newest first; the rest open in place. */
  function sumoPick(stories, n) {
    const all = (stories || []).slice().sort((a, b) => time(b) - time(a)), first = [], seen = new Set();
    for (const s of all) if (first.length < n && !seen.has(s.source)) { seen.add(s.source); first.push(s); }
    for (const s of all) if (first.length < n && !first.includes(s)) first.push(s);
    first.sort((a, b) => time(b) - time(a));
    return { first, rest: all.filter(s => !first.includes(s)) };
  }
  function sumoBoxHTML(stories, o, h) {
    if (!stories || !stories.length) return '';
    const { first, rest } = sumoPick(stories, 3);
    const provider = (stories.find(s => s.translationProvider) || {}).translationProvider;
    const li = s => '<li><a href="' + h.safeURL(s.url) + '" target="_blank" rel="noopener noreferrer" lang="en"><span class="nwa-sumo-title">' + h.esc(s.title) + '</span>' +
      '<span class="nwa-sumo-meta">' + h.esc(s.source || 'Publisher') + (time(s) ? ' · ' + '<time datetime="' + new Date(time(s)).toISOString() + '" data-nwa-rel="' + time(s) + '">' + relTime(time(s), o.now, o.tz) + '</time>' : '') + '</span></a></li>';
    return '<section class="nwa-sumo" aria-labelledby="nwa-sumo-h"><div class="nwa-sumo-head"><h2 id="nwa-sumo-h">Sumo news from Japan</h2>' +
      '<span class="nwa-note">translated' + (provider ? ' by ' + h.esc(provider) : '') + '</span></div>' +
      '<ul class="nwa-sumo-list">' + first.map(li).join('') + '</ul>' +
      (rest.length ? '<ul class="nwa-sumo-list" id="nwa-sumo-more" hidden>' + rest.map(li).join('') + '</ul>' +
        '<button type="button" class="nwa-pill" data-nwa-sumo-more aria-expanded="false" aria-controls="nwa-sumo-more" data-label="More from Japan (' + rest.length + ')">More from Japan (' + rest.length + ')</button>' : '') +
      '</section>';
  }

  /* Timeline: day groups for Latest; one list for Most covered. */
  function timelineHTML(rows, o, h) {
    const page = Math.max(1, o.page || 1), shown = rows.slice(0, page * PAGE);
    if (!rows.length) return o.emptyText ? '<p class="nwa-empty">' + h.esc(o.emptyText) + '</p>' : '';
    let html = '';
    if (o.sort === 'covered') {
      html = '<div class="nwa-day"><h2>Most covered first</h2>' + shown.map(c => rowHTML(c, o, h)).join('') + '</div>';
    } else {
      let label = null;
      shown.forEach(c => {
        const l = dayLabel(time(c.story), o.now, o.tz);
        if (l !== label) { html += (label === null ? '' : '</div>') + '<div class="nwa-day"><h2>' + h.esc(l) + '</h2>'; label = l; }
        html += rowHTML(c, o, h);
      });
      html += '</div>';
    }
    const more = shown.length < rows.length ? '<button type="button" class="nwa-pill nwa-morebtn" data-news-more>More news</button>' : '';
    return '<div class="nwa-timeline">' + html + '</div>' + more;
  }

  function chipsHTML(view, sort, h) {
    const b = (attr, v, label, on) => '<button type="button" class="nwa-chip" ' + attr + '="' + v + '" aria-pressed="' + on + '">' + label + '</button>';
    return '<div class="nwa-chips"><div class="nwa-chip-group" role="group" aria-label="Sport">' +
      [['all', 'All'], ['boxing', 'Boxing'], ['mma', 'MMA'], ['sumo', 'Sumo']].map(([v, l]) => b('data-nwa-sport', v, l, view === v)).join('') +
      '</div>' + (view === 'sumo' ? '' : '<div class="nwa-chip-group nwa-sort" role="group" aria-label="Order">' +
      b('data-nwa-sort', 'latest', 'Latest', sort !== 'covered') + b('data-nwa-sort', 'covered', 'Most covered', sort === 'covered') + '</div>') + '</div>';
  }

  const CONTEXT = {
    all: 'Boxing, MMA and sumo from the publishers that cover them',
    boxing: 'Boxing from the publishers that cover it',
    mma: 'MMA from the publishers that cover it',
    sumo: 'Sumo headlines from Japanese publishers, translated'
  };

  /* model: {view, sort, page, clusters (already filtered to the view), sumo (translated stories), updatedAt,
   *         names (matcher entries), now, tz, loading} */
  function build(model) {
    const m = model || {}, o = { now: Number.isFinite(m.now) ? m.now : Date.now(), tz: m.tz, matcher: nameMatcher(m.names), sort: m.sort === 'covered' ? 'covered' : 'latest', page: m.page };
    const ordered = order(m.clusters || [], o.sort);
    const top = pickTop(ordered, 4), inTop = new Set(top.map(c => c.story.url));
    const rows = ordered.filter(c => !inTop.has(c.story.url));
    return { o, top, rows };
  }

  function pageHTML(model, h) {
    const m = model || {}, view = SPORT[m.view] ? m.view : 'all';
    const { o, top, rows } = build(m);
    const upd = Date.parse(m.updatedAt);
    const head = '<header class="nwa-head"><h1>News</h1><p>' + h.esc(CONTEXT[view]) +
      (Number.isFinite(upd) ? '<span class="nwa-dot" aria-hidden="true">·</span><span>updated <time datetime="' + new Date(upd).toISOString() + '" data-nwa-rel="' + upd + '">' + relTime(upd, o.now, o.tz) + '</time></span>' : '') + '</p></header>';
    const sumo = view === 'all' || view === 'sumo' ? sumoBoxHTML(m.sumo, o, h) : '';
    const empty = m.loading ? 'Checking the latest fight news…' : view === 'sumo' ? 'No sumo headlines right now.' : 'No stories for this sport right now.';
    const sumoLink = view === 'sumo' ? '<p class="nwa-more-link"><a class="nwa-pill" href="sumo.html#home">Basho results, banzuke and rikishi</a></p>' : '';
    return '<div class="nwa" data-portrait-ignore>' + head + chipsHTML(view, o.sort, h) + topHTML(top, o, h) + sumo +
      '<section id="news-feed" aria-label="' + (o.sort === 'covered' ? 'News, most covered first' : 'Latest news by day') + '">' + timelineHTML(rows, Object.assign({}, o, { emptyText: top.length || sumo ? '' : empty }), h) + '</section>' + sumoLink + '</div>';
  }

  function feedHTML(model, h) {
    const { o, top, rows } = build(model);
    return timelineHTML(rows, Object.assign({}, o, { emptyText: top.length ? '' : 'No stories for this sport right now.' }), h);
  }

  /* ---- Browser behaviour: outlets and sumo toggles, image fallback, live times. ---- */
  let redrawTimer = 0;
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-nwa-outlets],[data-nwa-sumo-more]');
      if (!b) return;
      const list = document.getElementById(b.getAttribute('aria-controls'));
      if (!list) return;
      const open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(open));
      list.hidden = !open;
      if (b.hasAttribute('data-nwa-sumo-more')) b.textContent = open ? 'Show fewer' : b.dataset.label;
    });
    /* A photo that fails to load is removed; the story becomes a text-only row or card. */
    document.addEventListener('error', e => {
      const i = e.target;
      if (!i || i.tagName !== 'IMG' || !i.hasAttribute('data-nwa-img')) return;
      if (i.dataset.src) failed.add(i.dataset.src);
      const box = i.parentElement, card = box && box.closest('.nwa-row,.nwa-card,.nwa-lead');
      if (box) box.remove();
      if (card) { card.classList.remove('has-img'); card.classList.add('no-img'); }
      /* The top section holds only stories with a photo: ask the page to draw it again without this one
         (the story moves to the timeline as a text row). */
      if (card && card.closest('.nwa-top')) {
        clearTimeout(redrawTimer);
        redrawTimer = setTimeout(() => document.dispatchEvent(new CustomEvent('befn:news-photo-failed')), 150);
      }
    }, true);
    setInterval(() => {
      if (document.hidden) return;
      document.querySelectorAll('time[data-nwa-rel]').forEach(t => {
        const v = (t.dataset.nwaPre || '') + relTime(Number(t.dataset.nwaRel));
        if (t.textContent !== v) t.textContent = v;
      });
    }, 60000);
  }

  const api = { failed, relTime, dayLabel, dayKey, realImage, buildClusters, order, pickTop, nameMatcher, titleHTML, sumoBoxHTML, timelineHTML, pageHTML, feedHTML, PAGE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BEFNNewsFront = api;
})(typeof window !== 'undefined' ? window : globalThis);
