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

  /* ---- Attribute scores (Phase 3 step 3). OFF unless the page opts in; the owner's release approval is separate. ----
   * Scores are 1-99 percentiles of the last five fights, ranked against the fighter's division when both fighters
   * share one; otherwise against the division the bout is contracted at, when that is known; otherwise against all
   * UFC fighters. Numbers come from data/ufc-card-scores.json; nothing is calculated here. */
  // Same striking, wrestling and grappling as the fighter profiles, each including its own defence (owner, 2026-11-24),
  // so there is no separate Defence row. Power and Durability are the card's rare-event views.
  const SCORE_MAIN = [['striking', 'Striking'], ['wrestling', 'Wrestling'], ['grappling', 'Grappling'], ['power', 'Power']];
  const SCORE_MORE = [['durability', 'Durability']];

  // Scores are ON for readers (owner approved the release, 2026-11-21). Kill switch: BEFN_FEATURES.snapshotScores = false,
  // or ?snapshotScores=off on the address, hides them and stops the scores file being requested.
  function scoresEnabled(g) {
    if (!g) return false;
    if (g.BEFN_FEATURES && g.BEFN_FEATURES.snapshotScores === false) return false;
    try { if (/[?&]snapshotScores=off(&|$)/.test((g.location && g.location.search) || '')) return false; } catch (e) { return true; }
    return true;
  }

  // Scores for a bout on a card, in the order of `names`. null when the event or bout is not in the file.
  function lookupScores(data, eventId, names) {
    if (!data || !Array.isArray(data.events) || !Array.isArray(names) || names.length !== 2) return null;
    const keys = names.map(fold);
    const event = data.events.find(e => e.id === eventId);
    const bout = event && event.bouts.find(b => b.fighters[0] === keys[0] && b.fighters[1] === keys[1] || b.fighters[0] === keys[1] && b.fighters[1] === keys[0]);
    if (!bout) return null;
    const flip = bout.fighters[0] !== keys[0];
    const sides = flip ? [bout.scores[1], bout.scores[0]] : bout.scores;
    const info = keys.map(k => (data.fighters || {})[k] || null);
    return { division: bout.division || null, basis: bout.basis || {}, sides, info, minimums: data.minimums || null };
  }

  function scoresHTML(entry, names, h) {
    const esc = h && h.esc ? h.esc : String;
    if (!entry) return '';
    const val = (side, key) => side && side[key] && Number.isInteger(side[key].score) ? side[key] : null;
    const has = SCORE_MAIN.concat(SCORE_MORE).some(([k]) => val(entry.sides[0], k) || val(entry.sides[1], k));
    if (!has) return '';
    const bar = (v, side) => '<span class="st-track st-' + side + '" aria-hidden="true">' + (v ? '<span class="st-fill st-band-' + esc(v.band) + '" style="width:' + v.score + '%"></span>' : '') + '</span>';
    const row = ([key, label]) => {
      const a = val(entry.sides[0], key), b = val(entry.sides[1], key);
      if (!a && !b) return '';
      return '<div class="st-row" role="group" aria-label="' + esc(label) + '">' +
        '<span class="st-num">' + (a ? a.score : '—') + '</span>' + bar(a, 'a') + '<span class="st-label">' + esc(label) + '</span>' + bar(b, 'b') +
        '<span class="st-num">' + (b ? b.score : '—') + '</span></div>';
    };
    const main = SCORE_MAIN.map(row).join(''), more = SCORE_MORE.map(row).join('');
    const bases = Object.values(entry.basis || {});
    const ownDivision = entry.division && bases.length && bases.every(x => x === 'division');
    const contracted = entry.division && bases.length && bases.every(x => x === 'contracted');
    const rank = ownDivision ? 'Ranked against ' + entry.division + ' fighters.'
      : contracted ? 'Ranked against ' + entry.division + ' fighters, the division this bout is contracted at.'
      : 'Ranked against all UFC fighters.';
    // The division the note above has already named, if it named one.
    const named = (ownDivision || contracted) ? entry.division : null;
    const moved = entry.info.map((f, i) => {
      if (!f) return '';
      // Ranked in one division, last fought in another: say where, rather than call them new to their own division.
      // Nothing to add when that is the division the note has just named (a bout contracted at it, say).
      if (f.latestBoutDivision && f.division && f.latestBoutDivision !== f.division) {
        return f.latestBoutDivision === named ? '' : names[i] + '’s last bout was at ' + f.latestBoutDivision + '.';
      }
      return f.newToDivision && f.previousDivision
        ? names[i] + ' is new to ' + f.division + ' (was ' + f.previousDivision + ').' : '';
    }).filter(Boolean);
    return '<section class="st-scores" aria-label="Attribute scores">' +
      '<h3 class="st-title">Attribute scores</h3>' +
      '<div class="st-rows">' + main + '</div>' +
      (more ? '<details class="st-more"><summary>More scores</summary><div class="st-rows">' + more + '</div></details>' : '') +
      '<p class="st-note">' + esc(rank) + (moved.length ? ' ' + esc(moved.join(' ')) : '') +
      ' Scores run 1 to 99 and describe each fighter\'s last five UFC fights. They are not predictions.</p></section>';
  }

  /* ---- BEFN ratings on the card (owner, 28 Nov 2026: "Yes use BEFN ratings, keep Power under more scores") ----
   * The Scores tab shows the same ratings as each fighter's profile (Results, Striking, Wrestling, Grappling, Form,
   * 2 decimals), so a fighter has one set of numbers everywhere. Power, the card's last-five knockout score, stays under
   * "More scores" with its own label. Durability is no longer shown. Numbers are passed in; nothing is calculated here.
   * entry: {sides: [{results, striking, ...} | null, ...], power: lookupScores(...) | null} */
  const RATING_ROWS = [['results', 'Results'], ['striking', 'Striking'], ['wrestling', 'Wrestling'], ['grappling', 'Grappling'], ['form', 'Form']];
  const bandOf = v => v < 35 ? 'red' : v < 55 ? 'orange' : v < 75 ? 'gold' : 'green';
  function ratingsHTML(entry, names, h) {
    const esc = h && h.esc ? h.esc : String;
    if (!entry || !Array.isArray(entry.sides)) return '';
    const num = v => Number.isFinite(v) ? v : null;
    const bar = (v, side, band) => '<span class="st-track st-' + side + '" aria-hidden="true">' + (v !== null ? '<span class="st-fill st-band-' + esc(band || bandOf(v)) + '" style="width:' + Math.max(2, Math.min(100, v)) + '%"></span>' : '') + '</span>';
    const line = (label, a, b, fmt, bands) => (a === null && b === null) ? '' :
      '<div class="st-row" role="group" aria-label="' + esc(label) + '">' +
      '<span class="st-num">' + (a === null ? '—' : esc(fmt(a))) + '</span>' + bar(a, 'a', bands && bands[0]) + '<span class="st-label">' + esc(label) + '</span>' +
      bar(b, 'b', bands && bands[1]) + '<span class="st-num">' + (b === null ? '—' : esc(fmt(b))) + '</span></div>';
    const main = RATING_ROWS.map(([k, label]) => line(label, num(entry.sides[0] && entry.sides[0][k]), num(entry.sides[1] && entry.sides[1][k]), v => v.toFixed(2))).join('');
    if (!main) return '';
    const p = entry.power, pv = i => p && p.sides[i] && p.sides[i].power && Number.isInteger(p.sides[i].power.score) ? p.sides[i].power : null;
    const power = p ? line('Power', pv(0) ? pv(0).score : null, pv(1) ? pv(1).score : null, String, [pv(0) && pv(0).band, pv(1) && pv(1).band]) : '';
    let pool = '';
    if (power) {
      const bases = Object.values(p.basis || {});
      pool = p.division && bases.length && bases.every(x => x === 'division' || x === 'contracted') ? p.division + ' fighters' : 'all UFC fighters';
    }
    return '<section class="st-scores" aria-label="BEFN ratings">' +
      '<h3 class="st-title">BEFN ratings</h3>' +
      '<div class="st-rows">' + main + '</div>' +
      (power ? '<details class="st-more"><summary>More scores</summary><div class="st-rows">' + power + '</div>' +
        '<p class="st-note">Power: knockdowns and KO/TKO wins in the last five UFC fights, 1 to 99 against ' + esc(pool) + '.</p></details>' : '') +
      '<p class="st-note">The same ratings as each fighter\'s profile. 50 is the average UFC fighter. Not predictions.</p></section>';
  }

  const api = { fold, ROWS, show, recordText, status, widths, lookup, html, scoresEnabled, lookupScores, scoresHTML, ratingsHTML, RATING_ROWS, SCORE_MAIN, SCORE_MORE };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BEFNSnapshotTiles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
