/* Fight predictions (owner, 26 Nov 2026): model estimates for bouts on announced UFC cards.
 * A page in the Analysis area (#predictions, one section per card, #predictions/<event>--<bout> scrolls to a bout) and a
 * compact reference on each fight card that links to it.
 * Data: data/ufc-fight-predictions.json (scripts/build-ufc-fight-predictions.py) and data/ufc-prediction-model.json (the
 * public track record, scripts/ufc-prediction-calibrate.py). Women and men are separate rating pools, each with its own
 * record. Always labelled a model estimate, never advice; the BEFN rating itself stays descriptive (docs/design/DECISIONS.md).
 * Pure builders are exported for tests. Fills [data-befn-predictions] and the .fp-ref placeholders on fight cards. */
(function (root) {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fold = t => String(t || '').normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const surname = n => String(n || '').trim().split(/\s+/).pop();
  const fmt = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
  const DAY = 86400000;
  const METHODS = [['ko', 'KO/TKO'], ['sub', 'Submission'], ['dec', 'Decision']];
  const dayKey = ms => new Date(ms).toISOString().slice(0, 10);
  const anchor = (eventId, boutId) => 'fp-' + eventId + '--' + boutId;

  /* Whole-number percentages that add up to 100 (largest remainder). */
  function wholePercents(values) {
    const raw = values.map(v => v * 100), floor = raw.map(Math.floor);
    let left = 100 - floor.reduce((a, b) => a + b, 0);
    raw.map((v, i) => [v - floor[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { floor[i]++; left--; } });
    return floor;
  }

  /* The bout a card shows: by event and bout id, else by the two names (cards merged from another feed). */
  function lookup(data, eventId, boutId, names) {
    const want = (names || []).map(fold).sort().join('|');
    for (const e of (data && data.events) || []) for (const b of e.bouts) {
      if (b.status !== 'ok') continue;
      const ours = b.fighters.map(f => fold(f.name)).sort().join('|');
      if (e.id === eventId && (want ? want === ours : b.id === boutId)) return { event: e, bout: b };
    }
    return null;
  }

  /* Win, finish and the six (who, how) outcomes for one predicted bout, as whole percentages that add up. */
  function summary(bout) {
    const [a, b] = bout.fighters;
    const keys = ['a-ko', 'a-sub', 'a-dec', 'b-ko', 'b-sub', 'b-dec'];
    const six = wholePercents(keys.map(k => bout.outcomes[k]));
    const win = wholePercents(bout.winProbability), fin = wholePercents([bout.finishProbability, 1 - bout.finishProbability]);
    const cells = Object.fromEntries(keys.map((k, i) => [k, six[i]]));
    const top = keys.reduce((m, k) => bout.outcomes[k] > bout.outcomes[m] ? k : m, keys[0]);
    const topWho = top[0] === 'a' ? a : b, topHow = METHODS.find(m => m[0] === top.slice(2))[1];
    const fav = win[0] >= win[1] ? 0 : 1;
    return { win, finish: fin[0], distance: fin[1], cells, fav, favName: bout.fighters[fav].name, favPct: win[fav],
      top: { name: topWho.name, how: topHow, pct: cells[top] }, pool: bout.pool, low: bout.confidence === 'low', lowFor: bout.lowConfidenceFor || [] };
  }


  /* Confidence: "high" when the favourite is at 70% or more and neither fighter is flagged. The track record backs the cut:
   * favourites at 70%+ have won about three in four (reliability bands in data/ufc-prediction-model.json). */
  const HIGH = 0.70;
  const tier = bout => bout.confidence === 'low' ? 'low' : Math.max(...bout.winProbability) >= HIGH ? 'high' : 'normal';
  const initials = n => String(n || '').trim().split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
  /* Portraits are BEFN's own owner-cleared files (assets/img/ufc/<slug>-<crop>.webp). The image removes itself if it is
   * missing, which leaves the initials underneath. */
  const photo = (f, size) => '<span class="fp-ph fp-ph-' + size + '"><span class="fp-ini" aria-hidden="true">' + esc(initials(f.name)) + '</span>' +
    (f.slug ? '<img src="assets/img/ufc/' + esc(f.slug) + '-' + (size === 'l' ? 'card' : 'thumb') + '.webp" alt="Portrait of ' + esc(f.name) + '" loading="lazy" width="' + (size === 'l' ? 56 : 40) + '" height="' + (size === 'l' ? 56 : 40) + '">' : '') + '</span>';
  const TIER_LABEL = { high: 'High confidence', low: 'Low confidence' };
  const badge = t => TIER_LABEL[t] ? '<span class="fp-tier fp-tier-' + t + '">' + TIER_LABEL[t] + '</span>' : '';
  /* The tug-of-war drivers: each side's bar is its value against the larger of the two. */
  const DRIVERS = [['diffPm', 'Strike differential per min', v => (v > 0 ? '+' : '') + v.toFixed(1)], ['ctrlShare', 'Time in control', v => Math.round(v * 100) + '%'],
    ['td15', 'Takedowns per 15 min', v => v.toFixed(1)], ['sub15', 'Submission attempts per 15 min', v => v.toFixed(1)]];
  function driversHTML(bout) {
    const [da, db] = bout.details.map(d => d.drivers || {}), sn = bout.fighters.map(f => surname(f.name));
    const rows = DRIVERS.filter(([k]) => typeof da[k] === 'number' && typeof db[k] === 'number').map(([k, label, f]) => {
      const m = Math.max(Math.abs(da[k]), Math.abs(db[k]), 1e-6), w = v => Math.round(Math.max(0, v) / m * 100);
      return '<div class="fp-drv-row"><div class="fp-drv-top"><b>' + f(da[k]) + '</b><span>' + label + '</span><b>' + f(db[k]) + '</b></div>' +
        '<div class="fp-drv-bar"><span class="fp-drv-l"><i style="width:' + w(da[k]) + '%"></i></span><span class="fp-drv-r"><i style="width:' + w(db[k]) + '%"></i></span></div></div>'; }).join('');
    return rows ? '<details class="fp-drv"><summary>What decides it</summary><div class="fp-drv-names"><span>' + esc(sn[0]) + '</span><span>' + esc(sn[1]) + '</span></div>' + rows +
      '<p class="fp-note">These show each fighter’s edge on that stat. The winner estimate comes from the overall rating, which already uses them.</p></details>' : '';
  }

  /* Compact reference on a fight card. */
  function refHTML(hit) {
    const s = summary(hit.bout), t = tier(hit.bout), sn = hit.bout.fighters.map(f => surname(f.name));
    return '<a class="fp-ref fp-ref-' + t + '" href="#predictions/' + esc(hit.event.id + '--' + hit.bout.id) + '">' +
      '<span class="fp-ref-top"><span class="fp-ref-k">BEFN pick</span>' + badge(t) + '</span>' +
      '<span class="fp-ref-pcts"><b class="' + (s.fav === 0 ? 'is-fav' : '') + '">' + s.win[0] + '%</b><b class="' + (s.fav === 1 ? 'is-fav' : '') + '">' + s.win[1] + '%</b></span>' +
      '<span class="fp-bar" role="img" aria-label="' + esc(sn[0] + ' ' + s.win[0] + ' percent, ' + sn[1] + ' ' + s.win[1] + ' percent') + '"><i style="width:' + s.win[0] + '%"></i><i style="width:' + s.win[1] + '%"></i></span>' +
      '<span class="fp-ref-foot"><span class="fp-chip">' + s.finish + '% ends early</span><span class="fp-ref-go">Full breakdown</span></span></a>';
  }

  const poolWord = p => p === 'women' ? 'women’s' : 'men’s';
  function boutHTML(event, bout, main) {
    const s = summary(bout), [a, b] = bout.fighters, [da, db] = bout.details, t = tier(bout);
    const sn = [surname(a.name), surname(b.name)], size = main ? 'l' : 's';
    const rank = d => d.rank ? '#' + d.rank + ' of ' + d.rankOf + ' ' + poolWord(bout.pool) : 'Unranked';
    const ends = Object.entries(s.cells).sort((x, y) => y[1] - x[1]).map(([k, v]) => { const who = k[0] === 'a' ? a : b, how = METHODS.find(m => m[0] === k.slice(2))[1];
      return '<div class="fp-end"><span>' + esc(surname(who.name)) + ' ' + esc(how === 'Decision' ? 'decision' : how) + '</span><i style="width:' + Math.max(v * 2.4, 2) + '%" class="' + (k[0] === 'a' ? 'is-a' : 'is-b') + '"></i><b>' + v + '%</b></div>'; }).join('');
    const detail = [['BEFN rating', d => d.rating.toFixed(1)], ['Rank', rank], ['Age', d => d.age == null ? 'Not known' : Math.floor(d.age)], ['UFC fights', d => d.ufcFights]]
      .map(([k, f]) => '<tr><td>' + esc(f(da)) + '</td><th scope="row">' + k + '</th><td>' + esc(f(db)) + '</td></tr>').join('');
    return '<details class="fp-bout fp-t-' + t + (main ? ' is-main' : '') + '" id="' + esc(anchor(event.id, bout.id)) + '" aria-label="' + esc(a.name + ' versus ' + b.name) + '">' +
      '<summary class="fp-row"><span class="fp-row-h"><span>' + esc((main ? 'Main event · ' : '') + (bout.division || '') + (bout.title ? ' · Title fight' : '')) + '</span>' + badge(t) + '</span>' +
      '<span class="fp-row-names">' + photo(a, size) + '<span class="fp-row-vs"><b>' + esc(sn[0]) + '</b> <i>vs</i> <b>' + esc(sn[1]) + '</b></span>' + photo(b, size) + '</span>' +
      '<span class="fp-pcts"><b class="' + (s.fav === 0 ? 'is-fav' : '') + '">' + s.win[0] + '%</b><b class="' + (s.fav === 1 ? 'is-fav' : '') + '">' + s.win[1] + '%</b></span>' +
      '<span class="fp-bar" role="img" aria-label="' + esc(sn[0] + ' ' + s.win[0] + ' percent, ' + sn[1] + ' ' + s.win[1] + ' percent') + '"><i style="width:' + s.win[0] + '%"></i><i style="width:' + s.win[1] + '%"></i></span></summary>' +
      '<div class="fp-body"><div class="fp-tiles"><div><span>Ends early</span><b>' + s.finish + '%</b></div><div><span>Most likely</span><b>' + esc(surname(s.top.name)) + ' ' + esc(s.top.how === 'Decision' ? 'dec.' : s.top.how) + '</b></div></div>' +
      '<div class="fp-sec-k">How it could end</div><div class="fp-ends">' + ends + '</div>' +
      driversHTML(bout) +
      '<table class="fp-tbl fp-det"><thead><tr><th scope="col">' + esc(sn[0]) + '</th><th></th><th scope="col">' + esc(sn[1]) + '</th></tr></thead><tbody>' + detail + '</tbody></table>' +
      '<p class="fp-note">' + (bout.pool === 'women' ? 'Women’s' : 'Men’s') + ' rankings.' + (s.low ? ' Less than three UFC fights or no birth date on file for ' + esc(s.lowFor.join(' and ')) + ', so treat this one with extra care.' : '') + '</p></div></details>';
  }

  const pct = v => (v * 100).toFixed(1).replace(/\.0$/, '') + '%';
  const gainText = (g, iv, unit) => (g >= 0 ? '+' : '−') + Math.abs(g).toFixed(4) + ' ' + unit + ' (95% range ' + (iv[0] >= 0 ? '+' : '−') + Math.abs(iv[0]).toFixed(4) + ' to ' + (iv[1] >= 0 ? '+' : '−') + Math.abs(iv[1]).toFixed(4) + ')';
  /* The public track record: every number is walk-forward, each fight predicted before it was fought. */
  function recordHTML(m) {
    if (!m || !m.winner) return '';
    const pools = ['men', 'women'].filter(p => m.winner[p]);
    const win = pools.map(p => { const w = m.winner[p];
      const bands = w.reliability.map(r => '<tr><td>' + Math.round(r.from * 100) + '–' + Math.round(r.to * 100) + '%</td><td>' + r.n + '</td><td>' + pct(r.predicted) + '</td><td>' + pct(r.actual) + '</td></tr>').join('');
      return '<div class="fp-rec-card"><h3>' + (p === 'women' ? 'Women’s' : 'Men’s') + ' winners</h3><p><b>' + pct(w.accuracy) + '</b> of ' + w.bouts.toLocaleString('en-GB') + ' winners picked · Brier score ' + w.brier.toFixed(4) + ' (a coin flip scores 0.25; lower is better)' + (w.bouts < 300 ? ' · small sample, read it loosely' : '') + '</p>' +
        '<table class="fp-tbl fp-rel"><thead><tr><th scope="col">Favourite’s chance</th><th scope="col">Fights</th><th scope="col">Predicted</th><th scope="col">Won</th></tr></thead><tbody>' + bands + '</tbody></table></div>'; }).join('');
    const f = m.finish, me = m.method;
    const finRows = ['men', 'women'].filter(p => f.byPool && f.byPool[p]).map(p => { const x = f.byPool[p], clear = x.gainInterval[0] > 0;
      return '<li><b>' + (p === 'women' ? 'Women' : 'Men') + ':</b> ' + gainText(x.brierGain, x.gainInterval, 'Brier') + (clear ? ', better than the division finish rate.' : ', not clearly better than the division finish rate.') + '</li>'; }).join('');
    const methRows = ['men', 'women'].filter(p => me.byPool && me.byPool[p]).map(p => { const x = me.byPool[p];
      return '<li><b>' + (p === 'women' ? 'Women' : 'Men') + ':</b> ' + gainText(x.logLossGain, x.gainInterval, 'log loss') + (x.gainInterval[0] > 0 ? ', better than the division method rates.' : ', not clearly better than the division method rates.') + '</li>'; }).join('');
    return '<section class="fp-rec" id="fp-record"><h2>Track record</h2><p class="fp-lede">Every fight below was predicted using only what was known before it, from 2024 onward, then compared with what happened. Women and men have separate ratings, so each has its own record.</p>' +
      '<div class="fp-rec-grid">' + win + '</div>' +
      '<div class="fp-rec-card"><h3>Finish or distance</h3><p>Compared with the finish rate of the division, over ' + f.bouts.toLocaleString('en-GB') + ' fights (higher gain is better):</p><ul>' + finRows + '</ul></div>' +
      '<div class="fp-rec-card"><h3>How the winner wins</h3><p>Compared with the division’s method rates, over ' + me.bouts.toLocaleString('en-GB') + ' fights:</p><ul>' + methRows + '</ul></div>' +
      '<p class="fp-foot">Ratings, fight statistics and the models are rebuilt as results come in. These are estimates from past UFC results and statistics, not betting advice, and a fighter with little UFC history is flagged because the model knows less about them.</p></section>';
  }

  /* The live record: predictions logged before each fight (scripts/update-ufc-prediction-log.py), scored afterwards. */
  const HOW = { ko: 'KO/TKO', sub: 'submission', dec: 'decision' };
  function liveSummary(log) {
    const entries = (log && log.entries) || [];
    const out = { since: log && log.since, pending: entries.filter(e => !e.result).length, pools: {}, scored: [] };
    for (const e of entries) {
      if (!e.result || e.result.winner === null || e.result.winner === undefined) continue;
      const pick = e.winProbability[0] >= e.winProbability[1] ? 0 : 1, right = pick === e.result.winner;
      const finish = e.result.method === 'ko' || e.result.method === 'sub';
      const p = out.pools[e.pool] || (out.pools[e.pool] = { fights: 0, right: 0, finishCalls: 0, finishRight: 0 });
      p.fights++; if (right) p.right++;
      if (e.result.method !== 'other') { p.finishCalls++; if ((e.finishProbability >= .5) === finish) p.finishRight++; }
      out.scored.push({ e, pick, right, pct: Math.round(Math.max(...e.winProbability) * 100) });
    }
    out.scored.sort((a, b) => (b.e.result.date || b.e.date).localeCompare(a.e.result.date || a.e.date));
    return out;
  }
  function liveHTML(log) {
    const L = liveSummary(log);
    if (!L.since) return '';
    const pools = ['men', 'women'].map(p => { const x = L.pools[p] || { fights: 0, right: 0, finishCalls: 0, finishRight: 0 };
      return '<div class="fp-rec-card"><h3>' + (p === 'women' ? 'Women’s' : 'Men’s') + ' fights so far</h3>' + (x.fights ?
        '<p><b>' + x.right + ' of ' + x.fights + '</b> winners picked · finish or distance called right in ' + x.finishRight + ' of ' + x.finishCalls + (x.fights < 30 ? ' · too few fights to judge yet' : '') + '</p>' :
        '<p>No fights scored yet.</p>') + '</div>'; }).join('');
    const rows = L.scored.slice(0, 20).map(r => { const [a, b] = r.e.fighters, w = r.e.fighters[r.e.result.winner];
      return '<tr><td>' + esc(fmt(r.e.result.date || r.e.date)) + '</td><td>' + esc(a + ' vs ' + b) + '</td><td>' + esc(surname(r.e.fighters[r.pick])) + ' ' + r.pct + '%</td><td>' + esc(surname(w)) + (HOW[r.e.result.method] ? ' by ' + HOW[r.e.result.method] : '') + '</td><td>' + (r.right ? 'Right' : 'Wrong') + '</td></tr>'; }).join('');
    return '<section class="fp-rec" id="fp-live"><h2>Live record</h2><p class="fp-lede">Each estimate is saved before the fight and never changed, then scored when the result is in. Started ' + esc(fmt(L.since)) + '. ' + L.pending + ' saved and waiting for their fight.</p>' +
      '<div class="fp-rec-grid">' + pools + '</div>' +
      (rows ? '<div class="fp-rec-card"><h3>Latest results</h3><div class="fa-scroll"><table class="fp-tbl fp-hist"><thead><tr><th scope="col">Date</th><th scope="col">Fight</th><th scope="col">We picked</th><th scope="col">Result</th><th scope="col"></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' : '') + '</section>';
  }

  /* The evidence strip: overall hit rate, the hit rate at 70%+, and the live record. */
  function stripHTML(model, log) {
    const w = (model && model.winner) || {}, pools = Object.values(w).filter(x => x && x.bouts);
    const n = pools.reduce((a, x) => a + x.bouts, 0), acc = n ? pools.reduce((a, x) => a + x.accuracy * x.bouts, 0) / n : null;
    const hi = pools.flatMap(x => (x.reliability || []).filter(r => r.from >= HIGH)), hn = hi.reduce((a, r) => a + r.n, 0), hacc = hn ? hi.reduce((a, r) => a + r.actual * r.n, 0) / hn : null;
    const L = liveSummary(log), fights = Object.values(L.pools).reduce((a, x) => a + x.fights, 0), right = Object.values(L.pools).reduce((a, x) => a + x.right, 0);
    const tile = (big, small) => '<div class="fp-stat"><b>' + big + '</b><span>' + small + '</span></div>';
    return '<div class="fp-strip">' + (acc == null ? '' : tile(Math.round(acc * 100) + '%', 'winners right since 2024')) +
      (hacc == null ? '' : tile(Math.round(hacc * 100) + '%', 'right when 70%+ (' + hn + ' fights)')) +
      (L.since ? tile(fights ? right + '–' + (fights - right) : L.pending, fights ? 'live record' : 'live picks saved') : '') + '</div>';
  }
  function pageHTML(data, model, now, log) {
    const floor = dayKey(now - 2 * DAY);
    const events = ((data && data.events) || []).filter(e => e.date >= floor).sort((a, b) => a.date.localeCompare(b.date));
    const body = events.map(e => {
      const ok = e.bouts.filter(b => b.status === 'ok'), skipped = e.bouts.filter(b => b.status !== 'ok');
      return '<section class="fp-event"><h2>' + esc(e.title) + '</h2><p class="fp-when">' + esc(fmt(e.date)) + '</p><div class="fp-list">' + ok.map((b, i) => boutHTML(e, b, i === 0)).join('') + '</div>' +
        (skipped.length ? '<p class="fp-skip">No estimate for ' + skipped.map(b => esc(b.fighters.map(f => f.name || 'a fighter').join(' vs '))).join('; ') + ': a fighter is new to the UFC or has no UFC record here yet.</p>' : '') + '</section>';
    }).join('');
    const records = liveHTML(log) + recordHTML(model);
    return '<div class="fp"><a class="fp-back" href="#analysis">Analysis</a><h1 class="fa-h1">Fight predictions</h1>' +
      '<p class="fp-lede">Model picks for every announced UFC card. <span class="fp-key">' + badge('high') + ' favourite at 70% or more</span> Not betting advice.</p>' + stripHTML(model, log) +
      (body || '<p class="fp-skip">No announced UFC cards to estimate right now.</p>') +
      (records ? '<details class="fp-more" id="fp-how"><summary>See how it did</summary>' + records + '</details>' : '') + '</div>';
  }

  /* ---------- browser ---------- */
  const st = {};
  let pending = null;
  function load() {
    if (!pending) pending = Promise.all([
      fetch('data/ufc-fight-predictions.json').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('data/ufc-prediction-model.json').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('data/ufc-prediction-log.json').then(r => r.ok ? r.json() : null).catch(() => null)]).then(([d, m, l]) => { st.data = d; st.model = m; st.log = l; st.done = true; });
    return pending;
  }
  function fill() {
    if (typeof document === 'undefined' || !st.done) return;
    document.querySelectorAll('.fp-ref[data-fp-ev]:not([data-fp-done])').forEach(el => {
      el.dataset.fpDone = '1';
      const hit = lookup(st.data, el.dataset.fpEv, el.dataset.fpBout, (el.dataset.fpNames || '').split('|').filter(Boolean));
      if (hit) { el.outerHTML = refHTML(hit); }
    });
    document.querySelectorAll('[data-befn-predictions]').forEach(m => {
      if (m.dataset.fpDone) return;
      m.dataset.fpDone = '1';
      m.innerHTML = pageHTML(st.data, st.model, Date.now(), st.log);
      const sub = String(root.location.hash || '').split('/')[1];
      const t = sub && root.document.getElementById('fp-' + decodeURIComponent(sub));
      if (t) { if (t.tagName === 'DETAILS') t.open = true; t.scrollIntoView({ block: 'start' }); }
    });
  }
  function scan() {
    if (typeof document === 'undefined') return;
    if (!document.querySelector('.fp-ref[data-fp-ev]:not([data-fp-done]), [data-befn-predictions]:not([data-fp-done])')) return;
    load().then(fill);
  }
  if (typeof document !== 'undefined') document.addEventListener('error', e => { const t = e.target; if (t && t.matches && t.matches('.fp-ph img')) t.remove(); }, true);
  const api = { tier, stripHTML, driversHTML, fold, wholePercents, lookup, summary, refHTML, boutHTML, recordHTML, liveSummary, liveHTML, pageHTML, anchor };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BEFNPredictions = api;
  if (typeof document !== 'undefined') {
    if (typeof MutationObserver !== 'undefined') new MutationObserver(scan).observe(document.documentElement, { subtree: true, childList: true });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  }
})(typeof window !== 'undefined' ? window : globalThis);
