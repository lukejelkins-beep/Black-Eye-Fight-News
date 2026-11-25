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
  /* The page's safeURL allows https links and assets/img photos only, so this module vets its own: links
     to the site's own routes and pages, and BEFN-held photos (including approved sumo cut-outs). */
  const ownLink = (h, u) => /^(#[a-z0-9/_-]*|sumo(-[a-z]+)?\.html(#[a-z0-9/_-]*)?)$/i.test(String(u)) ? String(u) : h.safeURL(u);
  const ownSrc = (h, u) => /\.\./.test(String(u)) ? '#' : /^assets\/(img|sumo-photos)\/[a-z0-9_/-]+\.webp$/i.test(String(u)) ? String(u) : h.safeURL(u);
  const img = (h, url, cls, alt) => '<img class="' + cls + '" src="' + ownSrc(h, url) + '" alt="' + h.esc(alt || '') + '" loading="lazy" decoding="async">';
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
    const weight = e => titleScore(e.bouts[0]) + (area === 'mma' && /^UFC/i.test(e.promotion || '') ? 1 : 0);
    return soon.slice().sort((a, b) => weight(b) - weight(a) || a.date.localeCompare(b.date))[0] || list[0] || null;
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
  const head = (h, title, link, sub) => '<div class="sov-hd"><h2>' + h.esc(title) + '</h2>' + (link ? '<a href="' + ownLink(h, link[0]) + '">' + h.esc(link[1]) + ' ›</a>' : '') + '</div>' + (sub ? '<p class="sov-sub">' + h.esc(sub) + '</p>' : '');
  const daysText = n => n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : n + ' days';

  function nextStrip(h, e, now) {
    if (!e) return '';
    const n = daysUntil(e.date, now), b = e.bouts[0];
    return '<a class="sov-next" href="#calendar"><span class="sov-k">Next fight night</span><b>' + h.esc(b.fighters.join(' vs ')) + '</b>' +
      '<span class="sov-next-when">' + h.esc(fmt(e.date) + (countryOf(e.location) ? ' · ' + countryOf(e.location) : '')) + '</span>' +
      '<span class="sov-cd">' + (n <= 1 ? '<b>' + h.esc(daysText(n)) + '</b>' : '<b>' + n + '</b> days') + '</span></a>';
  }

  /* The official poster BEFN holds for an event (assets/local-posters.js, owner-cleared): portrait
     first, then landscape. Only BEFN's own image paths are accepted. Used by the hero, the Coming up
     cards and the front page's sport cards, so posters appear the same way everywhere (25 Nov 2026). */
  function heldPoster(h, event) {
    const held = event && h.poster ? h.poster(event.id) : null;
    const p = held && (held.portrait || held.landscape);
    const src = p ? ownSrc(h, p.url) : '#';
    if (!p || src === '#') return null;
    return { src, orient: held.portrait ? 'portrait' : 'landscape', credit: p.credit || '', width: p.width, height: p.height,
      alt: pairName(event) + ' official event poster' };
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
    // An upcoming card leads with its official poster when BEFN holds one (owner, 25 Nov 2026,
    // following the Fights-page rule of 24 Nov): portrait first, then landscape, shown whole with
    // its credit. Without one, the fighters' cut-outs as before. Results keep the cut-outs.
    const poster = hero.type === 'upcoming' ? heldPoster(h, hero.event) : null;
    const art = poster
      ? '<figure class="sov-poster is-' + poster.orient + '"><img class="sov-poster-bg" src="' + poster.src + '" alt="" aria-hidden="true"><img class="sov-poster-img" src="' + poster.src + '" alt="' +
        h.esc(poster.alt) + '" loading="eager" decoding="async"' +
        (poster.width && poster.height ? ' width="' + Number(poster.width) + '" height="' + Number(poster.height) + '"' : '') + '>' +
        (poster.credit ? '<figcaption>' + h.esc(poster.credit) + '</figcaption>' : '') + '</figure>'
      : (pics.length ? '<div class="sov-cast">' + pics.map(u => img(h, u, '', '')).join('') + '</div>' : '');
    // With a poster: poster on top, edge to edge, details below (owner, 25 Nov 2026). Otherwise as before.
    const isPoster = art.startsWith('<figure');
    return '<section class="sov-hero' + (isPoster ? ' has-poster' : art ? '' : ' is-flat') + '">' + (isPoster ? art : '') + '<div class="sov-hero-copy"><div class="sov-k">' + h.esc(kicker.filter(Boolean).join(' · ')) + '</div>' +
      '<h1>' + title + '</h1>' + (para ? '<p>' + h.esc(para) + '</p>' : '') +
      '<a class="sov-btn" href="' + btn[0] + '">' + h.esc(btn[1]) + ' ›</a><a class="sov-btn is-ghost" href="#fights">All fights</a></div>' +
      (isPoster ? '' : art) + '</section>';
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
      const poster = heldPoster(h, e);
      const art = poster
        ? '<span class="sov-up-art is-poster"><img class="sov-poster-bg" src="' + poster.src + '" alt="" aria-hidden="true"><img class="sov-up-poster" src="' + poster.src + '" alt="' + h.esc(poster.alt) + '" loading="lazy" decoding="async"></span>'
        : '<span class="sov-up-art">' + sides + '</span>';
      return '<a class="sov-up" href="#calendar">' + art + '<span class="sov-dd">' + (n <= 0 ? 'Today' : n + 'd') + '</span><span class="sov-ub"><span class="sov-ev">' + h.esc(fmt(e.date) + (e.promotion ? ' · ' + e.promotion : '')) + '</span>' +
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

  /* UFC champion spotlight (owner, 25 Nov 2026, from the mock-up): one champion large in the centre as a
     borderless cut-out on the page itself, the previous and next small and blurred either side. It loops, moves on
     every 5 s, and swipes, arrows, a tap on a side champion or the division buttons move it. ctx.championPhotos is
     data/ufc-champion-photo-register.json. A champion without a cut-out gets the photo, else initials. */
  const regRow = (name, reg) => { const k = slug(name); return ((reg && reg.photos) || []).find(x => x && x.slug === k) || null; };
  const championPhotoURL = (name, reg) => {
    const r = regRow(name, reg);
    return r && /^assets\/img\/ufc-champions\/[a-z0-9-]+\.webp$/.test(r.file) ? r.file : '';
  };
  const championCutoutURL = (name, reg) => {
    const r = regRow(name, reg), f = r && r.cutout && r.cutout.file;
    return f && /^assets\/img\/ufc-champions\/cutout\/[a-z0-9-]+\.webp$/.test(f) ? f : '';
  };
  const reignLine = c => {
    const d = Number(c.defences) || 0;
    return [c.start ? 'Since ' + c.start : '', d ? d + (d === 1 ? ' defence' : ' defences') : ''].filter(Boolean).join(' · ');
  };
  /* Position of champion j when champion i is in the centre, on a loop: 0 centre, -1/1 either side, -2/2 hidden beyond. */
  const spotOffset = (j, i, n) => { let o = ((j - i) % n + n) % n; if (o > n / 2) o -= n; return o; };
  const spotClass = o => o === 0 ? 'is-c' : o === -1 ? 'is-l' : o === 1 ? 'is-r' : o === -2 ? 'is-ll' : o === 2 ? 'is-rr' : 'is-off';
  const shortDiv = d => String(d).replace(/^Women[’']s /i, 'W ').replace(/^Light heavyweight$/i, 'Light heavy');
  function championSpotlight(h, ctx, list) {
    const n = list.length, still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const figs = list.map((c, j) => {
      const o = spotOffset(j, 0, n), cut = championCutoutURL(c.name, ctx.championPhotos), photo = cut ? '' : championPhotoURL(c.name, ctx.championPhotos);
      const pic = cut || photo ? '<img src="' + ownSrc(h, cut || photo) + '" alt="' + h.esc(c.name + ', UFC ' + c.division + ' champion') + '"' + (Math.abs(o) > 1 ? ' loading="lazy"' : '') + ' decoding="async" draggable="false">'
        : '<span class="sov-spot-none">' + h.esc(initials(c.name)) + '</span>';
      return '<a class="sov-spot-f ' + spotClass(o) + (cut ? '' : ' is-photo') + '" data-spot-i="' + j + '" href="' + ownLink(h, '#fighter/ufc--' + slug(c.name)) + '"' +
        (o ? ' tabindex="-1" aria-hidden="true"' : '') + ' draggable="false">' + pic + '</a>';
    }).join('');
    const infos = list.map((c, j) => '<div class="sov-spot-info" data-spot-info="' + j + '"' + (j ? ' hidden' : '') + '><span class="sov-spot-div">' + h.esc(c.division) + ' champion</span>' +
      '<a class="sov-spot-name" href="' + ownLink(h, '#fighter/ufc--' + slug(c.name)) + '">' + h.esc(c.name) + '</a>' + (reignLine(c) ? '<small>' + h.esc(reignLine(c)) + '</small>' : '') + '</div>').join('');
    const pills = list.map((c, j) => '<button type="button" data-spot-go="' + j + '" aria-current="' + (j ? 'false' : 'true') + '" aria-label="' + h.esc(c.division + ': ' + c.name) + '">' + h.esc(shortDiv(c.division)) + '</button>').join('');
    return '<section class="sov-blk sov-champs">' + head(h, 'UFC champions', ['#champions', 'All divisions']) +
      '<div class="sov-spot" data-spot-n="' + n + '" data-i="0"' + (still ? ' data-paused="1"' : '') + ' tabindex="0" role="region" aria-roledescription="carousel" aria-label="UFC champions. Swipe or use the arrow keys." data-portrait-ignore>' +
      '<div class="sov-spot-bar"><span class="sov-spot-n">1 / ' + n + '</span><button type="button" class="sov-spot-play" data-spot="play" aria-label="' + (still ? 'Start rotation">▶' : 'Pause rotation">❚❚') + '</button></div>' +
      '<div class="sov-spot-stage">' + figs + '</div>' +
      '<button type="button" class="sov-spot-nav is-prev" data-spot="-1" aria-label="Previous champion">‹</button><button type="button" class="sov-spot-nav is-next" data-spot="1" aria-label="Next champion">›</button>' +
      infos + '<div class="sov-spot-pills">' + pills + '</div></div></section>';
  }
  /* Spotlight controls, browser only: one set of listeners and one timer for the page, working on whatever
     .sov-spot is on screen (the Overview is re-rendered as innerHTML). State lives on the element. */
  function spotGo(root, i, byUser) {
    const n = Number(root.getAttribute('data-spot-n')) || 1; i = ((i % n) + n) % n;
    root.setAttribute('data-i', i);
    if (byUser) { root.setAttribute('data-hold', Date.now() + 10000); root.querySelectorAll('.sov-spot-info').forEach(x => x.setAttribute('aria-live', 'polite')); }
    root.querySelectorAll('.sov-spot-f').forEach(f => {
      const o = spotOffset(Number(f.getAttribute('data-spot-i')), i, n);
      f.className = 'sov-spot-f ' + spotClass(o) + (f.classList.contains('is-photo') ? ' is-photo' : '');
      if (o) { f.setAttribute('tabindex', '-1'); f.setAttribute('aria-hidden', 'true'); } else { f.removeAttribute('tabindex'); f.removeAttribute('aria-hidden'); }
    });
    root.querySelectorAll('[data-spot-info]').forEach(x => { x.hidden = Number(x.getAttribute('data-spot-info')) !== i; });
    root.querySelectorAll('[data-spot-go]').forEach(b => {
      const on = Number(b.getAttribute('data-spot-go')) === i; b.setAttribute('aria-current', on ? 'true' : 'false');
      if (on && b.parentNode && b.parentNode.scrollTo) b.parentNode.scrollTo({ left: b.offsetLeft - (b.parentNode.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' });
    });
    const c = root.querySelector('.sov-spot-n'); if (c) c.textContent = (i + 1) + ' / ' + n;
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    const spotOf = e => e.target && e.target.closest && e.target.closest('.sov-spot');
    const cur = r => Number(r.getAttribute('data-i')) || 0;
    let swipe = null, swiped = false;
    document.addEventListener('click', e => {
      const r = spotOf(e); if (!r) return;
      if (swiped) { swiped = false; if (e.target.closest('.sov-spot-f')) e.preventDefault(); return; }
      const b = e.target.closest('[data-spot],[data-spot-go]'), f = e.target.closest('.sov-spot-f');
      if (b && b.getAttribute('data-spot') === 'play') {
        const p = !r.hasAttribute('data-paused'); if (p) r.setAttribute('data-paused', '1'); else r.removeAttribute('data-paused');
        b.textContent = p ? '▶' : '❚❚'; b.setAttribute('aria-label', p ? 'Start rotation' : 'Pause rotation');
      } else if (b && b.hasAttribute('data-spot-go')) spotGo(r, Number(b.getAttribute('data-spot-go')), true);
      else if (b) spotGo(r, cur(r) + Number(b.getAttribute('data-spot')), true);
      else if (f && !f.classList.contains('is-c')) { e.preventDefault(); spotGo(r, Number(f.getAttribute('data-spot-i')), true); }
    });
    document.addEventListener('pointerdown', e => { const r = spotOf(e); swipe = r && e.target.closest('.sov-spot-stage') ? { r, x: e.clientX, y: e.clientY } : null; });
    document.addEventListener('pointerup', e => {
      if (!swipe) return; const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y, r = swipe.r; swipe = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { swiped = true; setTimeout(() => { swiped = false; }, 60); spotGo(r, cur(r) + (dx < 0 ? 1 : -1), true); }
    });
    document.addEventListener('keydown', e => {
      const r = spotOf(e); if (!r || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') || e.target.closest('.sov-spot-pills')) return;
      e.preventDefault(); spotGo(r, cur(r) + (e.key === 'ArrowRight' ? 1 : -1), true);
    });
    const hover = on => e => { const r = spotOf(e); if (r) { if (on) r.setAttribute('data-hover', '1'); else if (!r.contains(e.relatedTarget)) r.removeAttribute('data-hover'); } };
    document.addEventListener('mouseover', hover(true)); document.addEventListener('mouseout', hover(false));
    document.addEventListener('focusin', hover(true)); document.addEventListener('focusout', hover(false));
    setInterval(() => {
      if (document.hidden) return;
      document.querySelectorAll('.sov-spot').forEach(r => {
        if (r.hasAttribute('data-paused') || r.hasAttribute('data-hover') || Number(r.getAttribute('data-hold') || 0) > Date.now()) return;
        spotGo(r, cur(r) + 1, false);
      });
    }, 5000);
  }

  function championsBlock(h, ctx, area) {
    if (area === 'mma') {
      const list = ((ctx.champions && ctx.champions.mma) || []).filter(c => c && c.name && !/vacant/i.test(c.name));
      if (list.length && ctx.championPhotos && (ctx.championPhotos.photos || []).length) return championSpotlight(h, ctx, list);
    }
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

  /* ctx: { area, now, events, results, cutouts, champions:{boxing,mma}, championPhotos, featured, stories } */
  function build(ctx, h) {
    const area = AREA[ctx.area] ? ctx.area : 'boxing';
    if (!(ctx.events || []).length && !ctx.results) return '<div class="sov sov-' + area + '"><p class="front-loading" role="status">Loading the latest ' + AREA[area] + ' fights…</p></div>';
    const next = upcoming(ctx.events, area, ctx.now)[0];
    return '<div class="sov sov-' + area + '">' + nextStrip(h, next, ctx.now) + heroBlock(h, pickHero(ctx, area), ctx, area) +
      resultsBlock(h, ctx, area) + upcomingBlock(h, ctx, area) + championsBlock(h, ctx, area) + newsBlock(h, ctx) + exploreBlock(h, area) + '</div>';
  }


  /* ---------- all-sports front page (owner, 24 Nov 2026: design A, hero rotates by sport) ---------- */
  const SPORT = { boxing: 'Boxing', mma: 'MMA', sumo: 'Sumo' };
  const SUMO_MONTH = { '01': 'January', '03': 'March', '05': 'May', '07': 'July', '09': 'September', '11': 'November' };
  const SUMO_PLACE = { '01': 'Tokyo', '03': 'Osaka', '05': 'Tokyo', '07': 'Nagoya', '09': 'Tokyo', '11': 'Fukuoka' };
  /* A basho starts on the second Sunday of its month. */
  function bashoStart(id) {
    const y = Number(String(id).slice(0, 4)), m = Number(String(id).slice(4, 6));
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return new Date(Date.UTC(y, m - 1, 1 + ((7 - first) % 7) + 7)).toISOString().slice(0, 10);
  }
  const nextBashoId = id => { let y = Number(String(id).slice(0, 4)), m = Number(String(id).slice(4, 6)) + 2; if (m > 12) { m -= 12; y++; } return y + String(m).padStart(2, '0'); };
  /* Sumo for the front page, from data/sumo/basho-archive/index.json and banzuke-release-dates.json. */
  function sumoSummary(index, releases, now) {
    const done = ((index && index.basho) || []).filter(b => b && /^\d{6}$/.test(b.bashoId) && b.endDate && Date.parse(b.endDate) <= now && b.makuuchiChampion)
      .sort((a, b) => a.bashoId.localeCompare(b.bashoId));
    const last = done[done.length - 1];
    if (!last) return null;
    const nextId = nextBashoId(last.bashoId), rel = releases && releases.releases && releases.releases[nextId];
    const r = last.makuuchiChampionRecord;
    return {
      last: { id: last.bashoId, name: SUMO_MONTH[last.bashoId.slice(4)] + ' basho', place: SUMO_PLACE[last.bashoId.slice(4)], end: last.endDate.slice(0, 10),
        champion: last.makuuchiChampion, championId: last.makuuchiChampionId, rank: last.makuuchiChampionRank || '', record: r ? r.wins + '–' + r.losses : '' },
      next: { id: nextId, name: SUMO_MONTH[nextId.slice(4)] + ' basho', place: SUMO_PLACE[nextId.slice(4)], start: bashoStart(nextId), banzuke: rel && rel.date ? String(rel.date).slice(0, 10) : '' }
    };
  }
  const tag = (h, s) => '<span class="fp-tag fp-' + s + '">' + SPORT[s] + '</span>';
  const overviewHref = s => s === 'sumo' ? 'sumo.html#home' : '#home';
  const areaAttr = s => s === 'sumo' ? '' : ' data-area="' + s + '"';
  const shortName = n => n.replace(/\s+(Jr\.|Sr\.)$/, '');

  function frontNext(h, ctx, sumo) {
    const cell = (s, title, when, n) => '<a class="fp-n fp-' + s + '" href="' + (s === 'sumo' ? 'sumo.html#home' : '#calendar') + '"' + areaAttr(s) + '>' + tag(h, s) +
      '<b>' + h.esc(title) + '</b><span>' + h.esc(when) + '</span><em>' + h.esc(daysText(n)) + '</em></a>';
    const out = [];
    for (const s of ['boxing', 'mma']) { const e = upcoming(ctx.events, s, ctx.now)[0]; if (e) out.push(cell(s, e.bouts[0].fighters.join(' vs '), fmt(e.date), daysUntil(e.date, ctx.now))); }
    if (sumo) out.push(cell('sumo', sumo.next.name + ', ' + sumo.next.place, (sumo.next.banzuke ? 'Banzuke ' + fmt(sumo.next.banzuke) + ' · ' : '') + 'day 1 ' + fmt(sumo.next.start), daysUntil(sumo.next.start, ctx.now)));
    return out.length ? '<div class="fp-next3">' + out.join('') + '</div>' : '';
  }

  /* The hero for one sport, or null when that sport has nothing to show yet. */
  function frontHero(h, ctx, s, sumo) {
    const btns = (a, b) => '<a class="sov-btn" href="' + a[0] + '"' + (a[2] || '') + '>' + h.esc(a[1]) + ' ›</a><a class="sov-btn is-ghost" href="' + b[0] + '"' + (b[2] || '') + '>' + h.esc(b[1]) + '</a>';
    const wrap = (kicker, title, para, pics, b) => '<section class="sov-hero fp-hero fp-h-' + s + (pics.length ? '' : ' is-flat') + '"><div class="sov-hero-copy">' + tag(h, s) +
      '<div class="sov-k">' + h.esc(kicker.filter(Boolean).join(' · ')) + '</div><h1>' + title + '</h1>' + (para ? '<p>' + h.esc(para) + '</p>' : '') + b + '</div>' +
      (pics.length ? '<div class="sov-cast">' + pics.map(u => img(h, u, '', '')).join('') + '</div>' : '') + '</section>';
    if (s === 'sumo') {
      if (!sumo) return null;
      const L = sumo.last, fresh = daysUntil(L.end, ctx.now) >= -14, pic = ctx.sumoPhoto ? [ctx.sumoPhoto] : [];
      if (fresh) return wrap([L.name, L.place, 'final'], h.esc(L.champion) + ' wins the ' + h.esc(L.name) + (L.record ? ' at <span class="sov-nw">' + h.esc(L.record) + '</span>' : ''),
        (sumo.next.banzuke ? 'The ' + sumo.next.name.replace(' basho', '') + ' banzuke is out on ' + fmt(sumo.next.banzuke) + ', and day 1 is ' + fmt(sumo.next.start) + '.' : 'Day 1 of the ' + sumo.next.name + ' is ' + fmt(sumo.next.start) + '.'), pic,
        btns(['sumo.html#review', 'Basho review'], ['sumo.html#home', 'Sumo overview']));
      const n = daysUntil(sumo.next.start, ctx.now);
      return wrap([sumo.next.name, sumo.next.place], 'The ' + h.esc(sumo.next.name) + ' starts <span class="sov-nw">' + (n <= 0 ? 'today' : n === 1 ? 'tomorrow' : 'in ' + n + ' days') + '</span>',
        L.champion + ' won the ' + L.name + (L.record ? ' at ' + L.record : '') + '.', pic, btns(['sumo.html#banzuke', 'Rankings'], ['sumo.html#home', 'Sumo overview']));
    }
    const hero = pickHero(ctx, s);
    if (!hero) return null;
    const html = heroBlock(h, hero, ctx, s);
    return html.replace('<div class="sov-hero-copy">', '<div class="sov-hero-copy">' + tag(h, s)).replace('class="sov-hero', 'class="sov-hero fp-hero fp-h-' + s)
      .replace('<a class="sov-btn is-ghost" href="#fights">All fights</a>', '<a class="sov-btn is-ghost" href="#home"' + areaAttr(s) + '>' + SPORT[s] + ' overview</a>');
  }

  function frontCards(h, ctx, heroSport, sumo) {
    const card = (s, kicker, title, sub, pic, event) => {
      const poster = event ? heldPoster(h, event) : null;
      return '<a class="fp-sc fp-' + s + (poster ? ' has-poster' : '') + '" href="' + overviewHref(s) + '"' + areaAttr(s) + '><span class="fp-sc-copy">' + tag(h, s) +
        '<span class="sov-ev">' + h.esc(kicker) + '</span><strong>' + h.esc(title) + '</strong><span>' + h.esc(sub) + '</span><em>' + SPORT[s] + ' overview ›</em></span>' +
        (poster ? '<img class="fp-sc-poster is-' + poster.orient + '" src="' + poster.src + '" alt="' + h.esc(poster.alt) + '" loading="lazy" decoding="async">' : pic ? img(h, pic, '', '') : '') + '</a>';
    };
    const out = [];
    for (const s of ['boxing', 'mma']) {
      const big = bigUpcoming(ctx.events, s, ctx.featured, ctx.now), hero = pickHero(ctx, s);
      const sameAsHero = heroSport === s && hero && hero.type === 'upcoming' && big && hero.event.id === big.id;
      if (big && !sameAsHero) {
        const b = big.bouts[0], other = upcoming(ctx.events, s, ctx.now).find(e => e.id !== big.id);
        const pre = other && other.date < big.date;
        out.push(card(s, [b.division, big.promotion, fmt(big.date)].filter(Boolean).join(' · '),
          b.fighters.map(n => surname(shortName(n))).join(' vs ') + ' in ' + daysText(daysUntil(big.date, ctx.now)).toLowerCase(),
          other ? (pre ? 'First: ' : 'Then: ') + other.bouts[0].fighters.map(n => surname(shortName(n))).join('–') + ', ' + fmt(other.date) : '',
          cutoutURL(b.fighters[0], ctx.cutouts) || cutoutURL(b.fighters[1], ctx.cutouts), big));
      } else {
        const last = mainEvents(ctx.results, s)[0];
        if (last) { const o = outcome(last.bout); out.push(card(s, [last.bout.division, fmt(last.event.date)].join(' · '), resultHeadline(o, last.bout), last.event.name || '', o.winner ? cutoutURL(o.winner, ctx.cutouts) : '')); }
      }
    }
    if (sumo) {
      const L = sumo.last;
      out.push(heroSport === 'sumo'
        ? card('sumo', sumo.next.name + ' · ' + sumo.next.place, 'Day 1 in ' + daysText(daysUntil(sumo.next.start, ctx.now)).toLowerCase(), sumo.next.banzuke ? 'Banzuke out ' + fmt(sumo.next.banzuke) : '', '')
        : card('sumo', L.name + ' · final', L.champion + ' wins' + (L.record ? ' at ' + L.record : ''), sumo.next.banzuke ? sumo.next.name.replace(' basho', '') + ' banzuke out ' + fmt(sumo.next.banzuke) : '', ctx.sumoPhoto || ''));
    }
    return out.length ? '<section class="sov-blk">' + head(h, 'Pick a sport') + '<div class="fp-scs">' + out.join('') + '</div></section>' : '';
  }

  function frontResults(h, ctx, sumo) {
    const rows = [];
    for (const s of ['boxing', 'mma']) for (const { event: e, bout: b } of mainEvents(ctx.results, s).slice(0, 4)) {
      const o = outcome(b);
      rows.push({ date: e.date, html: '<article class="fp-res">' + tag(h, s) + '<div><span class="sov-ev">' + h.esc(fmt(e.date) + ' · ' + (e.name || b.event || '')) + '</span><strong>' +
        (o.winner ? '<b>' + h.esc(o.winner) + '</b> beat ' + h.esc(o.loser) : '<b>' + h.esc(b.fighters[0].name) + '</b> and <b>' + h.esc(b.fighters[1].name) + '</b>') +
        '</strong><span class="sov-m">' + h.esc(methodShort(b.method) + (o.winner && b.round ? ' R' + b.round : '') + (b.division ? ' · ' + b.division : '')) + '</span></div></article>' });
    }
    if (sumo) { const L = sumo.last; rows.push({ date: L.end, html: '<article class="fp-res">' + tag(h, 'sumo') + '<div><span class="sov-ev">' + h.esc(fmt(L.end) + ' · ' + L.name + ', ' + L.place) + '</span><strong><b>' + h.esc(L.champion) + '</b> won the ' + h.esc(L.name) + '</strong><span class="sov-m">' + h.esc([L.record, 'Makuuchi title'].filter(Boolean).join(' · ')) + '</span></div></article>' }); }
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return rows.length ? '<section class="sov-blk">' + head(h, 'Latest results', ['#results', 'All results']) + '<div class="sov-grid2">' + rows.slice(0, 6).map(r => r.html).join('') + '</div></section>' : '';
  }

  /* Up to four headlines, taking each sport in turn so no sport crowds the others out. */
  function frontNews(h, stories) {
    const by = {};
    for (const a of stories || []) if (a && a.title && a.url && SPORT[a.sport]) (by[a.sport] = by[a.sport] || []).push(a);
    const pick = [];
    for (let i = 0; pick.length < 4 && i < 4; i++) for (const s of ['boxing', 'mma', 'sumo']) if (by[s] && by[s][i] && pick.length < 4) pick.push(by[s][i]);
    if (!pick.length) return '';
    return '<section class="sov-blk">' + head(h, 'Latest news', ['#news', 'All news']) + '<div class="sov-news">' + pick.map(a =>
      '<a href="' + h.safeURL(a.url) + '" target="_blank" rel="noopener">' + tag(h, a.sport) + '<span class="sov-ev">' + h.esc([a.source, String(a.publishedAt || '').slice(0, 10), a.language ? 'translated' : ''].filter(Boolean).join(' · ')) + '</span><strong>' + h.esc(a.title) + '</strong></a>').join('') + '</div></section>';
  }

  /* ctx: { now, events, results, cutouts, featured, stories, sumoIndex, sumoReleases, sumoPhoto, heroOrder:['mma','sumo','boxing'] } */
  function buildFront(ctx, h) {
    if (!(ctx.events || []).length && !ctx.results) return '<div class="sov fp"><p class="front-loading" role="status">Loading the latest fights…</p></div>';
    const sumo = sumoSummary(ctx.sumoIndex, ctx.sumoReleases, ctx.now);
    let hero = '', heroSport = null;
    for (const s of ctx.heroOrder || ['boxing', 'mma', 'sumo']) { const x = frontHero(h, ctx, s, sumo); if (x) { hero = x; heroSport = s; break; } }
    return '<div class="sov fp">' + frontNext(h, ctx, sumo) + hero + frontCards(h, ctx, heroSport, sumo) + frontResults(h, ctx, sumo) + frontNews(h, ctx.stories) + '</div>';
  }

  const api = { ownLink, ownSrc, build, buildFront, sumoSummary, bashoStart, pickHero, bigUpcoming, mainEvents, outcome, resultHeadline, methodShort, titleScore, boxingChampions, championPhotoURL, championCutoutURL, spotOffset, upcoming, daysUntil, slug };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BEFNSportOverview = api;
})(typeof window !== 'undefined' ? window : globalThis);
