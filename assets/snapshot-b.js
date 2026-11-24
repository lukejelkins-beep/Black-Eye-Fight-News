/* Fight snapshot, layout B (Phase 3 redesign): tale of the tape first, then the analysis, then the tabs.
 * Pure functions so tests can run them in Node. Everything here is arithmetic on numbers we already hold:
 *   - tape: height, reach, listed weight, stance and birth date from data/ufc-fighter-tape.json (UFCStats export)
 *   - tiles: last-five-fight numbers from data/ufc-card-snapshots.json
 * No predictions and no win chances. A missing number is left out or shown as a dash, never as zero.
 * The analysis lines only describe gaps in measured numbers, and only gaps above the thresholds below. */
(function (root) {
  'use strict';

  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  // Thresholds for "worth saying". Below these the gap is within noise for a five-fight sample.
  const GAP = { slpm: 1.0, sapm: 1.0, td15: 1.0, kd15: 0.5, ctrlShare: 0.15, finish: 0.3, reachIn: 3, heightIn: 3, ageYears: 5 };
  const MAX_STATS_LINES = 3, MAX_TAPE_LINES = 2;

  const inchesText = n => isNum(n) ? Math.floor(n / 12) + '′' + (n % 12) + '″' : '—';

  // Age in whole years on `today` (a Date). Null when the date is missing or not plausible.
  function ageOn(born, today) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(born || ''));
    if (!m || !(today instanceof Date)) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    let age = today.getUTCFullYear() - y;
    if (today.getUTCMonth() + 1 < mo || (today.getUTCMonth() + 1 === mo && today.getUTCDate() < d)) age -= 1;
    return age >= 16 && age <= 60 ? age : null;
  }

  // Short name for sentences: the last word, unless both fighters would end up with the same one.
  function shortNames(names) {
    const strip = n => String(n || '').replace(/\s+(jr\.?|sr\.?|ii|iii)$/i, '').trim();
    const last = names.map(n => strip(n).split(/\s+/).pop());
    return last[0].toLowerCase() === last[1].toLowerCase() ? names.map(strip) : last;
  }

  // Rows for the tale of the tape. Each row: label, two display strings, and which side leads when that means something.
  function tapeRows(a, b, today) {
    const ta = (a && a.tape) || {}, tb = (b && b.tape) || {};
    const age = [ageOn(ta.born, today), ageOn(tb.born, today)];
    const lead = (x, y) => isNum(x) && isNum(y) && x !== y ? (x > y ? 0 : 1) : null;
    const rows = [
      { key: 'age', label: 'Age', v: age.map(x => isNum(x) ? String(x) : '—'), lead: null, have: age.some(isNum) },
      { key: 'height', label: 'Height', v: [inchesText(ta.heightIn), inchesText(tb.heightIn)], n: [ta.heightIn, tb.heightIn], lead: lead(ta.heightIn, tb.heightIn), have: isNum(ta.heightIn) || isNum(tb.heightIn) },
      { key: 'reach', label: 'Reach', v: [isNum(ta.reachIn) ? ta.reachIn + '″' : '—', isNum(tb.reachIn) ? tb.reachIn + '″' : '—'], n: [ta.reachIn, tb.reachIn], lead: lead(ta.reachIn, tb.reachIn), have: isNum(ta.reachIn) || isNum(tb.reachIn) },
      { key: 'weight', label: 'Listed weight', v: [isNum(ta.weightLb) ? ta.weightLb + ' lb' : '—', isNum(tb.weightLb) ? tb.weightLb + ' lb' : '—'], lead: null, have: isNum(ta.weightLb) || isNum(tb.weightLb) },
      { key: 'stance', label: 'Stance', v: [ta.stance || '—', tb.stance || '—'], lead: null, have: !!(ta.stance || tb.stance) }
    ];
    return rows.filter(r => r.have);
  }

  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const f1 = v => v.toFixed(1);
  const pct = v => Math.round(v * 100) + '%';

  // Plain-English lines about the gaps in the numbers. Returns [{ side: 0 | 1 | null, text }]; `side` is who the line is about.
  // Stats lines need both fighters to have 3+ stat fights (coverage "full"); tape lines do not.
  function analysisLines(a, b, names, today) {
    const short = shortNames(names), lines = [];
    const full = x => x && x.coverage === 'full' && x.tiles;
    const stats = [], tape = [];
    // who has the bigger value, and by how much; null when either is missing or the gap is under the threshold
    const gap = (va, vb, min) => isNum(va) && isNum(vb) && Math.abs(va - vb) >= min ? { hi: va > vb ? 0 : 1, lo: va > vb ? 1 : 0, vals: [va, vb] } : null;
    if (full(a) && full(b)) {
      const ta = a.tiles, tb = b.tiles;
      let g = gap(ta.slpm, tb.slpm, GAP.slpm);
      if (g) stats.push({ side: g.hi, text: 'lands more: ' + f1(g.vals[g.hi]) + ' to ' + f1(g.vals[g.lo]) + ' significant strikes a minute.' });
      g = gap(ta.sapm, tb.sapm, GAP.sapm);
      if (g) stats.push({ side: g.lo, text: 'takes less: absorbs ' + f1(g.vals[g.lo]) + ' to ' + f1(g.vals[g.hi]) + ' strikes a minute.' });
      g = gap(ta.td15, tb.td15, GAP.td15);
      if (g) stats.push({ side: g.hi, text: 'shoots more: ' + f1(g.vals[g.hi]) + ' to ' + f1(g.vals[g.lo]) + ' takedowns per 15 minutes.' });
      g = gap(ta.kd15, tb.kd15, GAP.kd15);
      if (g) stats.push({ side: g.hi, text: 'has the knockdown edge: ' + f1(g.vals[g.hi]) + ' to ' + f1(g.vals[g.lo]) + ' per 15 minutes.' });
      const winsOk = x => x.record && x.record.W >= 2;
      g = winsOk(a) && winsOk(b) ? gap(ta.finishShareOfWins, tb.finishShareOfWins, GAP.finish) : null;
      if (g) stats.push({ side: g.hi, text: 'finishes more: ' + pct(g.vals[g.hi]) + ' of recent wins, against ' + pct(g.vals[g.lo]) + '.' });
      g = gap(ta.ctrlShare, tb.ctrlShare, GAP.ctrlShare);
      if (g) stats.push({ side: g.hi, text: 'spends more of the fight in control: ' + pct(g.vals[g.hi]) + ' to ' + pct(g.vals[g.lo]) + '.' });
    } else {
      // Say why the stat lines are missing, instead of leaving a silent gap.
      [a, b].forEach((x, i) => {
        if (!full(x)) stats.push({ side: i, text: x && x.coverage === 'limited'
          ? 'has limited fight data (' + plural(x.statFights, 'fight') + '), so strike and grappling comparisons are not shown.'
          : 'has no measured fight data yet, so strike and grappling comparisons are not shown.' });
      });
    }
    const ta = (a && a.tape) || {}, tb = (b && b.tape) || {};
    let g = gap(ta.reachIn, tb.reachIn, GAP.reachIn);
    if (g) tape.push({ side: g.hi, text: 'has the reach: ' + g.vals[g.hi] + '″ to ' + g.vals[g.lo] + '″.' });
    if (ta.stance && tb.stance && ta.stance !== tb.stance) {
      tape.push({ side: null, text: short[0] + ' is ' + ta.stance.toLowerCase() + ' and ' + short[1] + ' is ' + tb.stance.toLowerCase() + '.', plain: true });
    }
    const ages = [ageOn(ta.born, today), ageOn(tb.born, today)];
    g = gap(ages[0], ages[1], GAP.ageYears);
    if (g) tape.push({ side: g.hi, text: 'is ' + plural(g.vals[g.hi] - g.vals[g.lo], 'year') + ' older: ' + g.vals[g.hi] + ' to ' + g.vals[g.lo] + '.' });
    g = gap(ta.heightIn, tb.heightIn, GAP.heightIn);
    if (g) tape.push({ side: g.hi, text: 'is taller: ' + inchesText(g.vals[g.hi]) + ' to ' + inchesText(g.vals[g.lo]) + '.' });
    const take = (list, n) => list.slice(0, n).map(l => ({ side: l.side, text: l.plain ? l.text : short[l.side] + ' ' + l.text }));
    lines.push(...take(stats, MAX_STATS_LINES), ...take(tape, MAX_TAPE_LINES));
    return lines;
  }

  const FORM_CLASS = { W: 'is-win', L: 'is-loss', D: 'is-draw', NC: 'is-nc' };
  function initialsOf(name) { return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase(); }

  // One fighter's figure: a cutout over a red disc, else the photo in the disc, else initials.
  function figureHTML(fig, name, esc) {
    if (fig && fig.cutout) return '<span class="sb-fig" aria-hidden="true"><span class="sb-disc' + (fig.flag ? ' has-flag' : '') + '">' + (fig.flag ? '<img class="sb-flag" src="' + esc(fig.flag) + '" alt="" width="132" height="132" loading="lazy" decoding="async" onerror="this.remove()">' : '') + '</span><img class="sb-cut" src="' + esc(fig.cutout) + '" alt="" width="120" height="150" loading="lazy" decoding="async" onerror="this.remove()"></span>';
    if (fig && fig.photo) return '<span class="sb-fig sb-fig-photo" aria-hidden="true"><span class="sb-disc"><b>' + esc(initialsOf(name)) + '</b><img src="' + esc(fig.photo) + '" alt="" loading="lazy" decoding="async" onerror="this.remove()"></span></span>';
    return '<span class="sb-fig sb-fig-initials" aria-hidden="true"><span class="sb-disc"><b>' + esc(initialsOf(name)) + '</b></span></span>';
  }

  // Bar widths for a row where a bigger number is simply more (height, reach): each value as a share of the larger,
  // drawn from zero so the bars never exaggerate a gap. Null when the row has no bars or a side is missing.
  function barWidths(row) {
    if (!row || !row.n || !isNum(row.n[0]) || !isNum(row.n[1])) return null;
    const max = Math.max(row.n[0], row.n[1]);
    return max > 0 ? row.n.map(v => Math.round(v / max * 100)) : null;
  }

  // Layout B "face-off" (owner chose option B, 24 Nov 2026): the two figures face each other with a VS badge,
  // billing and weight class said once above them, then names, records and form, then the tape rows.
  // sides: [{ name, record, form: ['W','L',...], fig: { cutout, photo } }]; h.billing e.g. "Main event", h.division.
  function tapeHTML(sides, a, b, h) {
    const esc = h && h.esc ? h.esc : String;
    const today = (h && h.today) || new Date();
    const rows = tapeRows(a, b, today);
    const won = h && (h.winner === 0 || h.winner === 1) ? h.winner : null;
    // When either side has a tag (rank, tier, "Won"), both get the tag line, so the records stay level.
    const tagLine = sides.some(s => s && s.tags && s.tags.length);
    const info = (s, i) => '<div class="sb-fighter sb-' + (i ? 'b' : 'a') + (won === null ? '' : won === i ? ' is-winner' : ' is-loser') + '">' +
      '<strong class="sb-name">' + esc(s.name) + '</strong>' +
      (tagLine ? '<span class="sb-tags">' + (s.tags || []).map(t => '<em>' + esc(t) + '</em>').join('') + '</span>' : '') +
      '<span class="sb-record">' + esc(s.record || '—') + (s.note ? ' <small>' + esc(s.note) + '</small>' : '') + '</span>' +
      (s.form && s.form.length ? '<span class="sb-form" aria-label="Last ' + s.form.length + ' fights, newest first: ' + esc(s.form.join(', ')) + '">' +
        s.form.map(x => '<i class="' + (FORM_CLASS[x] || 'is-draw') + '">' + esc(x) + '</i>').join('') + '</span>' : '') + '</div>';
    const bar = (w, i, lead) => w ? '<span class="sb-bar sb-bar-' + (i ? 'b' : 'a') + (lead ? ' is-lead' : '') + '" aria-hidden="true"><i style="width:' + w[i] + '%"></i></span>' : '<span class="sb-bar" aria-hidden="true"></span>';
    const rowHTML = rows.map(r => {
      const w = barWidths(r);
      return '<div class="sb-row' + (w ? ' has-bars' : '') + '" role="group" aria-label="' + esc(r.label) + '">' +
        '<span class="sb-val' + (r.lead === 0 ? ' is-lead' : '') + '">' + esc(r.v[0]) + '</span>' + bar(w, 0, r.lead === 0) +
        '<span class="sb-lab">' + esc(r.label) + '</span>' +
        bar(w, 1, r.lead === 1) + '<span class="sb-val' + (r.lead === 1 ? ' is-lead' : '') + '">' + esc(r.v[1]) + '</span></div>';
    }).join('');
    const chip = h ? [h.billing, h.division, h.rounds, h.status].filter(Boolean).join(' · ') : '';
    return '<section class="sb-tape" aria-label="Tale of the tape"><h3 class="sb-title sb-title-hidden">Tale of the tape</h3>' +
      (chip ? '<p class="sb-chip">' + esc(chip) + '</p>' : '') +
      (h && h.result ? '<p class="sb-result"><b>Final</b> ' + esc(h.result) + '</p>' : '') +
      '<div class="sb-stage' + (won === null ? '' : won ? ' sb-won-b' : ' sb-won-a') + '">' + figureHTML(sides[0] && sides[0].fig, sides[0] && sides[0].name, esc) +
      '<span class="sb-vs" aria-hidden="true">VS</span>' + figureHTML(sides[1] && sides[1].fig, sides[1] && sides[1].name, esc) + '</div>' +
      '<div class="sb-head">' + sides.map(info).join('') + '</div>' +
      (rowHTML ? '<div class="sb-rows">' + rowHTML + '</div>' +
        (rows.some(r => r.key === 'weight') ? '<p class="sb-note">Listed weight is as shown on UFCStats, not fight-day weight.</p>' : '') : '') +
      '</section>';
  }

  function analysisHTML(lines, h) {
    const esc = h && h.esc ? h.esc : String;
    const items = lines.length ? lines.map(l => '<li class="' + (l.side === 0 ? 'is-a' : l.side === 1 ? 'is-b' : 'is-n') + '">' + esc(l.text) + '</li>').join('')
      : '<li>No large gaps in the numbers we measure.</li>';
    return '<section class="sb-analysis" aria-label="Analysis"><h3 class="sb-title">Analysis</h3><ul>' + items + '</ul>' +
      '<p class="sb-note">From each fighter\'s last five UFC fights and listed measurements. These describe the numbers; they are not predictions.</p></section>';
  }

  // Tabs. `tabs` is [[id, label]]; `active` is one of the ids.
  function tabsHTML(tabs, active, h) {
    const esc = h && h.esc ? h.esc : String;
    return '<div class="sb-tabs" role="tablist" aria-label="More about this fight">' + tabs.map(([id, label]) =>
      '<button type="button" role="tab" data-befn-history-tab="' + esc(id) + '" aria-selected="' + String(active === id) + '" class="' + (active === id ? 'is-active' : '') + '">' + esc(label) + '</button>').join('') + '</div>';
  }

  const api = { GAP, inchesText, ageOn, shortNames, tapeRows, barWidths, analysisLines, figureHTML, tapeHTML, analysisHTML, tabsHTML, initialsOf };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BEFNSnapshotB = api;
})(typeof window !== 'undefined' ? window : globalThis);
