/* Analysis pages (owner, 24 Nov 2026). Boxing: the title picture, title fights coming up, how fights ended,
 * most title defences, unbeaten records ended and an unbeaten watch. MMA: a short top section (UFC champions,
 * UFC title fights coming up, how fights ended) above the UFC stats leaderboards.
 * Data the site already holds: window.COMBAT_DATA (title tracker and scouting roster), data/upcoming-cards.json
 * and data/results.json (verified results; "the last two weeks" means results dated within 14 days of today).
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
    out.stoppages = rows.filter(r => methodKind(r.method) === 'ko' && Number.isInteger(r.winner)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4)
      .map(r => ({ date: r.date, winner: r.fighters[r.winner].name, loser: r.fighters[1 - r.winner].name, round: r.round || null }));
    return out;
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
    const bar = (n, label, cls) => '<div class="fa-bar"><span>' + label + '</span><i class="' + cls + '" style="width:' + (n / e.total * 100).toFixed(1) + '%"></i><b>' + n + '</b></div>';
    const inside = e.ko + e.sub;
    return '<section class="sov-blk">' + head('How fights ended', 'All ' + e.total + ' ' + (sport === 'mma' ? 'MMA' : 'boxing') + ' results BEFN holds from the last two weeks') +
      '<div class="fa-bars">' + bar(e.ko, 'KO / TKO', 'is-ko') + (sport === 'mma' ? bar(e.sub, 'Submission', 'is-sub') : '') + bar(e.dec, 'Decision', 'is-dec') + bar(e.other, 'Draw, no contest, other', 'is-oth') +
      '<p class="sov-sub fa-note">' + Math.round(inside / e.total * 100) + '% ended inside the distance.</p></div>' +
      (e.stoppages.length ? '<div class="fa-stops"><span class="sov-ev">Latest stoppages</span>' + e.stoppages.map(s => '<div>' + H.face(s.winner, 'is-xs') + '<span><b>' + esc(s.winner) + '</b> stopped ' + esc(s.loser) + (s.round ? ' in round ' + s.round : '') + '</span></div>').join('') + '</div>' : '') + '</section>';
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
  function mmaChampsHTML(H, champs, now) {
    const list = (champs || []).filter(c => c && c.name && !/vacant/i.test(c.name));
    if (!list.length) return '';
    return '<section class="sov-blk">' + head('UFC champions', 'Current champions, from BEFN’s title tracker') + '<div class="fa-ub fa-champs">' + list.map(c => {
      const since = Date.parse(c.start || '') ? new Date(Date.parse(c.start)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '';
      return '<div>' + H.face(c.name) + '<span><b>' + esc(c.name) + '</b><small>' + esc([c.division, since ? 'since ' + since : '', Number.isInteger(c.defences) ? c.defences + (c.defences === 1 ? ' defence' : ' defences') : ''].filter(Boolean).join(' · ')) + '</small></span></div>';
    }).join('') + '</div></section>';
  }

  function boxingPage(ctx) {
    const H = helpers(), D = ctx.data || {}, now = ctx.now;
    const rows = recent(ctx.results, 'Boxing', now);
    const roster = root.BEFNBoxingHub ? root.BEFNBoxingHub.roster(D.fighters, ctx.results) : [];
    const unbeaten = root.BEFNBoxingHub ? root.BEFNBoxingHub.unbeaten(roster).slice(0, 8) : [];
    return '<div class="sov fa"><h1 class="fa-h1">Boxing analysis</h1>' + gridHTML(H, titleGrid(D.champions && D.champions.boxing)) +
      fightsHTML(H, titleFights(ctx.events, 'boxing', now), 'Title fights coming up') +
      '<div class="fa-two">' + endedHTML(H, ended(rows), 'boxing') + defencesHTML(H, defences(D.champions && D.champions.boxing, 6)) + '</div>' +
      zerosHTML(H, zerosEnded(rows)) + unbeatenHTML(H, unbeaten) +
      '<p class="sov-sub fa-foot">From BEFN’s title tracker, the schedule and the verified results feed. Results cover the last two weeks BEFN holds.</p></div>';
  }
  function mmaTop(ctx) {
    const H = helpers(), D = ctx.data || {}, now = ctx.now;
    return '<div class="sov fa fa-mma">' + mmaChampsHTML(H, D.champions && D.champions.mma, now) +
      '<div class="fa-two">' + endedHTML(H, ended(recent(ctx.results, 'MMA', now)), 'mma') + fightsHTML(H, titleFights(ctx.events, 'mma', now), 'UFC title fights coming up') + '</div></div>';
  }

  /* ---------- browser ---------- */
  const st = { events: null, results: null, loading: false };
  function render(m) {
    if (!st.results && !st.events) { m.innerHTML = '<p class="front-loading" role="status">Loading analysis…</p>'; return; }
    const ctx = { data: root.COMBAT_DATA, events: st.events, results: st.results, now: Date.now() };
    m.innerHTML = m.dataset.befnAnalysis === 'mma' ? mmaTop(ctx) : boxingPage(ctx);
  }
  function load() {
    if (st.loading || st.results) return; st.loading = true;
    const get = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
    Promise.all([get('data/upcoming-cards.json'), get('data/results.json')]).then(([u, r]) => {
      st.events = u && Array.isArray(u.events) ? u.events : []; st.results = r || { results: [] }; st.loading = false;
      document.querySelectorAll('[data-befn-analysis]').forEach(render);
    });
  }
  function scan() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-befn-analysis]').forEach(m => { if (m.dataset.faDone) return; m.dataset.faDone = '1'; render(m); load(); });
  }
  const api = { titleGrid, titleFights, recent, ended, zerosEnded, defences, boxingPage, mmaTop, methodKind };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BEFNFightAnalysis = api;
  if (typeof document !== 'undefined') {
    if (typeof MutationObserver !== 'undefined') new MutationObserver(scan).observe(document.documentElement, { subtree: true, childList: true });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  }
})(typeof window !== 'undefined' ? window : globalThis);
