/* Finished UFC bout snapshot (owner, 25 Nov 2026: design D "Poster" with the "X" insight cards).
 * Pure functions so tests can run them in Node. Everything is arithmetic on numbers BEFN already holds in
 * data/ufc-stats/fighters/<slug>.json: this fight's rounds, and each fighter's UFC fights before it.
 * No opinion and no prediction. A number we do not hold is left out, never shown as zero.
 *   - statistics: this fight's totals, with clear leads marked "notable" (rules in NOTABLE below)
 *   - analysis: a verdict line and up to four cards, chosen by fixed rules from how this fight differed from each
 *     fighter's own five previous stat-complete UFC fights. The comparison needs three or more of those for BOTH
 *     fighters; without it only the fight's own numbers are used (a finish card and a plain verdict).
 *   - "form": which fighter came in ahead on strike differential per minute over those previous fights. A gap of
 *     FORM_GAP significant strikes a minute or more names a form fighter; the verdict then says whether the result
 *     followed it ("Form favoured X ...") or went against it ("Against the form: ...").
 * Names in sentences are surnames, and nobody is given a pronoun: "their" is used where a pronoun is needed. */
(function (root) {
  'use strict';

  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const f1 = v => v.toFixed(1);
  const mmss = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');

  const FORM_GAP = 1.0;      // strike differential per minute needed to call one fighter the form fighter
  const MIN_PRIOR = 3;       // earlier stat-complete fights each fighter needs for the comparison
  const PRIOR_N = 5;         // earlier fights compared
  const SHIFT_POINTS = 15;   // change in a target's share of landed strikes worth a card, in percentage points
  const HELD_RATIO = 0.75;   // a fighter at or below this share of their usual strikes a minute was "held"
  const NOTABLE = { ratio: 1.5, strikes: 5, kd: 1, ctrlSec: 60, td: 2, sub: 2 };

  const fold = s => String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const surname = n => String(n || '').trim().replace(/\s+(jr\.?|sr\.?|ii|iii)$/i, '').split(/\s+/).pop();
  const shortNames = names => {
    const s = names.map(surname);
    return s[0].toLowerCase() === s[1].toLowerCase() ? names.map(n => String(n || '').trim()) : s;
  };

  // ----- sums -----
  // A stats file lists fights newest first; each round is [round, seconds, ownStats[], opponentStats[]] in roundFields order.
  const KEYS = ['sigLanded', 'sigAttempted', 'totalLanded', 'headLanded', 'bodyLanded', 'legLanded', 'distanceLanded', 'clinchLanded',
    'groundLanded', 'knockdowns', 'takedowns', 'takedownAttempts', 'subAttempts', 'controlSec'];

  function sumSide(fights, fields, which) {
    const idx = {}; KEYS.forEach(k => { idx[k] = fields.indexOf(k); });
    const t = {}; KEYS.forEach(k => { t[k] = 0; });
    let seconds = 0;
    for (const x of fights) {
      seconds += isNum(x.seconds) ? x.seconds : 0;
      for (const r of x.rounds || []) {
        const a = r[which];
        if (!Array.isArray(a)) continue;
        KEYS.forEach(k => { if (idx[k] >= 0 && isNum(a[idx[k]])) t[k] += a[idx[k]]; });
      }
    }
    t.seconds = seconds; t.mins = seconds / 60;
    return t;
  }

  const completeFights = d => (d && Array.isArray(d.fights) ? d.fights : []).filter(x => x && x.statsComplete && Array.isArray(x.rounds) && x.rounds.length && isNum(x.seconds) && x.seconds > 0);
  const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

  // Profile of a fighter over a list of their own fights: rates a minute, target shares, results.
  function profileOf(fights, fields) {
    const own = sumSide(fights, fields, 2), opp = sumSide(fights, fields, 3), m = own.mins || 1;
    const share = k => own.sigLanded > 0 ? own[k] / own.sigLanded * 100 : null;
    const out = {
      fights: fights.length, mins: own.mins,
      slpm: own.sigLanded / m, sapm: opp.sigLanded / m, diffPm: (own.sigLanded - opp.sigLanded) / m,
      share: { head: share('headLanded'), body: share('bodyLanded'), leg: share('legLanded') },
      pm: { head: own.headLanded / m, body: own.bodyLanded / m, leg: own.legLanded / m },
      absPm: { head: opp.headLanded / m, body: opp.bodyLanded / m, leg: opp.legLanded / m },
      kd: own.knockdowns, kdAbs: opp.knockdowns,
      W: 0, L: 0, other: 0, koWins: 0, stopped: 0
    };
    for (const x of fights) {
      if (x.outcome === 'W') { out.W++; if (x.method === 'ko') out.koWins++; }
      else if (x.outcome === 'L') { out.L++; if (x.method === 'ko' || x.method === 'sub') out.stopped++; }
      else out.other++;
    }
    return out;
  }

  // ----- the fight -----
  // a, b: parsed stats files for the two fighters in card order (either may be null); dateISO: the fight day.
  // Returns null when no stat-complete record of this fight is held.
  function fightOf(a, b, names, dateISO) {
    const find = (d, oppName) => completeFights(d).find(x => x.date === dateISO && fold(x.opponent) === fold(oppName));
    let x = find(a, names[1]), swap = false, src = a;
    if (!x) { x = find(b, names[0]); swap = true; src = b; }
    if (!x) return null;
    const fields = src.roundFields || [];
    const own = sumSide([x], fields, 2), opp = sumSide([x], fields, 3);
    const T = swap ? [opp, own] : [own, opp];
    const outcome = swap ? ({ W: 'L', L: 'W' }[x.outcome] || x.outcome) : x.outcome; // outcome for index 0
    const rounds = x.rounds.map(r => {
      const mine = {}, theirs = {};
      const ki = fields.indexOf('sigLanded'), kd = fields.indexOf('knockdowns');
      const o = r[2] || [], p = r[3] || [];
      mine.sig = o[ki]; theirs.sig = p[ki]; mine.kd = o[kd]; theirs.kd = p[kd];
      return { n: r[0], seconds: r[1], sig: swap ? [theirs.sig, mine.sig] : [mine.sig, theirs.sig], kd: swap ? [theirs.kd, mine.kd] : [mine.kd, theirs.kd] };
    });
    return { T, outcome, method: x.method, endRound: x.endRound, endTime: x.endTime, seconds: x.seconds, rounds, mainEvent: !!x.mainEvent };
  }

  // The newest five stat-complete fights before the fight day. null when the file is missing.
  function priorOf(d, dateISO) {
    if (!d) return null;
    const fights = completeFights(d).filter(x => x.date < dateISO).sort(byDateDesc).slice(0, PRIOR_N);
    return fights.length ? profileOf(fights, d.roundFields || []) : null;
  }

  // The newest five fights up to and including the fight day (any fight with a result, stats or not), for the last-five strip.
  const METHOD = { ko: 'KO', sub: 'SUB', dec: 'DEC', draw: 'DRAW', nc: 'NC', dq: 'DQ' };
  function lastFive(d, dateISO) {
    if (!d || !Array.isArray(d.fights)) return null;
    const rows = d.fights.filter(x => x && x.date && x.date <= dateISO && x.opponent).sort(byDateDesc).slice(0, 5).map(x => ({
      outcome: x.outcome === 'W' ? 'W' : x.outcome === 'L' ? 'L' : x.method === 'nc' ? 'NC' : 'D',
      opponent: surname(x.opponent),
      method: (METHOD[x.method] || '') + ((x.method === 'ko' || x.method === 'sub') && x.endRound ? ' R' + x.endRound : '')
    }));
    return rows.length ? rows : null;
  }

  // ----- notable rules and rows -----
  // A count is notable when one fighter landed at least 1.5 times as many as the other and at least 5 more (a lead of
  // 5+ from zero counts). Knockdowns: any lead. Control: a lead of a minute or more. Takedowns and sub attempts: a lead of 2.
  function isNotable(key, x, y) {
    const hi = Math.max(x, y), lo = Math.min(x, y), gap = hi - lo;
    if (key === 'knockdowns') return gap >= NOTABLE.kd;
    if (key === 'controlSec') return gap >= NOTABLE.ctrlSec;
    if (key === 'takedowns') return gap >= NOTABLE.td;
    if (key === 'subAttempts') return gap >= NOTABLE.sub;
    return gap >= NOTABLE.strikes && hi >= lo * NOTABLE.ratio;
  }
  const ROWS = [
    ['Striking', [['sigLanded', 'Significant strikes'], ['totalLanded', 'Total strikes'], ['knockdowns', 'Knockdowns']]],
    ['Where they landed', [['headLanded', 'Head'], ['bodyLanded', 'Body'], ['legLanded', 'Legs']]],
    ['Range', [['distanceLanded', 'Distance'], ['clinchLanded', 'Clinch'], ['groundLanded', 'Ground']]],
    ['Grappling', [['controlSec', 'Control time'], ['takedowns', 'Takedowns'], ['subAttempts', 'Submission attempts']]]
  ];
  const CHIP_ORDER = [['knockdowns', 'Knockdowns'], ['legLanded', 'Leg strikes'], ['bodyLanded', 'Body strikes'], ['headLanded', 'Head strikes'],
    ['groundLanded', 'Ground strikes'], ['controlSec', 'Control time'], ['takedowns', 'Takedowns'], ['subAttempts', 'Submission attempts']];

  function statRows(T) {
    return ROWS.map(([group, rows]) => ({
      group,
      rows: rows.map(([key, label]) => ({ key, label, v: [T[0][key], T[1][key]], hot: isNotable(key, T[0][key], T[1][key]) }))
        // a row nobody scored in is still shown (a dash would claim we did not measure it), except submission attempts at 0-0
        .filter(r => !(r.key === 'subAttempts' && r.v[0] === 0 && r.v[1] === 0))
    }));
  }
  function chips(T, short) {
    const out = [];
    const d = T[0].sigLanded - T[1].sigLanded;
    if (d !== 0) out.push({ big: '+' + Math.abs(d), small: 'Sig. strike differential · ' + short[d > 0 ? 0 : 1] });
    for (const [key, label] of CHIP_ORDER) {
      if (out.length >= 4) break;
      const x = T[0][key], y = T[1][key];
      if (!isNotable(key, x, y)) continue;
      const lead = x > y ? 0 : 1, hi = Math.max(x, y), lo = Math.min(x, y);
      out.push({ big: (key === 'controlSec' ? mmss(hi) + '–' + mmss(lo) : hi + '–' + lo), small: label + ' · ' + short[lead] });
    }
    return out;
  }

  // ----- the analysis -----
  const TARGETS = [['leg', 'legs', 'legLanded'], ['body', 'body', 'bodyLanded'], ['head', 'head', 'headLanded']];
  const countWord = n => ({ 1: 'once', 2: 'twice', 3: 'three times', 4: 'four times', 5: 'five times' })[n] || n + ' times';
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  function analyse(a, b, names, dateISO, winnerIndex) {
    const fight = fightOf(a, b, names, dateISO);
    if (!fight) return null;
    const short = shortNames(names), T = fight.T;
    // The result row on the card and the stats record must agree on the winner; if they do not, only the numbers are shown.
    const statsWinner = fight.outcome === 'W' ? 0 : fight.outcome === 'L' ? 1 : -1;
    const win = typeof winnerIndex === 'number' && winnerIndex !== statsWinner ? -1 : statsWinner;
    const m = { names, short, winner: win, fight, rows: statRows(T), chips: chips(T, short), prior: null, verdict: null, cards: [], rounds: fight.rounds };
    const pa = priorOf(a, dateISO), pb = priorOf(b, dateISO);
    const hasPrior = pa && pb && pa.fights >= MIN_PRIOR && pb.fights >= MIN_PRIOR;
    if (hasPrior) m.prior = [pa, pb];
    if (win < 0) return m; // draw or no contest: numbers only
    const w = win, l = 1 - win, sw = short[w], sl = short[l];
    const now = i => {
      const t = T[i], mins = t.mins || 1;
      return { slpm: t.sigLanded / mins, share: { head: t.sigLanded ? t.headLanded / t.sigLanded * 100 : null, body: t.sigLanded ? t.bodyLanded / t.sigLanded * 100 : null, leg: t.sigLanded ? t.legLanded / t.sigLanded * 100 : null },
        pm: { head: t.headLanded / mins, body: t.bodyLanded / mins, leg: t.legLanded / mins } };
    };
    const nw = now(w), nl = now(l), oppNow = i => { const t = T[1 - i], mins = T[i].mins || 1; return { head: t.headLanded / mins, body: t.bodyLanded / mins, leg: t.legLanded / mins }; };
    const P = hasPrior ? [pa, pb] : null;

    // levers (what was different this time), used by the verdict and the cards
    let shift = null, heldRatio = null, winnerRatio = null;
    if (P) {
      const deltas = TARGETS.map(([k, word]) => ({ k, word, d: nw.share[k] - P[w].share[k], prior: P[w].share[k], now: nw.share[k] })).filter(x => isNum(x.d));
      const up = deltas.slice().sort((x, y) => y.d - x.d)[0];
      if (up && up.d >= SHIFT_POINTS) shift = { up, down: deltas.filter(x => x.k !== up.k && x.d <= -SHIFT_POINTS).sort((x, y) => x.d - y.d)[0] || null };
      if (P[l].slpm > 0) heldRatio = nl.slpm / P[l].slpm;
      if (P[w].slpm > 0) winnerRatio = nw.slpm / P[w].slpm;
    }

    // form: strike differential a minute over the previous fights
    let fav = null;
    if (P && Math.abs(P[0].diffPm - P[1].diffPm) >= FORM_GAP) fav = P[0].diffPm > P[1].diffPm ? 0 : 1;

    // the one-line verdict
    const lever = [];
    if (shift) lever.push(shift.up.k === 'leg' ? sw + ' went to the legs' : shift.up.k === 'body' ? sw + ' went to the body' : sw + ' went upstairs');
    if (heldRatio !== null && heldRatio <= 0.6) lever.push((lever.length ? 'held ' : sw + ' held ') + sl + ' to under ' + (heldRatio <= 0.5 ? 'half' : 'two thirds') + ' of their usual output');
    else if (heldRatio !== null && heldRatio <= HELD_RATIO && !lever.length) lever.push(sw + ' held ' + sl + ' below their usual output');
    if (!lever.length) lever.push(sw + ' out-landed ' + sl + ' ' + T[w].sigLanded + ' to ' + T[l].sigLanded);
    const leverText = lever.join(' and ') + '.';
    if (P) {
      m.verdict = fav === null
        ? { lead: 'Form was close coming in, and ', mark: leverText }
        : fav === w
          ? { lead: 'Form favoured ' + sw + ' and the result followed it: ', mark: leverText }
          : { lead: 'Against the form: ' + sl + ' came in ahead on strike differential, but ', mark: leverText };
    } else {
      m.verdict = { lead: '', mark: leverText };
    }
    m.form = P ? { fav, followed: fav === null ? null : fav === w } : null;

    const cards = [];
    // 1. Coming in
    if (P) {
      const diffText = v => (v >= 0 ? '+' : '−') + f1(Math.abs(v));
      const other = fav === null ? null : 1 - fav;
      const head = fav === null ? 'Form was close coming in.'
        : short[fav] + ' came in ahead on form' + (P[other].diffPm < 0 ? '; ' + short[other] + ' had been out-landed.' : '.');
      const parts = [];
      if (fav !== null) parts.push(short[fav] + ' had out-landed opponents by ' + f1(P[fav].diffPm) + ' a minute.');
      else parts.push('Their strike differentials were ' + diffText(P[0].diffPm) + ' and ' + diffText(P[1].diffPm) + ' a minute.');
      const soft = [0, 1].map(i => ({ i, kdAbs: P[i].kdAbs, stopped: P[i].stopped, n: P[i].fights })).filter(x => x.kdAbs >= 2 || x.stopped >= 2).sort((x, y) => (y.kdAbs + y.stopped) - (x.kdAbs + x.stopped))[0];
      if (soft) {
        let said;
        if (soft.kdAbs >= 2) said = 'been dropped ' + countWord(soft.kdAbs) + ' in ' + soft.n + ' fights' + (soft.stopped >= 1 ? ' and stopped in ' + soft.stopped + ' of them' : '');
        else said = 'been stopped in ' + soft.stopped + ' of ' + soft.n + ' fights';
        parts.push(short[soft.i] + ' had ' + said + '.');
      }
      cards.push({ id: 'form', label: 'Coming in', head, text: parts.join(' '),
        table: {
          cols: [short[0], 'Before', short[1]],
          rows: [
            ['Record', P[0].W + '–' + P[0].L + (P[0].other ? '–' + P[0].other : ''), P[1].W + '–' + P[1].L + (P[1].other ? '–' + P[1].other : '')],
            ['Strike diff / min', diffText(P[0].diffPm), diffText(P[1].diffPm)],
            ['KO wins', String(P[0].koWins), String(P[1].koWins)],
            ['Stopped', String(P[0].stopped), String(P[1].stopped)],
            ['Knockdowns, for–against', P[0].kd + '–' + P[0].kdAbs, P[1].kd + '–' + P[1].kdAbs]
          ] } });
    }
    // 2. The plan
    if (P && shift) {
      const t = shift.up, pick = TARGETS.find(x => x[0] === t.k);
      const cmp = [{ label: pick[1].charAt(0).toUpperCase() + pick[1].slice(1) + ', share of ' + sw + '’s strikes', usual: t.prior, now: t.now, max: 100, fmt: 'pct' }];
      if (shift.down) { const dn = TARGETS.find(x => x[0] === shift.down.k); cmp.push({ label: dn[1].charAt(0).toUpperCase() + dn[1].slice(1) + ', share of ' + sw + '’s strikes', usual: shift.down.prior, now: shift.down.now, max: 100, fmt: 'pct' }); }
      const absU = P[l].absPm[t.k], absN = oppNow(l)[t.k];
      cmp.push({ label: pick[1].charAt(0).toUpperCase() + pick[1].slice(1) + ' ' + sl + ' took / min', usual: absU, now: absN, max: Math.max(1, Math.ceil(Math.max(absU, absN) * 1.25)), fmt: 'rate', red: true });
      cards.push({ id: 'plan', label: 'The plan', head: sw + (t.k === 'leg' ? ' went to the legs.' : t.k === 'body' ? ' went to the body.' : ' went upstairs.'), cmp,
        text: T[w][pick[2]] + ' of ' + sw + '’s ' + T[w].sigLanded + ' significant strikes were to the ' + pick[1] + ', against ' + T[l][pick[2]] + ' of ' + sl + '’s ' + T[l].sigLanded + '.' });
    }
    // 3. The gap
    if (P && ((heldRatio !== null && heldRatio <= HELD_RATIO) || (winnerRatio !== null && winnerRatio >= 1.25))) {
      const cmp = [];
      const lTop = TARGETS.slice().sort((x, y) => P[l].share[y[0]] - P[l].share[x[0]])[0];
      let head, text = '';
      if (heldRatio !== null && heldRatio <= HELD_RATIO) {
        head = heldRatio <= 0.5 ? sl + ' was held to under half of their usual output.' : sl + ' landed less than usual.';
        cmp.push({ label: sl + ', strikes / min', usual: P[l].slpm, now: nl.slpm, max: Math.max(1, Math.ceil(Math.max(P[l].slpm, nl.slpm) * 1.25)), fmt: 'rate', red: true });
        cmp.push({ label: sl + ', ' + lTop[1] + ' / min', usual: P[l].pm[lTop[0]], now: nl.pm[lTop[0]], max: Math.max(1, Math.ceil(Math.max(P[l].pm[lTop[0]], nl.pm[lTop[0]]) * 1.25)), fmt: 'rate', red: true });
      } else {
        head = sw + ' raised the pace.';
      }
      cmp.push({ label: sw + ', strikes / min', usual: P[w].slpm, now: nw.slpm, max: Math.max(1, Math.ceil(Math.max(P[w].slpm, nw.slpm) * 1.25)), fmt: 'rate' });
      if (winnerRatio !== null && winnerRatio <= 0.85) text = sw + ' landed less than usual too. ' + (shift ? 'The edge came from where ' + sw + ' landed, not how often.' : '');
      else if (winnerRatio !== null && winnerRatio >= 1.15) text = sw + ' also pushed the pace: ' + f1(nw.slpm) + ' against ' + f1(P[w].slpm) + ' a minute.';
      cards.push({ id: 'gap', label: 'The gap', head, cmp, text: text.trim() });
    }
    // 4. The finish
    {
      const mWord = fight.method === 'ko' ? 'KO/TKO' : fight.method === 'sub' ? 'Submission' : fight.method === 'dec' ? 'Decision' : '';
      const finished = fight.method === 'ko' || fight.method === 'sub';
      const kdW = T[w].knockdowns, kdL = T[l].knockdowns, subW = T[w].subAttempts;
      const head = finished ? mWord + ' in round ' + fight.endRound + ' at ' + fight.endTime + '.' : mWord ? 'Went the distance: ' + plural(fight.rounds.length, 'round') + '.' : '';
      if (head) {
        const bits = [];
        if (finished && kdW > 0) bits.push(sw + ' knocked ' + sl + ' down ' + countWord(kdW) + ' in the fight.');
        if (finished && kdL > 0) bits.push(sl + ' scored ' + (kdL === 1 ? 'a knockdown' : plural(kdL, 'knockdown')) + ' of their own.');
        if (fight.method === 'sub' && subW > 0) bits.push(sw + ' attempted ' + plural(subW, 'submission') + '.');
        if (!finished) bits.push(sw + ' won the striking ' + T[w].sigLanded + ' to ' + T[l].sigLanded + '.');
        if (P && finished && P[w].kd >= 1) bits.push(sw + ' had scored ' + plural(P[w].kd, 'knockdown') + ' in the previous ' + P[w].fights + ' fights and been dropped ' + (P[w].kdAbs ? plural(P[w].kdAbs, 'time') : 'in none') + '.');
        cards.push({ id: 'finish', label: 'The finish', head, text: bits.join(' '), timeline: { rounds: fight.rounds, finished, endRound: fight.endRound, endTime: fight.endTime, winner: w } });
      }
    }
    m.cards = cards;
    return m;
  }

  // ----- HTML -----
  const fmtCmp = (v, kind) => kind === 'pct' ? Math.round(v) + '%' : f1(v);
  function cmpHTML(c) {
    return '<div class="sr-cmp"><span>' + esc(c.label) + '</span><span class="sr-trk" aria-hidden="true"><i class="' + (c.red ? 'is-red' : '') + '" style="width:' + Math.max(0, Math.min(100, c.now / c.max * 100)).toFixed(1) + '%"></i><b style="left:calc(' + Math.max(0, Math.min(100, c.usual / c.max * 100)).toFixed(1) + '% - 1px)"></b></span>' +
      '<span class="sr-val"><s>' + fmtCmp(c.usual, c.fmt) + ' →</s> ' + fmtCmp(c.now, c.fmt) + '</span></div>';
  }
  function timelineHTML(tl, short) {
    const segs = tl.rounds.map(r => {
      const last = r.n === tl.endRound && tl.finished;
      const kd = (r.kd[0] || 0) + (r.kd[1] || 0);
      const label = tl.rounds.length > 2 ? 'R' + r.n : 'Round ' + r.n;
      return '<div class="sr-seg' + (last ? ' is-end' : '') + '" style="flex:' + Math.max(1, r.seconds) + '">' + esc(label) + (last ? ' · ' + esc(tl.endTime) : '') +
        (kd ? '<i class="sr-kd" role="img" aria-label="' + kd + (kd === 1 ? ' knockdown' : ' knockdowns') + ' in round ' + r.n + '"></i>' : '') + '</div>';
    }).join('');
    const hasKd = tl.rounds.some(r => (r.kd[0] || 0) + (r.kd[1] || 0));
    return '<div class="sr-tl">' + segs + '</div>' + (hasKd ? '<p class="sr-key"><span class="sr-kd-key">Knockdown in the round</span></p>' : '');
  }
  function cardHTML(c, m) {
    const table = c.table ? '<div class="sr-coming" role="table" aria-label="Form coming in">' +
      c.table.cols.map(x => '<div role="columnheader">' + esc(x) + '</div>').join('') +
      c.table.rows.map(r => '<div role="cell">' + esc(r[1]) + '</div><div role="cell">' + esc(r[0]) + '</div><div role="cell">' + esc(r[2]) + '</div>').join('') + '</div>' : '';
    const cmp = c.cmp ? c.cmp.map(cmpHTML).join('') + '<p class="sr-key"><span class="sr-k1">This fight</span><span class="sr-k2">Their usual, previous fights</span></p>' : '';
    return '<div class="sr-card sr-card-' + c.id + '"><span class="sr-lab">' + esc(c.label) + '</span><p class="sr-hd">' + esc(c.head) + '</p>' + table + cmp +
      (c.timeline ? timelineHTML(c.timeline, m.short) : '') + (c.text ? '<p class="sr-tx">' + esc(c.text) + '</p>' : '') + '</div>';
  }
  function analysisHTML(m) {
    if (!m || m.winner < 0 || !m.verdict) return '';
    const v = m.verdict;
    return '<section class="sr-analysis" aria-label="How it was won"><h3 class="sr-h3">How it was won</h3>' +
      '<p class="sr-verdict">' + esc(v.lead) + '<mark>' + esc(v.mark) + '</mark></p>' +
      '<div class="sr-ins">' + m.cards.map(c => cardHTML(c, m)).join('') + '</div>' +
      '<p class="sr-note">' + (m.prior ? 'Compared with each fighter’s previous ' + Math.min(m.prior[0].fights, m.prior[1].fights) + ' UFC fights with full stats. ' : 'Previous-fight comparison needs three earlier UFC fights with full stats for both fighters. ') +
      'Written from saved numbers by fixed rules, with no opinion or prediction.</p></section>';
  }
  function statsHTML(m) {
    if (!m) return '';
    const num = (key, v) => key === 'controlSec' ? mmss(v) : String(v);
    const rows = m.rows.map(g => '<div class="sr-group">' + esc(g.group) + '</div>' + g.rows.map(r => {
      const x = r.v[0], y = r.v[1], top = Math.max(x, y) || 1, la = x > y, lb = y > x;
      return '<div class="sr-row' + (r.hot ? ' is-hot' : '') + '" role="group" aria-label="' + esc(r.label) + (r.hot ? ', notable' : '') + '">' +
        '<span class="sr-n' + (la ? ' is-lead' : '') + '">' + num(r.key, x) + '</span><span class="sr-tr sr-a"><i class="' + (la ? 'is-lead' : '') + '" style="width:' + (x / top * 100).toFixed(1) + '%"></i></span>' +
        '<span class="sr-l">' + (r.hot ? '<em>Notable</em>' : '') + esc(r.label) + '</span>' +
        '<span class="sr-tr sr-b"><i class="' + (lb ? 'is-lead' : '') + '" style="width:' + (y / top * 100).toFixed(1) + '%"></i></span><span class="sr-n' + (lb ? ' is-lead' : '') + '">' + num(r.key, y) + '</span></div>';
    }).join('')).join('');
    const chipHTML = m.chips.length ? '<div class="sr-chips">' + m.chips.map(c => '<div class="sr-chip"><b>' + esc(c.big) + '</b><span>' + esc(c.small) + '</span></div>').join('') + '</div>' : '';
    return '<section class="sr-stats" aria-label="Fight statistics"><h3 class="sr-h3">Fight statistics</h3>' + chipHTML + rows +
      '<p class="sr-note">Totals for this fight from the saved round-by-round numbers. Highlighted rows are where one fighter clearly led; the lead is bold.</p></section>';
  }
  function lastFiveHTML(rows, names) {
    if (!rows || !rows[0] || !rows[1]) return '';
    const card = (name, list) => '<div class="sr-l5c"><header><b>' + esc(name) + '</b><span>Up to this fight, newest first</span></header><div class="sr-pills">' +
      list.map(p => '<div class="sr-pill ' + (p.outcome === 'W' ? 'is-w' : p.outcome === 'L' ? 'is-l' : 'is-d') + '"><b>' + esc(p.outcome) + '</b><em>' + esc(p.opponent) + '</em><small>' + esc(p.method || '—') + '</small></div>').join('') + '</div></div>';
    return '<section class="sr-last5" aria-label="Last five fights"><h3 class="sr-h3">Last five fights</h3><div class="sr-l5">' + card(names[0], rows[0]) + card(names[1], rows[1]) + '</div></section>';
  }

  // Hero: borderless cutouts on a dark stage. sides: [{ name, record, note, fig: {cutout|photo}, initials }].
  function figHTML(side, i, lost) {
    const fig = side.fig || {};
    if (fig.cutout) return '<img class="sr-cut sr-' + (i ? 'b' : 'a') + (lost ? ' is-lost' : '') + '" src="' + esc(fig.cutout) + '" alt="' + esc(side.name) + '" decoding="async" onerror="this.remove()">';
    return '<span class="sr-ph sr-' + (i ? 'b' : 'a') + '" aria-hidden="true"><b>' + esc(side.initials || '') + '</b>' +
      (fig.photo ? '<img src="' + esc(fig.photo) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">' : '') + '</span>';
  }
  // h: { winner, chip: [billing, division, rounds], kicker, headline, sub }
  function heroHTML(sides, h) {
    const won = h.winner === 0 || h.winner === 1 ? h.winner : null;
    const info = (s, i) => '<div class="sr-who sr-' + (i ? 'b' : 'a') + (won === null ? '' : won === i ? ' is-winner' : ' is-loser') + '">' +
      (won === null ? '' : '<span class="sr-tag' + (won === i ? '' : ' is-lost') + '">' + (won === i ? 'Won' : 'Lost') + '</span>') +
      '<b class="sr-name">' + esc(s.name) + '</b><span class="sr-rec">' + esc(s.record || '—') + (s.note ? '<small>' + esc(s.note) + '</small>' : '') + '</span></div>';
    return '<div class="sr-hero' + (won === null ? ' is-even' : '') + '"><div class="sr-top">' + (h.kicker ? '<span class="sr-k">' + esc(h.kicker) + '</span>' : '') +
      '<span class="sr-w">' + esc(h.headline || '') + '</span>' + (h.sub ? '<span class="sr-m">' + esc(h.sub) + '</span>' : '') + '</div>' +
      '<div class="sr-stage"><span class="sr-glow sr-a"></span><span class="sr-glow sr-b"></span>' + figHTML(sides[0], 0, won === 1) + figHTML(sides[1], 1, won === 0) + '<span class="sr-fade"></span>' +
      '<div class="sr-names">' + info(sides[0], 0) + '<span class="sr-vs" aria-hidden="true">VS</span>' + info(sides[1], 1) + '</div></div>' +
      ((h.chip || []).filter(Boolean).length ? '<div class="sr-chipline">' + h.chip.filter(Boolean).map(x => '<span>' + esc(x) + '</span>').join('') + '</div>' : '') + '</div>';
  }
  // Finish video: our own cutouts on a poster, so no third-party picture loads. The player (youtube-nocookie) is added
  // by assets/fighter-finish-clips.js only when the reader taps (its .befn-finish-play handler).
  function videoHTML(clip, sides, labels, winner) {
    if (!clip || !/^[\w-]{11}$/.test(clip.id || '')) return '';
    const label = (labels && labels[clip.kind]) || 'Watch the highlights';
    const img = (s, i) => s.fig && s.fig.cutout ? '<img class="sr-vimg sr-' + (i ? 'b' : 'a') + (winner === 0 || winner === 1 ? (winner === i ? '' : ' is-lost') : '') + '" src="' + esc(s.fig.cutout) + '" alt="" loading="lazy" decoding="async" onerror="this.remove()">' : '';
    const title = clip.title || (sides[0].name + ' vs ' + sides[1].name);
    return '<section class="sr-video" aria-label="Fight video"><div class="sr-vlab"><h3 class="sr-h3">' + esc(label) + '</h3><span>' + esc(clip.publisher || 'UFC') + '</span></div>' +
      '<div class="sr-vwrap"><button type="button" class="befn-finish-play sr-vid" data-finish-id="' + esc(clip.id) + '" data-finish-title="' + esc(title) + '" aria-label="' + esc(label + ': ' + title) + '">' +
      '<span class="sr-vbg"></span>' + img(sides[0], 0) + img(sides[1], 1) + '<span class="sr-play" aria-hidden="true"></span>' +
      '<span class="sr-vcap"><span>' + esc(sides[0].name + ' vs ' + sides[1].name) + '</span><span>Tap to play here</span></span></button></div>' +
      '<p class="sr-note">Official upload. The player loads only when you tap, and this block shows only for a clip confirmed playable in your country.</p></section>';
  }

  const api = { FORM_GAP, MIN_PRIOR, PRIOR_N, SHIFT_POINTS, HELD_RATIO, NOTABLE, fold, surname, shortNames, sumSide, profileOf, fightOf, priorOf, lastFive, isNotable,
    statRows, chips, analyse, analysisHTML, statsHTML, lastFiveHTML, heroHTML, videoHTML, cmpHTML };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BEFNSnapshotResult = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
