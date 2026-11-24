/* Boxing and MMA Overviews (owner decision, 24 Nov 2026): the first section of each sport area.
 * Next fight night, a hero, latest results, coming up, champions, latest news, explore.
 * The hero picks itself: the latest main event for 3 days after it, otherwise the biggest
 * upcoming fight with a countdown. "Biggest" is the owner's headline list
 * (data/sport-overview-featured.json) when one of those fights is within 45 days, otherwise
 * the strongest title fight in the next 3 weeks. MMA covers every promotion we hold results
 * and cards for; its champions are the UFC's, the only ones the site holds.
 * Pure functions so tests run in Node. The page passes h = { esc, safeURL, localImage }. */
(function (root) {
  'use strict';

  const DAY = 86400000;
  const AREA = { boxing: 'Boxing', mma: 'MMA' };
  const RESULT_DAYS = 3, FEATURED_DAYS = 45, BIG_DAYS = 21;
  const ORGS = ['WBA', 'WBC', 'IBF', 'WBO'];

  const slug = name => String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const dayKey = ms => new Date(ms).toISOString().slice(0, 10);
  const daysUntil = (date, now) => Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(dayKey(now) + 'T00:00:00Z')) / DAY);
  const fmt = date => new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
  const surname = name => { const p = String(name || '').trim().split(/\s+/); return p.length > 1 ? p[p.length - 1] : p[0] || ''; };
  const initials = name => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const sportOf = x => String(x && x.sport || '').toLowerCase();
  const inArea = (x, area) => sportOf(x) === area;
  const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');

  /* ---------- pictures ---------- */
  const cutoutURL = (name, cutouts) => {
    const k = slug(name), c = cutouts && cutouts[k];
    return c && c.ok === true ? (c.dir || 'assets/img/ufc-cutouts/') + k + '.webp' : '';
  };
  const thumbURL = (name, h, kind) => (h.localImage ? h.localImage(name, kind || 'thumb') : '') || '';
  const img = (h, url, cls, alt) => '<img class="' + cls + '" src="' + h.safeURL(url) + '" alt="' + h.esc(alt || '') + '" loading="lazy" decoding="async">';
  function face(h, name, cutouts, cls) {
    const url = thumbURL(name, h) || cutoutURL(name, cutouts);
    return url ? img(h, url, 'sov-f ' + (cls || ''), '') : '<span class="sov-f is-none ' + (cls || '') + '" aria-hidden="true">' + h.esc(initials(name)) + '</span>';
  }

  /* ---------- data ---------- */
  function upcoming(events, area, now) {
    const today = dayKey(now);
    return (events || []).filter(e => e && inArea(e, area) && isDate(e.date) && e.date >= today && Array.isArray(e.bouts) && e.bouts.length && Array.isArray(e.bouts[0].fighters) && e.bouts[0].fighters.length === 2)
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.startAt || '').localeCompare(String(b.startAt || '')));
  }

  /* Finished main events of this sport, newest first, each with its main bout. */
  function mainEvents(results, area) {
    const bouts = new Map(((results && results.results) || []).map(b => [b.id, b]));
    return ((results && results.events) || [])
      .filter(e => e && e.status === 'completed' && isDate(e.date) && bouts.has(e.mainBoutId))
      .map(e => ({ event: e, bout: bouts.get(e.mainBoutId) }))
      .filter(x => inArea(x.bout, area) && Array.isArray(x.bout.fighters) && x.bout.fighters.length === 2)
      .sort((a, b) => b.event.date.localeCompare(a.event.date));
  }

  function outcome(bout) {
    const m = String(bout.method || ''), l = m.toLowerCase();
    if (/no contest/.test(l)) return { kind: 'nc' };
    if (/draw/.test(l)) return { kind: 'draw' };
    const w = Number.isInteger(bout.winner) ? bout.fighters[bout.winner] : null, lo = w ? bout.fighters[1 - bout.winner] : null;
    if (!w || !lo) return { kind: 'unknown' };
    const kind = /sub/.test(l) ? 'sub' : /\bt?ko\b|ko\/tko|stoppage|rtd|retire/.test(l) ? 'stop' : /decision|points/.test(l) ? 'dec' : 'other';
    return { kind, winner: w.name, loser: lo.name };
  }
  function methodShort(method) {
    const l = String(method || '').toLowerCase();
    if (/unanimous/.test(l)) return 'UD'; if (/split/.test(l)) return 'SD'; if (/majority/.test(l)) return 'MD';
    if (/no contest/.test(l)) return 'No contest'; if (/draw/.test(l)) return 'Draw';
    if (/sub/.test(l)) return 'Sub'; if (/tko|ko\/tko/.test(l)) return 'KO/TKO'; if (/\bko\b/.test(l)) return 'KO';
    return String(method || '').split('(')[0].trim();
  }

  /* Title weight of a fight, from what its own card says. */
  function titleScore(bout) {
    const t = String((bout && (bout.note || '')) || '').toLowerCase();
    let s = 0;
    if (/eliminator/.test(t)) s = 1; else if (/undisputed/.test(t)) s = 5; else if (/unification/.test(t)) s = 4;
    else if (/world title|world-title|world titles|championship|ufc title|title fight/.test(t)) s = 3; else if (/title/.test(t)) s = 2;
    if (/heavyweight/i.test(bout && bout.division || '') && !/cruiser|light|super|women/i.test(bout.division)) s += 0.5;
    return s;
  }

  function bigUpcoming(events, area, featured, now) {
    const list = upcoming(events, area, now);
    const ids = new Set((featured && featured[area]) || []);
    const f = list.find(e => ids.has(e.id) && daysUntil(e.date, now) <= FEATURED_DAYS);
    if (f) return f;
    const soon = list.filter(e => daysUntil(e.date, now) <= BIG_DAYS && (!e.bouts[0].section || e.bouts[0].section === 'main'));
    return soon.slice().sort((a, b) => titleScore(b.bouts[0]) - titleScore(a.bouts[0]) || a.date.localeCompare(b.date))[0] || list[0] || null;
  }

  /* Hero: a result for RESULT_DAYS days after a main event, otherwise the biggest coming fight. */
  function pickHero(ctx, area) {
    const last = mainEvents(ctx.results, area)[0];
    if (last && daysUntil(last.event.date, ctx.now) >= -RESULT_DAYS && outcome(last.bout).kind !== 'unknown') return { type: 'result', ...last };
    const e = bigUpcoming(ctx.events, area, ctx.featured, ctx.now);
    return e ? { type: 'upcoming', event: e } : null;
  }

  function resultHeadline(o, bout) {
    const W = surname(o.winner), L = surname(o.loser), r = bout.round ? ' in round ' + bout.round : '';
    if (o.kind === 'stop') return W + ' stops ' + L + r;
    if (o.kind === 'sub') return W + ' submits ' + L + r;
    if (o.kind === 'dec') return W + ' beats ' + L + ' on points';
    if (o.kind === 'draw') return surname(bout.fighters[0].name) + ' and ' + surname(bout.fighters[1].name) + ' draw';
    if (o.kind === 'nc') return surname(bout.fighters[0].name) + ' v ' + surname(bout.fighters[1].name) + ': no contest';
    return W + ' beats ' + L;
  }
  const pairName = e => e.bouts[0].fighters.map(surname).join(' vs ');
  const placeOf = loc => { const p = String(loc || '').split(',').map(s => s.trim()).filter(Boolean); return p.length ? p[0] : ''; };
  const countryOf = loc => { const p = String(loc || '').split(',').map(s => s.trim()).filter(Boolean); return p.length ? p[p.length - 1] : ''; };
  const list = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

  /* ---------- blocks ---------- */
  const head = (h, title, link, sub) => '<div class="sov-hd"><h2>' + h.esc(title) + '</h2>' + (link ? '<a href="' + h.safeURL(link[0]) + '">' + h.esc(link[1]) + ' ›</a>' : '') + '</div>' + (sub ? '<p class="sov-sub">' + h.esc(sub) + '</p>' : '');
  const daysText = n => n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : n + ' days';

  function nextStrip(h, e, now) {
    if (!e) return '';
    const n = daysUntil(e.date, now), b = e.bouts[0];
    return '<a class="sov-next" href="#calendar"><span class="sov-k">Next fight night</span><b>' + h.esc(b.fighters.join(' vs ')) + '</b>' +
      '<span class="sov-next-when">' + h.esc(fmt(e.date) + (countryOf(e.location) ? ' · ' + countryOf(e.location) : '')) + '</span>' +
      '<span class="sov-cd">' + (n <= 1 ? '<b>' + h.esc(daysText(n)) + '</b>' : '<b>' + n + '</b> days') + '</span></a>';
  }

  function heroBlock(h, hero, ctx, area) {
    if (!hero) return '';
    let kicker, title, para, names, btn;
    if (hero.type === 'result') {
      const e = hero.event, b = hero.bout, o = outcome(b);
      kicker = [b.division, e.name, fmt(e.date)];
      title = h.esc(resultHeadline(o, b));
      const take = (e.takeaways || []).map(t => t && t.text).find(Boolean);
      para = take || (o.winner ? o.winner + ' beat ' + o.loser + (b.method ? ' by ' + String(b.method).replace(/\s*\(.*\)/, '').toLowerCase() : '') + '.' : '');
      names = o.winner ? [o.winner, o.loser] : b.fighters.map(f => f.name);
      btn = ['#results', 'Full results'];
    } else {
      const e = hero.event, b = e.bouts[0], n = daysUntil(e.date, ctx.now);
      kicker = [b.division, placeOf(e.location), fmt(e.date)];
      title = h.esc(pairName(e)) + ' <span class="sov-nw">' + (n <= 0 ? 'tonight' : n === 1 ? 'tomorrow' : 'in ' + n + ' days') + '</span>';
      const others = upcoming(ctx.events, area, ctx.now).filter(x => x !== e && titleScore(x.bouts[0]) >= 2 && daysUntil(x.date, ctx.now) <= 30).slice(0, 4).map(x => x.bouts[0].fighters.map(surname).join('–'));
      const note = b.note && !/^main event$/i.test(b.note) ? b.note.split('·')[0].trim() : '';
      para = (note ? note + '. ' : '') + (others.length ? 'Also coming up: ' + list(others) + '.' : '');
      names = b.fighters;
      btn = ['#calendar', 'Fight card'];
    }
    const pics = names.map(n => cutoutURL(n, ctx.cutouts)).filter(Boolean);
    return '<section class="sov-hero' + (pics.length ? '' : ' is-flat') + '"><div class="sov-hero-copy"><div class="sov-k">' + h.esc(kicker.filter(Boolean).join(' · ')) + '</div>' +
      '<h1>' + title + '</h1>' + (para ? '<p>' + h.esc(para) + '</p>' : '') +
      '<a class="sov-btn" href="' + btn[0] + '">' + h.esc(btn[1]) + ' ›</a><a class="sov-btn is-ghost" href="#fights">All fights</a></div>' +
      (pics.length ? '<div class="sov-cast">' + pics.map(u => img(h, u, '', '')).join('') + '</div>' : '') + '</section>';
  }

  function resultsBlock(h, ctx, area) {
    const rows = mainEvents(ctx.results, area).slice(0, 6).map(({ event: e, bout: b }) => {
      const o = outcome(b), a = b.fighters[0].name, c = b.fighters[1].name;
      const first = o.winner || a, second = o.winner ? o.loser : c;
      const line = o.winner ? '<b>' + h.esc(o.winner) + '</b> beat ' + h.esc(o.loser) : '<b>' + h.esc(a) + '</b> and <b>' + h.esc(c) + '</b>';
      const how = methodShort(b.method) + (o.winner && b.round ? ' R' + b.round : '');
      return '<article class="sov-res"><span class="sov-pair">' + face(h, first, ctx.cutouts) + face(h, second, ctx.cutouts, 'is-l') + '</span><div><span class="sov-ev">' + h.esc(fmt(e.date) + ' · ' + (e.name || b.event || '')) + '</span>' +
        '<strong>' + line + '</strong><span class="sov-m">' + h.esc(how + (b.division ? ' · ' + b.division : '')) + '</span></div></article>';
    });
    return rows.length ? '<section class="sov-blk">' + head(h, 'Latest results', ['#results', 'All results']) + '<div class="sov-grid2">' + rows.join('') + '</div></section>' : '';
  }

  function upcomingBlock(h, ctx, area) {
    const cards = upcoming(ctx.events, area, ctx.now).slice(0, 6).map(e => {
      const b = e.bouts[0], n = daysUntil(e.date, ctx.now);
      const note = String(b.note || '').split('·')[0].trim();
      const sides = b.fighters.map(name => { const c = cutoutURL(name, ctx.cutouts); return '<span class="sov-pc">' + (c ? img(h, c, '', name) : face(h, name, null, 'is-big')) + '</span>'; }).join('');
      return '<a class="sov-up" href="#calendar"><span class="sov-up-art">' + sides + '</span><span class="sov-dd">' + (n <= 0 ? 'Today' : n + 'd') + '</span><span class="sov-ub"><span class="sov-ev">' + h.esc(fmt(e.date) + (e.promotion ? ' · ' + e.promotion : '')) + '</span>' +
        '<strong>' + h.esc(b.fighters.join(' vs ')) + '</strong><span>' + h.esc([b.division, /tbc|pending|awaiting|reported/i.test(note) ? '' : note].filter(Boolean).join(' · ')) + '</span><small>' + h.esc(e.location || '') + '</small></span></a>';
    });
    return cards.length ? '<section class="sov-blk">' + head(h, 'Coming up', ['#calendar', 'Full schedule']) + '<div class="sov-ups">' + cards.join('') + '</div></section>' : '';
  }

  /* Boxing: in each division, whoever holds the most of the four major belts (regular and
     interim titles left out). Gold edge when one boxer holds all four. */
  function boxingChampions(divisions) {
    const out = [];
    for (const d of divisions || []) {
      const held = new Map();
      for (const org of ORGS.concat(['The Ring'])) {
        for (const x of (d.belts && d.belts[org]) || []) {
          if (!x || !x.name || /vacant/i.test(x.name) || /regular|interim/i.test(x.status || '')) continue;
          if (!held.has(x.name)) held.set(x.name, []);
          held.get(x.name).push(org);
        }
      }
      const rank = [...held.entries()].sort((a, b) => b[1].filter(o => ORGS.includes(o)).length - a[1].filter(o => ORGS.includes(o)).length);
      if (!rank.length) continue;
      const [name, belts] = rank[0];
      out.push({ division: d.division, name, belts, undisputed: ORGS.every(o => belts.includes(o)), others: rank.slice(1, 3).map(r => r[0]) });
    }
    return out;
  }

  function championsBlock(h, ctx, area) {
    const rows = area === 'boxing' ? boxingChampions(ctx.champions && ctx.champions.boxing)
      : ((ctx.champions && ctx.champions.mma) || []).filter(c => c && c.name && !/vacant/i.test(c.name)).map(c => ({ division: c.division, name: c.name, belts: [], others: [] }));
    if (!rows.length) return '';
    const card = c => {
      const url = cutoutURL(c.name, ctx.cutouts) || thumbURL(c.name, h, 'card') || thumbURL(c.name, h);
      return '<article class="sov-ch' + (c.undisputed ? ' is-und' : '') + '">' + (url ? img(h, url, 'sov-chp', '') : '<span class="sov-chp is-none" aria-hidden="true">' + h.esc(initials(c.name)) + '</span>') +
        '<div><span class="sov-ev">' + h.esc(c.division) + '</span><strong>' + h.esc(c.name) + '</strong>' +
        (c.belts.length ? '<span class="sov-belts">' + c.belts.map(o => '<i>' + h.esc(o) + '</i>').join('') + '</span>' : '') +
        (c.others.length ? '<small>Also: ' + h.esc(c.others.join(', ')) + '</small>' : '') + '</div></article>';
    };
    return '<section class="sov-blk">' + head(h, area === 'mma' ? 'UFC champions' : 'Champions', ['#champions', 'All divisions'],
      area === 'boxing' ? 'Whoever holds the most belts in each division. Gold edge: undisputed.' : '') + '<div class="sov-chs">' + rows.slice(0, 12).map(card).join('') + '</div></section>';
  }

  function newsBlock(h, ctx) {
    const a = (ctx.stories || []).filter(x => x && x.title && x.url).slice(0, 4);
    if (!a.length) return '';
    return '<section class="sov-blk">' + head(h, 'Latest news', ['#news', 'All news']) + '<div class="sov-news">' + a.map(x =>
      '<a href="' + h.safeURL(x.url) + '" target="_blank" rel="noopener"><span class="sov-ev">' + h.esc([x.source, String(x.publishedAt || '').slice(0, 10)].filter(Boolean).join(' · ')) + '</span><strong>' + h.esc(x.title) + '</strong></a>').join('') + '</div></section>';
  }

  function exploreBlock(h, area) {
    const items = area === 'mma'
      ? [['#fights', 'Fights', 'UFC, PFL, ONE, RIZIN, KSW'], ['#fighters', 'Fighters', 'Profiles, records, form'], ['#analysis', 'Analysis', 'Rankings and stats leaders'], ['#social', 'Fight Talk', 'What fighters are saying']]
      : [['#fights', 'Fights', 'Results and the schedule'], ['#fighters', 'Fighters', 'Profiles and records'], ['#analysis', 'Analysis', 'Rankings and breakdowns'], ['#social', 'Fight Talk', 'What fighters are saying']];
    return '<section class="sov-blk">' + head(h, 'Explore') + '<div class="sov-exp">' + items.map(x => '<a href="' + x[0] + '"><b>' + h.esc(x[1]) + '</b><span>' + h.esc(x[2]) + '</span></a>').join('') + '</div></section>';
  }

  /* ctx: { area, now, events, results, cutouts, champions:{boxing,mma}, featured, stories } */
  function build(ctx, h) {
    const area = AREA[ctx.area] ? ctx.area : 'boxing';
    if (!(ctx.events || []).length && !ctx.results) return '<div class="sov sov-' + area + '"><p class="front-loading" role="status">Loading the latest ' + AREA[area] + ' fights…</p></div>';
    const next = upcoming(ctx.events, area, ctx.now)[0];
    return '<div class="sov sov-' + area + '">' + nextStrip(h, next, ctx.now) + heroBlock(h, pickHero(ctx, area), ctx, area) +
      resultsBlock(h, ctx, area) + upcomingBlock(h, ctx, area) + championsBlock(h, ctx, area) + newsBlock(h, ctx) + exploreBlock(h, area) + '</div>';
  }

  const api = { build, pickHero, bigUpcoming, mainEvents, outcome, resultHeadline, methodShort, titleScore, boxingChampions, upcoming, daysUntil, slug };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BEFNSportOverview = api;
})(typeof window !== 'undefined' ? window : globalThis);
