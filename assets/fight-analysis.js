/* Analysis pages (owner, 24 Nov 2026). Boxing: the title picture, title fights coming up, how fights ended,
 * most title defences, unbeaten records ended and an unbeaten watch. MMA: a short top section (UFC champions carousel,
 * UFC title fights coming up, how fights ended) above the UFC stats leaderboards.
 * Data the site already holds: window.COMBAT_DATA (title tracker and scouting roster), data/upcoming-cards.json
 * and data/results.json (verified results; "the last two weeks" means results dated within 14 days of today).
 * Both pages open with a champions carousel (owner, 25 Nov 2026): one champion per view, swipe or arrows, heaviest
 * division first. Pictures come only from BEFN's registers: data/fullbody-cutout-register.json, the sport's cut-out
 * register, the local portrait map (assets/local-images.js). UFC records and form: data/ufc-fighter-form.json.
 * Mounts into [data-befn-analysis="boxing"|"mma"]. Pure builders are exported for tests. */
(function (root) {
  'use strict';
  const ORGS = ['WBA', 'WBC', 'IBF', 'WBO'];
  const DAY = 86400000, WINDOW_DAYS = 14;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const surname = n => String(n || '').trim().split(/\s+/).pop();
  const initials = n => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const dayKey = ms => new Date(ms).toISOString().slice(0, 10);
  const fmt = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
  const isTitle = b => /title|championship/i.test(b && b.note || '') && !/eliminator/i.test(b && b.note || '');
  const methodKind = m => { const l = String(m || '').toLowerCase(); return /no contest|draw/.test(l) ? 'other' : /sub/.test(l) ? 'sub' : /\bt?ko\b|ko\/tko|stoppage|rtd|retire/.test(l) ? 'ko' : /decision/.test(l) ? 'dec' : 'other'; };
  /* The finishing technique a method line names ("KO/TKO (knee to head at distance)" is knee), or '' when it names none. */
  const technique = m => { const l = String(m || '').toLowerCase(); return /\bknees?\b/.test(l) ? 'knee' : /\bkicks?\b/.test(l) ? 'kick' : /\belbows?\b/.test(l) ? 'elbow' : /\bslam/.test(l) ? 'slam' : /\bpunch/.test(l) ? 'punch' : ''; };
  const shortMethod = m => String(m || '').replace(/\s*\(.*\)\s*$/, '');

  /* ---------- builders (pure) ---------- */
  /* Each division: for each major belt the full champion, or failing that the WBA-style regular holder. */
  function titleGrid(divisions) {
    return (divisions || []).map(d => {
      const cells = {}, count = new Map();
      for (const o of ORGS) {
        const list = ((d.belts || {})[o] || []).filter(h => h && h.name && !/vacant/i.test(h.name));
        const full = list.find(h => !/regular|interim/i.test(h.status || '')), reg = list.find(h => /regular/i.test(h.status || ''));
        cells[o] = full ? { name: full.name, defences: full.defences } : reg ? { name: reg.name, regular: true } : null;
        if (full) count.set(full.name, (count.get(full.name) || 0) + 1);
      }
      const most = Math.max(0, ...count.values());
      const lead = [...count.entries()].find(([, c]) => c === most);
      const kind = most === 4 ? 'undisputed' : most >= 2 ? 'unified' : 'split';
      return { division: d.division, cells, kind, lead: most >= 2 && lead ? lead[0] : '' };
    });
  }
  function titleFights(events, sport, now) {
    const today = dayKey(now), to = dayKey(now + 28 * DAY);
    return (events || []).filter(e => e && e.sport === sport && e.date >= today && e.date <= to && Array.isArray(e.bouts) && e.bouts[0] && isTitle(e.bouts[0]))
      .filter(e => sport !== 'mma' || /^ufc/i.test(e.promotion || ''))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(e => { const b = e.bouts[0]; return { id: e.id, date: e.date, division: b.division || '', fighters: b.fighters, note: b.note || '',
        belts: ORGS.filter(o => new RegExp('\\b' + o + '\\b').test(b.note || '')), unification: /unification/i.test(b.note || ''), vacant: /vacant/i.test(b.note || ''),
        reported: e.sourceStatus === 'reported' }; });
  }
  function recent(results, sport, now) {
    const from = dayKey(now - WINDOW_DAYS * DAY);
    return ((results && results.results) || []).filter(r => r && r.sport === sport && r.date >= from && Array.isArray(r.fighters) && r.fighters.length === 2);
  }
  function ended(rows) {
    const out = { ko: 0, sub: 0, dec: 0, other: 0, total: rows.length };
    for (const r of rows) out[methodKind(r.method)]++;
    const kos = rows.filter(r => methodKind(r.method) === 'ko' && Number.isInteger(r.winner));
    out.stoppages = kos.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4)
      .map(r => ({ date: r.date, winner: r.fighters[r.winner].name, loser: r.fighters[1 - r.winner].name, round: r.round || null, method: shortMethod(r.method),
        place: [r.event, r.location].filter(Boolean).join(' '), tech: technique(r.method),
        sameTech: kos.filter(o => o.eventId === r.eventId && technique(o.method) === technique(r.method)).length }));
    return out;
  }
  /* Stoppage video (owner, 25 Nov 2026; tightened the same day after a reaction clip showed as the finish). A clip shows only if it is
     a finish in the film feed (KO, TKO or submission), its title names the WINNER (a clip naming only the loser is usually a career
     reel), it was published on or after the fight day and within two weeks, and its title is not a reaction, compilation, full fight
     or "best of" reel. The closest to the fight date wins. The film feed's own gates (Australian playback, freshness, no shorts) decide
     which clips may show, so `clips` is FightFilm.pool(...). A stoppage with no clip gets none: never an unrelated one. */
  const norm = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const namesIn = (title, name) => { const t = '-' + norm(title) + '-', n = norm(name), last = n.split('-').pop(); return !!n && (t.includes('-' + n + '-') || (last.length > 4 && t.includes('-' + last + '-'))); };
  const NOT_THE_FINISH = /\b(react\w*|every(?:\s+\S+){0,2}?\s+(?:knock\s?outs?|k\.?os?|tkos?|finish\w*|submissions?|stoppages?|fights?|moments?|highlights?)|best|greatest|top \d+|ranked|ever|of the year|full fight|full card|marathon|compilation|comeback|press conference|weigh[- ]?in|interview|breakdown|analysis|preview)\b/i;
  /* UFC's own short uploads rarely name the fighters: "BEAUTIFUL KNEE KNOCKOUT #ufcqatar". Such a clip is matched to a stoppage only when
     its #ufc<place> tag is the stoppage's own card (the place word is in the event or location) AND its technique word is the technique
     of that stoppage AND no other stoppage on that card ended the same way, so the match is one-to-one or none. */
  const tagPlace = title => { const m = /#ufc([a-z]+)\d*/i.exec(String(title || '')); return m ? m[1].toLowerCase() : ''; };
  function stoppageClips(stoppages, clips) {
    const day = d => Date.parse(d + 'T12:00:00Z');
    const isFinish = v => v.isFinish === true || /^(ko|tko|submission)\b/i.test(v.kind || '');
    return (stoppages || []).map(s => {
      const fight = day(s.date), place = norm(s.place).replace(/-/g, '');
      const hits = (clips || []).filter(v => {
        if (!(v && v.url && v.title && v.thumbnail && isFinish(v) && !NOT_THE_FINISH.test(v.title) && Number.isFinite(day(v.date)) && day(v.date) >= fight && day(v.date) <= fight + 14 * DAY)) return false;
        if (namesIn(v.title, s.winner)) return true;
        const named = namesIn(v.title, s.loser), tag = tagPlace(v.title), t = String(v.title).toLowerCase();
        return !named && !!s.tech && s.sameTech === 1 && !!tag && place.includes(tag) && new RegExp('\\b' + s.tech + 's?\\b').test(t);
      });
      hits.sort((a, b) => Math.abs(day(a.date) - fight) - Math.abs(day(b.date) - fight));
      return Object.assign({}, s, { clip: hits[0] || null });
    });
  }

  /* A loser whose sourced pre-fight record had no losses ("26-0-0"). */
  function zerosEnded(rows) {
    return rows.filter(r => Number.isInteger(r.winner) && /^\d+-0(-\d+)?$/.test(String(r.fighters[1 - r.winner]?.preRecord || '')))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(r => { const w = r.fighters[r.winner], l = r.fighters[1 - r.winner]; return { date: r.date, division: r.division || '', winner: w.name, loser: l.name,
        record: l.preRecord.replace(/-0$/, '').replace(/-/g, '–'), method: shortMethod(r.method) }; });
  }
  function defences(divisions, limit) {
    const by = new Map();
    for (const d of divisions || []) for (const o of ORGS) for (const h of ((d.belts || {})[o] || [])) {
      if (!h || !h.name || /vacant/i.test(h.name) || /regular|interim/i.test(h.status || '') || !Number.isInteger(h.defences)) continue;
      const x = by.get(h.name) || { name: h.name, division: d.division, belts: [], defences: 0 };
      x.belts.push(o); x.defences = Math.max(x.defences, h.defences); by.set(h.name, x);
    }
    return [...by.values()].sort((a, b) => b.defences - a.defences || a.name.localeCompare(b.name)).slice(0, limit || 6);
  }

  /* ---------- champions carousel (owner, 25 Nov 2026) ----------
   * One champion per view, heaviest division first; UFC women's divisions after the men's. The figure is
   * BEFN's own picture only: a full-body cut-out from data/fullbody-cutout-register.json, else the sport's
   * head-and-shoulders cut-out, else the local portrait photo, else initials. A field with no data is left out. */
  const MMA_ORDER = ['heavyweight', 'light heavyweight', 'middleweight', 'welterweight', 'lightweight', 'featherweight', 'bantamweight', 'flyweight'];
  const BOX_ORDER = ['heavyweight', 'bridgerweight', 'cruiserweight', 'light heavyweight', 'super middleweight', 'middleweight', 'super welterweight', 'light middleweight',
    'welterweight', 'super lightweight', 'light welterweight', 'lightweight', 'super featherweight', 'featherweight', 'super bantamweight', 'bantamweight',
    'super flyweight', 'flyweight', 'light flyweight', 'minimumweight', 'strawweight'];
  /* The registers' key for a name, as scripts/photo-runner.py slugify() makes it: accents dropped, and the letters
     NFKD does not split (ł, ø, đ, ß, æ) spelled out, so "Michał Cieślak" is michal-cieslak in every register. */
  const TRANSLIT = { 'ł': 'l', 'Ł': 'L', 'ø': 'o', 'Ø': 'O', 'đ': 'd', 'Đ': 'D', 'ß': 'ss', 'æ': 'ae', 'Æ': 'Ae' };
  const slug = n => String(n || '').replace(/[łŁøØđĐßæÆ]/g, c => TRANSLIT[c]).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[‘’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const divKey = d => String(d || '').toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
  const isWomen = d => /^women'?s\b/.test(divKey(d));
  /* Rank of a division, heaviest first. UFC: every women's division after every men's one. */
  function divisionRank(division, sport) {
    const k = divKey(division), women = isWomen(division), base = women ? k.replace(/^women'?s\s+/, '') : k;
    const order = sport === 'mma' ? MMA_ORDER.concat(['strawweight']) : BOX_ORDER;
    const i = order.indexOf(base);
    return (women ? 100 : 0) + (i < 0 ? 50 : i);
  }
  const byDivision = (list, sport) => list.map((x, i) => ({ x, i, r: divisionRank(x.division, sport) })).sort((a, b) => a.r - b.r || a.i - b.i).map(o => o.x);
  const shortDiv = d => String(d || '').replace(/^Women[\u2019']?s\s+/i, 'W ');
  const fmtYear = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(',', '');
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  /* "14 Sep 2026" (the title tracker's form) to a UTC day, or null. */
  function trackerDate(s) {
    const m = /^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})$/.exec(String(s || '').trim());
    if (!m || !(m[2].toLowerCase() in MONTHS)) return null;
    return Date.UTC(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  }
  const num = v => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : null; };
  const n0 = v => Number(v).toLocaleString('en-GB');
  /* The picture for a champion, best first: (a) full-body cut-out, (b) the sport's cut-out, (c) the local portrait, (d) initials. */
  function figureFor(name, sport, regs, portrait) {
    const k = slug(name), fb = regs && regs.fullbody && regs.fullbody[k];
    if (fb && fb.ok === true && fb.sport === sport && fb.attestation) return { kind: 'full', url: 'assets/img/fullbody-cutouts/' + k + '.webp' };
    const c = regs && regs.cutouts && regs.cutouts[k];
    if (c && c.ok === true) return { kind: 'cut', url: (sport === 'boxing' ? 'assets/img/boxing-cutouts/' : 'assets/img/ufc-cutouts/') + k + '.webp' };
    const p = portrait ? portrait(name) : '';
    if (p) return { kind: 'photo', url: p };
    return { kind: 'none', url: '', initials: initials(name) };
  }
  /* The champion's next title bout on the schedule (eliminators, interim and BMF titles are not theirs to defend). */
  function nextTitleFight(events, sport, name, now) {
    const today = dayKey(now), me = slug(name);
    const hits = [];
    for (const e of events || []) {
      if (!e || e.sport !== sport || !(e.date >= today) || !Array.isArray(e.bouts)) continue;
      if (sport === 'mma' && !/^ufc/i.test(e.promotion || '')) continue;
      for (const b of e.bouts) {
        if (!b || !Array.isArray(b.fighters) || b.fighters.length !== 2 || !isTitle(b) || /interim|bmf/i.test(b.note || '')) continue;
        const i = b.fighters.findIndex(f => slug(f) === me);
        if (i >= 0) hits.push({ date: e.date, opponent: b.fighters[1 - i], note: b.note || '', reported: e.sourceStatus === 'reported' });
      }
    }
    return hits.sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  }
  const ufcRecord = r => Array.isArray(r) && r.length >= 2 && r.slice(0, 2).every(Number.isInteger) ? r[0] + '–' + r[1] + (r[2] ? '–' + r[2] : '') + (r[3] ? ' (' + r[3] + ' NC)' : '') : '';
  /* ctx: { champions (D.champions.mma), now, events, form (ufc-fighter-form.json), regs {fullbody, cutouts}, portrait(name) } */
  function mmaSlides(ctx) {
    const list = byDivision(((ctx && ctx.champions) || []).filter(c => c && c.name && !/vacant/i.test(c.name)), 'mma');
    const forms = (ctx.form && ctx.form.fighters) || {};
    return list.map(c => {
      const k = slug(c.name), f = forms[k] && slug(forms[k].name) === k ? forms[k] : null;
      const start = trackerDate(c.start), today = Date.UTC(new Date(ctx.now).getUTCFullYear(), new Date(ctx.now).getUTCMonth(), new Date(ctx.now).getUTCDate());
      const days = start !== null && today >= start ? Math.round((today - start) / DAY) : num(c.days);
      const stats = [];
      if (start !== null) stats.push({ label: 'Champion since', value: c.start.trim() });
      if (days !== null) stats.push({ label: 'Days as champion', value: n0(days) });
      if (Number.isInteger(c.defences)) stats.push({ label: 'Title defences', value: String(c.defences) });
      const rec = f ? ufcRecord(f.record) : '';
      if (rec) stats.push({ label: 'UFC record', value: rec });
      const form = f && Array.isArray(f.last5) ? f.last5.filter(o => ['W', 'L', 'D', 'NC'].includes(o)).slice(0, 5) : [];
      return { division: c.division, name: c.name, eyebrow: c.division + ' champion', href: f ? '#fighter/ufc--' + encodeURIComponent(k) : '',
        figure: figureFor(c.name, 'ufc', ctx.regs, ctx.portrait), stats, next: nextTitleFight(ctx.events, 'mma', c.name, ctx.now), form: form.length ? form : null, holders: null };
    });
  }
  /* Boxing: one slide per division. The figure is whoever holds the most of the four belts (if tied, the longest reign);
     every belt holder is listed under it. Regular and interim holders count only when nobody holds a full belt. */
  function boxingSlides(ctx) {
    const out = [];
    const roster = (ctx && ctx.roster) || [];
    for (const d of byDivision(((ctx && ctx.champions) || []).filter(d => d && d.division), 'boxing')) {
      const held = new Map(), vacant = [];
      for (const o of ORGS) {
        const list = ((d.belts || {})[o] || []).filter(h => h && h.name && !/vacant/i.test(h.name));
        if (!list.length) vacant.push(o);
        for (const h of list) {
          const regular = /regular/i.test(h.status || ''), interim = /interim/i.test(h.status || ''), full = !regular && !interim;
          if (!held.has(h.name)) held.set(h.name, { name: h.name, belts: [], full: 0, days: null, defences: null });
          const x = held.get(h.name);
          x.belts.push({ org: o, regular, interim });
          const dd = num(h.days);
          if (full) {
            x.full++;
            if (dd !== null) x.days = Math.max(x.days ?? 0, dd);
            if (Number.isInteger(h.defences)) x.defences = Math.max(x.defences ?? 0, h.defences);
          } else if (dd !== null) x.subDays = Math.max(x.subDays ?? 0, dd);
        }
      }
      const holders = [...held.values()];
      if (!holders.length) continue;
      const anyFull = holders.some(h => h.full);
      const pool = anyFull ? holders.filter(h => h.full) : holders;
      const reign = h => (anyFull ? h.days : h.subDays) ?? -1;
      const champ = pool.slice().sort((a, b) => b.full - a.full || reign(b) - reign(a))[0];
      const kind = champ.full === 4 ? 'undisputed' : champ.full >= 2 ? 'unified' : 'single';
      const firstBelt = champ.belts[0];
      const eyebrow = d.division + ' · ' + (kind === 'undisputed' ? 'undisputed champion' : kind === 'unified' ? 'unified champion'
        : firstBelt.org + (firstBelt.regular ? ' regular' : firstBelt.interim ? ' interim' : '') + ' champion');
      const stats = [];
      const days = anyFull ? champ.days : champ.subDays;
      if (days !== null && days !== undefined) stats.push({ label: 'Days as champion', value: n0(days) });
      if (anyFull && Number.isInteger(champ.defences)) stats.push({ label: 'Title defences', value: String(champ.defences) });
      const r = roster.find(f => f && slug(f.name) === slug(champ.name));
      if (r && r.record) stats.push({ label: 'Pro record', value: r.record });
      const form = r && Array.isArray(r.last) ? r.last.filter(o => ['W', 'L', 'D', 'NC'].includes(o)).slice(0, 5) : [];
      const order = [champ].concat(holders.filter(h => h !== champ));
      out.push({ division: d.division, name: champ.name, eyebrow, kind, href: r && r.id ? '#fighter/' + encodeURIComponent(r.id) : '',
        figure: figureFor(champ.name, 'boxing', ctx.regs, ctx.portrait), stats, next: nextTitleFight(ctx.events, 'boxing', champ.name, ctx.now),
        form: form.length >= 3 ? form : null, holders: order.map(h => ({ name: h.name, belts: h.belts })), vacant });
    }
    return out;
  }
  function carouselHTML(slides, o) {
    if (!slides.length) return '';
    const N = slides.length, word = o.word || 'champion';
    const peek = (cls, i, dir) => { if (N < 2) return ''; const s = slides[(i + N) % N];
      return '<button type="button" class="fa-cs-arrow ' + cls + '" data-cs-' + dir + ' aria-label="' + esc((dir === 'prev' ? 'Previous ' : 'Next ') + word + ': ' + s.division + ', ' + s.name) + '">' +
        '<span class="fa-cs-ico" aria-hidden="true">' + (dir === 'prev' ? '‹' : '›') + '</span><span class="fa-cs-peek" aria-hidden="true"><small>' + esc(s.division) + '</small><b>' + esc(s.name) + '</b></span></button>'; };
    const figure = (s, i) => { const f = s.figure;
      if (f.kind === 'none') return '<div class="fa-cs-fig is-none"><span class="fa-cs-ini" aria-hidden="true">' + esc(f.initials) + '</span></div>';
      return '<div class="fa-cs-fig is-' + f.kind + '"><img src="' + esc(f.url) + '" alt="' + esc(s.name) + '" data-ini="' + esc(initials(s.name)) + '"' + (i < 2 ? '' : ' loading="lazy"') + ' decoding="async"></div>'; };
    const chip = x => '<b class="is-' + (x === 'W' ? 'w' : x === 'L' ? 'l' : 'd') + '">' + esc(x === 'NC' ? 'NC' : x) + '</b>';
    const slide = (s, i) => '<article class="fa-cs-slide" role="group" aria-roledescription="slide" aria-label="' + esc((i + 1) + ' of ' + N + ': ' + s.name + ', ' + s.division) + '" data-cs-div="' + esc(s.division) + '" data-cs-name="' + esc(s.name) + '">' +
      figure(s, i) + '<div class="fa-cs-info"><p class="fa-cs-div">' + esc(s.eyebrow) + '</p>' +
      '<h3 class="fa-cs-name">' + (s.href ? '<a href="' + esc(s.href) + '">' + esc(s.name) + '</a>' : esc(s.name)) + '</h3>' +
      (s.stats.length ? '<dl class="fa-cs-stats is-n' + s.stats.length + '">' + s.stats.map(x => '<div><dt>' + esc(x.label) + '</dt><dd>' + esc(x.value) + '</dd></div>').join('') + '</dl>' : '') +
      (s.next || s.form ? '<div class="fa-cs-more">' +
        (s.next ? '<div class="fa-cs-next"><span class="fa-cs-k">Next title fight</span><b>vs ' + esc(s.next.opponent) + '</b><span>' + esc(fmtYear(s.next.date)) + '</span>' + (s.next.reported ? '<em>Reported</em>' : '') + '</div>' : '') +
        (s.form ? '<div class="fa-cs-form"><span class="fa-cs-k">Last ' + s.form.length + ', newest first</span><span class="fa-cs-l5" role="img" aria-label="' + esc('Last ' + s.form.length + ' fights, newest first: ' + s.form.join(' ')) + '">' + s.form.map(chip).join('') + '</span></div>' : '') +
        '</div>' : '') +
      (s.holders ? '<div class="fa-cs-holders"><span class="fa-cs-k">Belt holders</span><ul>' + s.holders.map(h => '<li><span class="fa-cs-hn">' + esc(h.name) + '</span><span class="fa-belts">' +
        h.belts.map(b => b.regular || b.interim ? '<i class="is-reg">' + b.org + ' (' + (b.regular ? 'regular' : 'interim') + ')</i>' : '<i>' + b.org + '</i>').join('') + '</span></li>').join('') + '</ul>' +
        (s.vacant && s.vacant.length ? '<p class="fa-cs-vac">Vacant: ' + esc(s.vacant.join(', ')) + '</p>' : '') + '</div>' : '') +
      '</div></article>';
    return '<section class="sov-blk fa-cs" role="region" aria-roledescription="carousel" aria-label="' + esc(o.title) + '" data-fa-cs data-portrait-ignore>' +
      '<div class="sov-hd fa-cs-hd"><h2>' + esc(o.title) + '</h2><span class="fa-cs-count" aria-live="polite" aria-atomic="true"><span class="fa-sr">' + esc(word.charAt(0).toUpperCase() + word.slice(1)) + ' </span><span data-cs-n>1</span> / ' + N + '</span></div>' +
      (o.sub ? '<p class="sov-sub">' + esc(o.sub) + '</p>' : '') +
      '<div class="fa-cs-chips" role="group" aria-label="Divisions">' + slides.map((s, i) => '<button type="button" class="fa-cs-chip' + (i ? '' : ' is-on') + '" data-cs-go="' + i + '" aria-pressed="' + (i ? 'false' : 'true') + '" aria-label="' + esc(s.division) + '">' + esc(shortDiv(s.division)) + '</button>').join('') + '</div>' +
      '<div class="fa-cs-stage">' + peek('is-prev', -1, 'prev') +
      '<div class="fa-cs-track" tabindex="0" aria-label="' + esc(o.title + ': use the arrow keys or swipe') + '">' + slides.map(slide).join('') + '</div>' +
      peek('is-next', 1, 'next') + '</div>' +
      '<div class="fa-cs-dots" aria-hidden="true">' + slides.map((s, i) => '<i' + (i ? '' : ' class="is-on"') + '></i>').join('') + '</div>' +
      '<p class="fa-cs-hint">Swipe for the next ' + esc(word) + '</p></section>';
  }

  /* Compact champion strip (owner, 28 Nov 2026: "Compact strip"): every champion on one row of small tiles, so the
     leaderboards below start within two phone screens. A swipe rail on the phone, two rows on desktop. Tap a tile for the
     profile; the division name opens that division in the Fighters hub. */
  function champStripHTML(slides, o) {
    if (!slides.length) return '';
    const chip = x => '<b class="is-' + (x === 'W' ? 'w' : x === 'L' ? 'l' : 'd') + '">' + esc(x === 'NC' ? 'NC' : x) + '</b>';
    const stat = (s, label) => (s.stats.find(x => x.label === label) || {}).value || '';
    const hubDiv = d => String(d || '').toLowerCase().replace(/[\u2019']/g, '').replace(/^women?s\s+/, 'womens-').replace(/\s+/g, '-');
    const tile = (s, i) => {
      const f = s.figure, pic = f.kind === 'none' ? '<span class="fa-ch-ini" aria-hidden="true">' + esc(f.initials) + '</span>' :
        '<img src="' + esc(f.url) + '" alt="" ' + (i < 4 ? '' : 'loading="lazy" ') + 'decoding="async" onerror="this.remove()">';
      const days = stat(s, 'Days as champion'), def = stat(s, 'Title defences'), rec = stat(s, 'UFC record') || stat(s, 'Pro record');
      const name = s.href ? '<a class="fa-ch-name" href="' + esc(s.href) + '">' + esc(s.name) + '</a>' : '<span class="fa-ch-name">' + esc(s.name) + '</span>';
      return '<li class="fa-ch"><span class="fa-ch-pic is-' + esc(f.kind) + '">' + pic + '</span><span class="fa-ch-body">' +
        '<a class="fa-ch-div" href="#fighters" data-hub-division="' + esc(hubDiv(s.division)) + '">' + esc(shortDiv(s.division)) + '</a>' + name +
        '<span class="fa-ch-meta">' + esc([rec, days ? days + ' days' : '', def ? def + (def === '1' ? ' defence' : ' defences') : ''].filter(Boolean).join(' · ')) + '</span>' +
        (s.form ? '<span class="fa-cs-l5" role="img" aria-label="' + esc('Last ' + s.form.length + ', newest first: ' + s.form.join(' ')) + '">' + s.form.map(chip).join('') + '</span>' : '') +
        (s.next ? '<span class="fa-ch-next">Next: vs ' + esc(s.next.opponent) + ' · ' + esc(fmt(s.next.date)) + '</span>' : '') + '</span></li>';
    };
    return '<section class="sov-blk fa-champs-strip" data-portrait-ignore><div class="sov-hd fa-cs-hd"><h2>' + esc(o.title) + '</h2></div>' +
      '<ul class="fa-ch-list">' + slides.map(tile).join('') + '</ul></section>';
  }

  /* ---------- rendering ---------- */
  function helpers() {
    const img = n => root.BEFNLocalImages ? root.BEFNLocalImages.url(n, 'thumb') : '';
    const face = (n, cls) => { const u = img(n); return u ? '<img class="fa-f ' + (cls || '') + '" src="' + esc(u) + '" alt="" loading="lazy">' : '<span class="fa-f is-none ' + (cls || '') + '" aria-hidden="true">' + esc(initials(n)) + '</span>'; };
    const poster = id => { const p = (root.BEFNLocalPosters || {})[id]; const x = p && (p.portrait || p.landscape); return x && /^assets\/img\/posters\/[a-z0-9-]+\.webp$/.test(x.url) ? x.url : ''; };
    return { face, poster };
  }
  const head = (t, sub) => '<div class="sov-hd"><h2>' + esc(t) + '</h2></div>' + (sub ? '<p class="sov-sub">' + esc(sub) + '</p>' : '');

  function gridHTML(H, grid) {
    const n = k => grid.filter(g => g.kind === k).length;
    return '<section class="sov-blk">' + head('The title picture', 'Who holds the four major belts in each division. Gold row: undisputed. Tinted cells: one boxer holding more than one belt. Regular titles in grey.') +
      '<div class="fa-stats"><div><b>' + n('undisputed') + '</b><span>undisputed</span></div><div><b>' + n('unified') + '</b><span>unified (2 or 3 belts)</span></div><div><b>' + n('split') + '</b><span>split: no one holds two</span></div></div>' +
      '<div class="fa-scroll"><table class="fa-grid"><thead><tr><th scope="col">Division</th>' + ORGS.map(o => '<th scope="col">' + o + '</th>').join('') + '</tr></thead><tbody>' +
      grid.map(g => '<tr class="is-' + g.kind + '"><th scope="row">' + esc(g.division) + '</th>' + ORGS.map(o => { const c = g.cells[o];
        if (!c) return '<td><span class="fa-vac">Vacant</span></td>';
        return '<td class="' + (c.regular ? 'is-regular' : g.lead && c.name === g.lead ? 'is-same' : '') + '"><span class="fa-name">' + H.face(c.name, 'is-xs') + esc(surname(c.name)) + (c.regular ? ' <small>(regular)</small>' : '') + '</span></td>'; }).join('') + '</tr>').join('') +
      '</tbody></table></div></section>';
  }
  function fightsHTML(H, list, title) {
    if (!list.length) return '';
    return '<section class="sov-blk">' + head(title, list.length + (list.length === 1 ? ' title fight' : ' title fights') + ' in the next four weeks') + '<div class="fa-tf">' + list.map(f => {
      const p = H.poster(f.id);
      return '<a class="fa-tf-card" href="#fights">' + (p ? '<img class="fa-tf-p" src="' + esc(p) + '" alt="" loading="lazy">' : '<span class="fa-tf-p is-pair">' + H.face(f.fighters[0]) + H.face(f.fighters[1], 'is-l') + '</span>') +
        '<span class="fa-tf-body"><span class="sov-ev">' + esc(fmt(f.date) + (f.division ? ' · ' + f.division : '')) + '</span><strong>' + esc(f.fighters.join(' vs ')) + '</strong>' +
        '<span class="fa-belts">' + f.belts.map(o => '<i>' + o + '</i>').join('') + (f.unification ? '<em>Unification</em>' : '') + (f.vacant ? '<em>Vacant</em>' : '') +
        (!f.belts.length ? '<i>' + esc(f.note.split('·')[0].trim()) + '</i>' : '') + (f.reported ? '<em class="is-amber">Reported</em>' : '') + '</span></span></a>';
    }).join('') + '</div></section>';
  }
  function endedHTML(H, e, sport) {
    if (!e.total) return '';
    const inside = e.ko + e.sub;
    if (sport === 'mma') {
      /* MMA (owner, 28 Nov 2026: one short strip): one stacked bar and a legend instead of four bars. */
      const parts = [[e.ko, 'KO/TKO', 'is-ko'], [e.sub, 'Submission', 'is-sub'], [e.dec, 'Decision', 'is-dec'], [e.other, 'Other', 'is-oth']].filter(x => x[0]);
      return '<section class="sov-blk fa-ended-strip">' + head('How fights ended', e.total + ' MMA results, last two weeks · ' + Math.round(inside / e.total * 100) + '% inside the distance') +
        '<div class="fa-stack" role="img" aria-label="' + esc(parts.map(x => x[1] + ' ' + x[0]).join(', ')) + '">' + parts.map(x => '<i class="' + x[2] + '" style="width:' + (x[0] / e.total * 100).toFixed(1) + '%"></i>').join('') + '</div>' +
        '<ul class="fa-legend">' + parts.map(x => '<li><i class="' + x[2] + '"></i>' + x[1] + ' <b>' + x[0] + '</b></li>').join('') + '</ul>' +
        (e.stoppages.length ? '<div class="fa-stops"><span class="sov-ev">Latest stoppages</span><div class="fa-stop-grid">' + e.stoppages.map(s => stopHTML(H, s)).join('') + '</div></div>' : '') + '</section>';
    }
    const bar = (n, label, cls) => '<div class="fa-bar"><span>' + label + '</span><i class="' + cls + '" style="width:' + (n / e.total * 100).toFixed(1) + '%"></i><b>' + n + '</b></div>';
    return '<section class="sov-blk">' + head('How fights ended', 'All ' + e.total + ' ' + (sport === 'mma' ? 'MMA' : 'boxing') + ' results BEFN holds from the last two weeks') +
      '<div class="fa-bars">' + bar(e.ko, 'KO / TKO', 'is-ko') + (sport === 'mma' ? bar(e.sub, 'Submission', 'is-sub') : '') + bar(e.dec, 'Decision', 'is-dec') + bar(e.other, 'Draw, no contest, other', 'is-oth') +
      '<p class="sov-sub fa-note">' + Math.round(inside / e.total * 100) + '% ended inside the distance.</p></div>' +
      (e.stoppages.length ? '<div class="fa-stops"><span class="sov-ev">Latest stoppages</span><div class="fa-stop-grid">' + e.stoppages.map(s => stopHTML(H, s)).join('') + '</div></div>' : '') + '</section>';
  }
  function stopHTML(H, s) {
    const line = '<b>' + esc(s.winner) + '</b> stopped ' + esc(s.loser) + (s.round ? ' in round ' + s.round : '');
    const v = s.clip;
    if (!v) return '<div class="fa-stop">' + H.face(s.winner, 'is-xs') + '<span>' + line + '</span></div>';
    const id = root.FightFilm && root.FightFilm.youtubeId ? root.FightFilm.youtubeId(v.url) : '';
    const thumb = '<img src="' + esc(v.thumbnail) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="fa-play" aria-hidden="true">▶</span>';
    const meta = esc([v.publisher || 'Publisher', fmt(v.date)].filter(Boolean).join(' · '));
    const media = id ? '<button type="button" class="fa-vid" data-fa-play="' + esc(id) + '" data-fa-title="' + esc(v.title) + '" aria-label="Play: ' + esc(v.title) + '">' + thumb + '</button>'
      : '<a class="fa-vid" href="' + esc(v.url) + '" target="_blank" rel="noopener noreferrer" aria-label="Watch on ' + esc(v.publisher || 'the publisher') + ': ' + esc(v.title) + '">' + thumb + '</a>';
    return '<div class="fa-stop has-video">' + media + '<span class="fa-stop-cap">' + line + '<small>' + meta + '</small></span></div>';
  }
  function defencesHTML(H, list) {
    if (!list.length) return '';
    return '<section class="sov-blk">' + head('Most title defences', 'Current champions, from BEFN’s title tracker') + '<ol class="fa-def">' + list.map((r, i) =>
      '<li><span class="fa-rank">' + (i + 1) + '</span>' + H.face(r.name) + '<span class="fa-def-n"><b>' + esc(r.name) + '</b><small>' + esc(r.division + ' · ' + r.belts.join(', ')) + '</small></span><em>' + r.defences + '</em></li>').join('') + '</ol></section>';
  }
  function zerosHTML(H, list) {
    if (!list.length) return '';
    return '<section class="sov-blk">' + head('Unbeaten records ended', list.length + (list.length === 1 ? ' boxer' : ' boxers') + ' lost their 0 in the last two weeks') + '<div class="sov-grid2">' + list.map(z =>
      '<article class="sov-res"><span class="sov-pair">' + H.face(z.winner, 'sov-f') + H.face(z.loser, 'sov-f is-l') + '</span><div><span class="sov-ev">' + esc(fmt(z.date) + (z.division ? ' · ' + z.division : '')) + '</span>' +
      '<strong><b>' + esc(z.winner) + '</b> beat ' + esc(z.loser) + '</strong><span class="sov-m">' + esc(surname(z.loser) + ' was ' + z.record + (z.method ? ' · ' + z.method : '')) + '</span></div></article>').join('') + '</div></section>';
  }
  function unbeatenHTML(H, list) {
    if (!list.length) return '';
    return '<section class="sov-blk">' + head('Unbeaten watch', 'Contenders and prospects without a loss, most wins first') + '<div class="fa-ub">' + list.map(f =>
      '<a href="#fighter/' + encodeURIComponent(f.id) + '">' + H.face(f.name) + '<span><b>' + esc(f.name) + '</b><small>' + esc(f.division + ' · ' + String(f.record).split(' (')[0]) + '</small></span></a>').join('') + '</div></section>';
  }
  /* Where the local portrait for a name lives ('' when BEFN holds none). */
  const portraitOf = ctx => ctx.portrait || (n => root.BEFNLocalImages ? root.BEFNLocalImages.url(n, 'portrait') : '');
  const regsOf = (ctx, sport) => ({ fullbody: ctx.fullbody && ctx.fullbody.cutouts, cutouts: ((sport === 'boxing' ? ctx.boxingCutouts : ctx.ufcCutouts) || {}).cutouts });
  function withClips(e, ctx, sport) {
    const clips = root.FightFilm && root.FightFilm.pool && ctx.film ? root.FightFilm.pool(ctx.film, sport, ctx.now, { shorts: true }) : [];
    e.stoppages = stoppageClips(e.stoppages, clips); return e;
  }
  function boxingPage(ctx) {
    const H = helpers(), D = ctx.data || {}, now = ctx.now;
    const rows = recent(ctx.results, 'Boxing', now);
    const roster = root.BEFNBoxingHub ? root.BEFNBoxingHub.roster(D.fighters, ctx.results) : [];
    const unbeaten = root.BEFNBoxingHub ? root.BEFNBoxingHub.unbeaten(roster).slice(0, 8) : [];
    const slides = boxingSlides({ champions: D.champions && D.champions.boxing, roster, now, events: ctx.events, regs: regsOf(ctx, 'boxing'), portrait: portraitOf(ctx) });
    return '<div class="sov fa"><h1 class="fa-h1">Boxing analysis</h1>' +
      carouselHTML(slides, { title: 'World champions', sub: 'WBA, WBC, IBF and WBO, from BEFN’s title tracker. One division at a time, heaviest first.' }) +
      gridHTML(H, titleGrid(D.champions && D.champions.boxing)) +
      fightsHTML(H, titleFights(ctx.events, 'boxing', now), 'Title fights coming up') +
      '<div class="fa-two">' + endedHTML(H, withClips(ended(rows), ctx, 'boxing'), 'boxing') + defencesHTML(H, defences(D.champions && D.champions.boxing, 6)) + '</div>' +
      zerosHTML(H, zerosEnded(rows)) + unbeatenHTML(H, unbeaten) +
      '<p class="sov-sub fa-foot">From BEFN’s title tracker, the schedule and the verified results feed. Results cover the last two weeks BEFN holds.</p></div>';
  }
  function mmaTop(ctx) {
    const H = helpers(), D = ctx.data || {}, now = ctx.now;
    const slides = mmaSlides({ champions: D.champions && D.champions.mma, now, events: ctx.events, form: ctx.form, regs: regsOf(ctx, 'ufc'), portrait: portraitOf(ctx) });
    return '<div class="sov fa fa-mma"><a class="fp-teaser" href="#predictions"><span><b>Fight predictions</b><small>Who wins, whether it ends in a finish and how, for the announced UFC cards</small></span><span class="fp-teaser-go">Open</span></a>' + champStripHTML(slides, { title: 'UFC champions' }) +
      '<div class="fa-two">' + endedHTML(H, withClips(ended(recent(ctx.results, 'MMA', now)), ctx, 'mma'), 'mma') + fightsHTML(H, titleFights(ctx.events, 'mma', now), 'UFC title fights coming up') + '</div></div>';
  }

  /* ---------- browser ---------- */
  /* Keeps one carousel's counter, chips, dots and arrow labels in step with the track's scroll position. */
  function wire(sec) {
    if (!sec || sec.dataset.csWired) return;
    sec.dataset.csWired = '1';
    const track = sec.querySelector('.fa-cs-track'), slides = [...track.querySelectorAll('.fa-cs-slide')], N = slides.length;
    const chips = [...sec.querySelectorAll('[data-cs-go]')], dots = [...sec.querySelectorAll('.fa-cs-dots i')], row = sec.querySelector('.fa-cs-chips');
    const counter = sec.querySelector('[data-cs-n]'), prev = sec.querySelector('[data-cs-prev]'), next = sec.querySelector('[data-cs-next]');
    const reduce = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let cur = 0, lock = null, timer = 0, raf = 0;
    const label = (btn, i, dir) => { if (!btn) return; const s = slides[(i + N) % N];
      btn.setAttribute('aria-label', (dir < 0 ? 'Previous ' : 'Next ') + 'champion: ' + s.dataset.csDiv + ', ' + s.dataset.csName);
      btn.querySelector('.fa-cs-peek small').textContent = s.dataset.csDiv; btn.querySelector('.fa-cs-peek b').textContent = s.dataset.csName; };
    function set(i) {
      if (i === cur && counter.textContent === String(i + 1)) return;
      cur = i; counter.textContent = String(i + 1);
      chips.forEach((c, j) => { c.classList.toggle('is-on', j === i); c.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
      dots.forEach((d, j) => d.classList.toggle('is-on', j === i));
      label(prev, i - 1, -1); label(next, i + 1, 1);
      const c = chips[i];
      if (c && row) row.scrollTo({ left: Math.max(0, c.offsetLeft - (row.clientWidth - c.offsetWidth) / 2), behavior: reduce() ? 'auto' : 'smooth' });
    }
    function go(i) {
      i = ((i % N) + N) % N; lock = i; clearTimeout(timer); timer = setTimeout(() => { lock = null; }, 900);
      track.scrollTo({ left: slides[i].offsetLeft, behavior: reduce() ? 'auto' : 'smooth' });
      set(i);
    }
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const i = Math.max(0, Math.min(N - 1, Math.round(track.scrollLeft / Math.max(1, track.clientWidth))));
        if (lock !== null) { if (i !== lock) return; lock = null; }
        set(i);
      });
    }, { passive: true });
    chips.forEach(c => c.addEventListener('click', () => go(+c.dataset.csGo)));
    if (prev) prev.addEventListener('click', () => go(cur - 1));
    if (next) next.addEventListener('click', () => go(cur + 1));
    sec.addEventListener('keydown', e => {
      const k = e.key, to = k === 'ArrowRight' ? cur + 1 : k === 'ArrowLeft' ? cur - 1 : k === 'Home' ? 0 : k === 'End' ? N - 1 : null;
      if (to === null || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault(); go(to);
    });
    /* A picture that fails to load gives way to the initials. */
    sec.querySelectorAll('.fa-cs-fig img').forEach(img => img.addEventListener('error', () => {
      const f = img.parentNode; f.className = 'fa-cs-fig is-none'; f.innerHTML = '<span class="fa-cs-ini" aria-hidden="true">' + esc(img.dataset.ini || '') + '</span>';
    }, { once: true }));
    if (root.addEventListener) root.addEventListener('resize', () => { if (sec.isConnected) track.scrollLeft = slides[cur].offsetLeft; });
  }
  const URLS = { events: 'data/upcoming-cards.json', results: 'data/results.json', form: 'data/ufc-fighter-form.json',
    ufcCutouts: 'data/ufc-cutout-register.json', boxingCutouts: 'data/boxing-cutout-register.json', fullbody: 'data/fullbody-cutout-register.json', film: 'data/fight-film.json' };
  const NEEDS = { mma: ['events', 'results', 'form', 'ufcCutouts', 'fullbody', 'film'], boxing: ['events', 'results', 'boxingCutouts', 'fullbody', 'film'] };
  const st = {}, pending = {};
  function get(key) {
    if (!pending[key]) pending[key] = fetch(URLS[key]).then(r => r.ok ? r.json() : null).catch(() => null).then(v => {
      st[key] = key === 'events' ? (v && Array.isArray(v.events) ? v.events : []) : key === 'results' ? (v || { results: [] }) : v;
      return st[key];
    });
    return pending[key];
  }
  function render(m) {
    const kind = m.dataset.befnAnalysis === 'mma' ? 'mma' : 'boxing';
    if (!NEEDS[kind].every(k => k in st)) { m.innerHTML = '<p class="front-loading" role="status">Loading analysis…</p>'; return; }
    const ctx = Object.assign({ data: root.COMBAT_DATA, now: Date.now() }, st);
    m.innerHTML = kind === 'mma' ? mmaTop(ctx) : boxingPage(ctx);
    m.querySelectorAll('[data-fa-cs]').forEach(wire);
  }
  function scan() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-befn-analysis]').forEach(m => {
      if (m.dataset.faDone) return; m.dataset.faDone = '1'; render(m);
      const kind = m.dataset.befnAnalysis === 'mma' ? 'mma' : 'boxing';
      Promise.all(NEEDS[kind].map(get)).then(() => { if (m.isConnected) render(m); });
    });
  }
  function play(btn) {
    const id = btn.getAttribute('data-fa-play'); if (!/^[\w-]{11}$/.test(id || '')) return;
    const d = root.document, frame = d.createElement('iframe'), box = d.createElement('div');
    frame.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
    frame.title = btn.getAttribute('data-fa-title') || 'YouTube video';
    frame.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture'); frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    box.className = 'fa-vid fa-player'; box.appendChild(frame); btn.replaceWith(box); frame.focus();
  }
  if (typeof document !== 'undefined') document.addEventListener('click', e => { const t = e.target.closest && e.target.closest('[data-fa-play]'); if (t && t.closest('.fa')) { e.preventDefault(); play(t); } });
  const api = { technique, stoppageClips, titleGrid, titleFights, recent, ended, zerosEnded, defences, boxingPage, mmaTop, methodKind,
    divisionRank, figureFor, nextTitleFight, mmaSlides, boxingSlides, carouselHTML, champStripHTML };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BEFNFightAnalysis = api;
  if (typeof document !== 'undefined') {
    if (typeof MutationObserver !== 'undefined') new MutationObserver(scan).observe(document.documentElement, { subtree: true, childList: true });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  }
})(typeof window !== 'undefined' ? window : globalThis);
