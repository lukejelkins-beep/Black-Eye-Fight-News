/* Fighter snapshot tiles for announced UFC bouts (Phase 3, step 2).
 * Renders the last-five-fight numbers from data/ufc-card-snapshots.json as two-sided bars with big numbers.
 * Raw stats only: no scores, percentiles or ratings. A missing number shows as a dash, never zero.
 * Rate bars are scaled against the larger of the two fighters in the bout; percentage bars use 0 to 100.
 * Pure functions so tests can run them in Node. */
(function (root) {
  'use strict';

  const fold = text => String(text == null ? '' : text).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ROWS = [
    { key: 'slpm', label: 'Strikes landed / min', pct: false },
    { key: 'strAcc', label: 'Strike accuracy', pct: true },
    { key: 'sapm', label: 'Strikes absorbed / min', pct: false },
    { key: 'strDef', label: 'Strike defence', pct: true },
    { key: 'kd15', label: 'Knockdowns / 15 min', pct: false },
    { key: 'td15', label: 'Takedowns / 15 min', pct: false },
    { key: 'tdDef', label: 'Takedown defence', pct: true },
    { key: 'ctrlShare', label: 'Control time', pct: true },
    { key: 'sub15', label: 'Sub attempts / 15 min', pct: false }
  ];
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const show = (v, pct) => !isNum(v) ? '—' : pct ? Math.round(v * 100) + '%' : v.toFixed(1);
  const recordText = r => !r ? '—' : r.W + '-' + r.L + (r.D ? '-' + r.D : '') + (r.NC ? ' (' + r.NC + ' NC)' : '');

  function status(entry) {
    if (!entry || entry.coverage === 'none') return 'Not available yet';
    if (entry.coverage === 'limited') return 'Limited data · ' + entry.statFights + (entry.statFights === 1 ? ' fight' : ' fights');
    return 'Based on ' + (entry.statFights >= entry.fights ? entry.statFights + ' fights' : entry.statFights + ' of ' + entry.fights + ' fights');
  }

  // Bar widths 0 to 100 for each side. Null stays null so no bar is drawn.
  function widths(a, b, pct) {
    if (pct) return [isNum(a) ? Math.max(0, Math.min(100, a * 100)) : null, isNum(b) ? Math.max(0, Math.min(100, b * 100)) : null];
    const top = Math.max(isNum(a) ? a : 0, isNum(b) ? b : 0);
    const w = v => !isNum(v) ? null : top > 0 ? Math.max(0, Math.min(100, v / top * 100)) : 0;
    return [w(a), w(b)];
  }

  // Look a bout up in the snapshot file. Returns [entryA, entryB] or null when the event or bout is not in it.
  function lookup(data, eventId, names) {
    if (!data || !data.fighters || !Array.isArray(names) || names.length !== 2) return null;
    const keys = names.map(fold);
    const event = (data.events || []).find(e => e.id === eventId);
    if (!event || !event.bouts.some(b => b.fighters[0] === keys[0] && b.fighters[1] === keys[1] || b.fighters[0] === keys[1] && b.fighters[1] === keys[0])) return null;
    return keys.map(k => data.fighters[k] || null);
  }

  function html(a, b, h) {
    const esc = h && h.esc ? h.esc : String;
    const usable = x => x && x.coverage !== 'none';
    if (!usable(a) && !usable(b)) return '';
    const bar = (w, side) => '<span class="st-track st-' + side + '" aria-hidden="true">' + (w == null ? '' : '<span class="st-fill" style="width:' + w.toFixed(1) + '%"></span>') + '</span>';
    const rows = ROWS.map(r => {
      const va = usable(a) ? a.tiles[r.key] : null, vb = usable(b) ? b.tiles[r.key] : null;
      if (va == null && vb == null) return '';
      const [wa, wb] = widths(va, vb, r.pct);
      return '<div class="st-row" role="group" aria-label="' + esc(r.label) + '">' +
        '<span class="st-num">' + esc(show(va, r.pct)) + '</span>' + bar(wa, 'a') +
        '<span class="st-label">' + esc(r.label) + '</span>' + bar(wb, 'b') +
        '<span class="st-num">' + esc(show(vb, r.pct)) + '</span></div>';
    }).join('');
    if (!rows) return '';
    const side = x => '<div><strong>' + esc(x ? x.name : '') + '</strong><span>' + esc(status(x)) + '</span><em>' + esc(usable(x) ? recordText(x.record) : '—') + '</em></div>';
    return '<section class="st-tiles" aria-label="Last five fights">' +
      '<h3 class="st-title">Last 5 fights</h3><div class="st-head">' + side(a) + side(b) + '</div>' +
      '<div class="st-rows">' + rows + '</div>' +
      '<p class="st-note">Raw numbers from each fighter\'s last five UFC fights. — means not measured.</p></section>';
  }

  const api = { fold, ROWS, show, recordText, status, widths, lookup, html };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BEFNSnapshotTiles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
