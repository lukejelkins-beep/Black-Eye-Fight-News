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

  /* Compact reference on a fight card. */
  function refHTML(hit) {
    const s = summary(hit.bout);
    return '<a class="fp-ref" href="#predictions/' + esc(hit.event.id + '--' + hit.bout.id) + '"><span class="fp-ref-k">Model estimate</span>' +
      '<span class="fp-ref-v"><b>' + esc(surname(s.favName)) + ' ' + s.favPct + '%</b> · ' + s.finish + '% finish' + (s.low ? ' · low confidence' : '') + '</span>' +
      '<span class="fp-ref-go">Full analysis</span></a>';
  }

  const poolWord = p => p === 'women' ? 'women’s' : 'men’s';
  function boutHTML(event, bout) {
    const s = summary(bout), [a, b] = bout.fighters, [da, db] = bout.details;
    const sn = [surname(a.name), surname(b.name)];
    const rank = d => d.rank ? '#' + d.rank + ' of ' + d.rankOf + ' ' + poolWord(bout.pool) : 'Unranked';
    const rows = METHODS.map(([k, label]) => '<tr><th scope="row">' + label + '</th><td>' + s.cells['a-' + k] + '%</td><td>' + s.cells['b-' + k] + '%</td></tr>').join('');
    const detail = [['BEFN rating', d => d.rating.toFixed(1)], ['Rank', rank], ['Age', d => d.age == null ? 'Not known' : Math.floor(d.age)], ['UFC fights', d => d.ufcFights]]
      .map(([k, f]) => '<tr><td>' + esc(f(da)) + '</td><th scope="row">' + k + '</th><td>' + esc(f(db)) + '</td></tr>').join('');
    return '<article class="fp-bout" id="' + esc(anchor(event.id, bout.id)) + '" aria-label="' + esc(a.name + ' versus ' + b.name) + '">' +
      '<header class="fp-bout-h"><span>' + esc((bout.division || '') + (bout.title ? ' · Title fight' : '') + ' · ' + (bout.pool === 'women' ? 'Women’s' : 'Men’s') + ' rankings') + '</span>' +
      (s.low ? '<span class="fp-low">Low confidence</span>' : '') + '</header>' +
      '<div class="fp-names"><b>' + esc(a.name) + '</b><span>vs</span><b>' + esc(b.name) + '</b></div>' +
      '<div class="fp-sec"><div class="fp-sec-k">Who wins</div><div class="fp-pcts"><b class="' + (s.fav === 0 ? 'is-fav' : '') + '">' + s.win[0] + '%</b><b class="' + (s.fav === 1 ? 'is-fav' : '') + '">' + s.win[1] + '%</b></div>' +
      '<div class="fp-bar" role="img" aria-label="' + esc(sn[0] + ' ' + s.win[0] + ' percent, ' + sn[1] + ' ' + s.win[1] + ' percent') + '"><i style="width:' + s.win[0] + '%"></i><i style="width:' + s.win[1] + '%"></i></div></div>' +
      '<div class="fp-sec"><div class="fp-sec-k">How it ends</div><div class="fp-fin"><span><b>' + s.finish + '%</b> KO or submission</span><span><b>' + s.distance + '%</b> goes the distance</span></div>' +
      '<table class="fp-tbl"><thead><tr><th></th><th scope="col">' + esc(sn[0]) + ' wins</th><th scope="col">' + esc(sn[1]) + ' wins</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p class="fp-top">Likeliest single result: ' + esc(s.top.name) + ' by ' + esc(s.top.how.toLowerCase()) + ', ' + s.top.pct + '%.</p></div>' +
      '<div class="fp-sec"><div class="fp-sec-k">Key details</div><table class="fp-tbl fp-det"><thead><tr><th scope="col">' + esc(sn[0]) + '</th><th></th><th scope="col">' + esc(sn[1]) + '</th></tr></thead><tbody>' + detail + '</tbody></table>' +
      (s.low ? '<p class="fp-note">Less than three UFC fights or no birth date on file for ' + esc(s.lowFor.join(' and ')) + ', so treat this one with extra care.</p>' : '') + '</div></article>';
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

  function pageHTML(data, model, now) {
    const floor = dayKey(now - 2 * DAY);
    const events = ((data && data.events) || []).filter(e => e.date >= floor).sort((a, b) => a.date.localeCompare(b.date));
    const body = events.map(e => {
      const ok = e.bouts.filter(b => b.status === 'ok'), skipped = e.bouts.filter(b => b.status !== 'ok');
      return '<section class="fp-event"><h2>' + esc(e.title) + '</h2><p class="fp-when">' + esc(fmt(e.date)) + '</p>' + ok.map(b => boutHTML(e, b)).join('') +
        (skipped.length ? '<p class="fp-skip">No estimate for ' + skipped.map(b => esc(b.fighters.map(f => f.name || 'a fighter').join(' vs '))).join('; ') + ': a fighter is new to the UFC or has no UFC record here yet.</p>' : '') + '</section>';
    }).join('');
    return '<div class="fp"><a class="fp-back" href="#analysis">Analysis</a><h1 class="fa-h1">Fight predictions</h1>' +
      '<p class="fp-lede">A model estimate for each fight on the announced UFC cards: who wins, whether it ends in a finish, and how. Built from BEFN’s ratings and past UFC results and statistics. Not betting advice. <a href="#fp-record">See the track record</a>.</p>' +
      (body || '<p class="fp-skip">No announced UFC cards to estimate right now.</p>') + recordHTML(model) + '</div>';
  }

  /* ---------- browser ---------- */
  const st = {};
  let pending = null;
  function load() {
    if (!pending) pending = Promise.all([
      fetch('data/ufc-fight-predictions.json').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('data/ufc-prediction-model.json').then(r => r.ok ? r.json() : null).catch(() => null)]).then(([d, m]) => { st.data = d; st.model = m; st.done = true; });
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
      m.innerHTML = pageHTML(st.data, st.model, Date.now());
      const sub = String(root.location.hash || '').split('/')[1];
      const t = sub && root.document.getElementById('fp-' + decodeURIComponent(sub));
      if (t) t.scrollIntoView({ block: 'start' });
    });
  }
  function scan() {
    if (typeof document === 'undefined') return;
    if (!document.querySelector('.fp-ref[data-fp-ev]:not([data-fp-done]), [data-befn-predictions]:not([data-fp-done])')) return;
    load().then(fill);
  }
  const api = { fold, wholePercents, lookup, summary, refHTML, boutHTML, recordHTML, pageHTML, anchor };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BEFNPredictions = api;
  if (typeof document !== 'undefined') {
    if (typeof MutationObserver !== 'undefined') new MutationObserver(scan).observe(document.documentElement, { subtree: true, childList: true });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  }
})(typeof window !== 'undefined' ? window : globalThis);
