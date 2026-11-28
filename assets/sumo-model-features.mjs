/* BEFN Sumo predictor v2: the feature engine. One stateful replay of saved basho, day by day.
   For every bout it records what was known the morning of that day, then updates the state with
   the day's results. The build script (scripts/sumo-build-model.mjs) runs it over 2000 onwards to
   fit and test the model; the browser runs the same code from a saved snapshot to rate live bouts.
   Pure JavaScript, no DOM. Rows are banzuke rows: { rikishiID, rank, record: [{ result, opponentID, kimarite }] x15 }.
   Results: win, loss, fusen win, fusen loss, absent, '' (no bout that day, lower divisions). */
import { position } from './sumo-home-data.mjs';

const LN10 = Math.log(10);
const sig = x => 1 / (1 + Math.exp(-x));
export const rankScore = rank => { const p = position(rank); return -Math.log(1 + (p ?? 260) / 8); };
const BOUTS = { Makuuchi: 15, Juryo: 15, Makushita: 7, Sandanme: 7, Jonidan: 7, Jonokuchi: 7 };
const divOf = rank => { const t = String(rank || '').split(' ')[0]; return ['Yokozuna', 'Ozeki', 'Sekiwake', 'Komusubi', 'Maegashira'].includes(t) ? 'Makuuchi' : t; };

/* Winning-technique families, for a style profile. */
const PUSH = new Set(['oshidashi', 'tsukidashi', 'oshitaoshi', 'tsukitaoshi', 'okuridashi', 'okuritaoshi', 'abisetaoshi']);
const BELT = new Set(['yorikiri', 'yoritaoshi', 'uwatenage', 'shitatenage', 'uwatedashinage', 'shitatedashinage', 'kotenage', 'sukuinage', 'tsuridashi', 'kimedashi', 'kimetaoshi', 'utchari', 'sotogake', 'uchigake', 'kakenage', 'kubinage', 'yobimodoshi', 'shitatehineri', 'uwatehineri']);
const PULL = new Set(['hatakikomi', 'hikiotoshi', 'hikkake', 'tsukiotoshi', 'katasukashi', 'makiotoshi', 'kainahineri']);

/* Japanese birthplaces read "Hyogo-ken, ...", "Tokyo-to, ...", "Osaka-fu, ...", "Hokkaido, ...". */
export const foreignBorn = shusshin => { const s = String(shusshin || '').trim(); if (!s) return null; return /^(\S+-(ken|to|fu)\b|Hokkaido|Tokyo|Osaka|Kyoto)/i.test(s) ? 0 : 1; };

/* Ratings. `elo`: starts from rank (scale x rank score) the first time a man is seen; K is Kmin plus a
   newcomer boost that fades with his rated bouts (tuned on 2003-2024, see docs/sumo-predictor.md).
   `residual`: the v1 rating against rank, kept as a second view. */
export const ELO = { residual: [8, 16, 32], rankWeight: 0.25, Kmin: 12, Kx: 80, tau: 20, scale: 175 };

export class SumoReplay {
  /* attrs: Map id -> { birthDate, shusshin, debut, heights: [[bashoId, cm, kg], ...] ascending } */
  constructor(attrs = new Map(), state = null) {
    this.attrs = attrs;
    const s = state || {};
    this.res = (s.res || ELO.residual.map(() => ({}))).map(o => new Map(Object.entries(o).map(([k, v]) => [Number(k), v])));
    this.pure = new Map(Object.entries(s.pure || {}).map(([k, v]) => [Number(k), v]));
    this.n = new Map(Object.entries(s.n || {}).map(([k, v]) => [Number(k), v]));
    /* Copies, never the saved arrays themselves: a replay updates these in place, and the same saved
       state is replayed many times in one page. */
    this.h2h = new Map(Object.entries(s.h2h || {}).map(([k, v]) => [k, v.slice()]));
    this.style = new Map(Object.entries(s.style || {}).map(([k, v]) => [Number(k), v.slice()]));
    this.prev = new Map(Object.entries(s.prev || {}).map(([k, v]) => [Number(k), v.slice()]));
    this.maku = new Map(Object.entries(s.maku || {}).map(([k, v]) => [Number(k), v]));
    this.lastBasho = s.lastBasho || null;
  }

  /* Everything needed to carry on later (for the browser), limited to the given ids if any. */
  snapshot(keep) {
    const want = keep ? new Set([...keep].map(Number)) : null;
    const ok = k => !want || want.has(Number(k));
    const obj = m => Object.fromEntries([...m].filter(([k]) => ok(k)).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 100) / 100 : v]));
    const pairOk = k => { const [x, y] = k.split(':'); return ok(x) && ok(y); };
    return { lastBasho: this.lastBasho, res: this.res.map(obj), pure: obj(this.pure), n: obj(this.n),
      h2h: Object.fromEntries([...this.h2h].filter(([k]) => pairOk(k))), style: obj(this.style), prev: obj(this.prev), maku: obj(this.maku) };
  }

  startBasho(bashoId, rows) {
    this.bashoId = String(bashoId);
    this.rows = new Map(rows.map(r => [Number(r.rikishiID), { ...r, div: divOf(r.rank) }]));
    /* Pure Elo starts from rank the first time a man is seen. */
    for (const r of this.rows.values()) if (!this.pure.has(r.rikishiID)) this.pure.set(r.rikishiID, ELO.scale * rankScore(r.rank));
  }

  /* Wins, losses, absences of one man before `day` this basho. */
  sofar(r, day) {
    let w = 0, l = 0, a = 0;
    for (const b of (r.record || []).slice(0, day - 1)) { if (!b) continue; if (/win/.test(b.result)) w++; else if (/loss/.test(b.result)) l++; else if (b.result === 'absent') a++; }
    return { w, l, a };
  }

  side(r, day) {
    const id = r.rikishiID, at = this.attrs.get(id) || {}, s = this.sofar(r, day);
    const N = BOUTS[r.div] || 15, KK = Math.ceil((N + 1) / 2);
    const lossesAll = s.l + s.a, done = s.w + lossesAll, left = Math.max(0, N - done);
    const decided = s.w >= KK || lossesAll > N - KK ? 1 : 0, need = Math.max(0, KK - s.w);
    let age = null;
    if (at.birthDate) age = (Date.UTC(+this.bashoId.slice(0, 4), +this.bashoId.slice(4) - 1, 10) - Date.parse(at.birthDate)) / (365.25 * 864e5);
    let h = null, kg = null;
    for (const [b, cm, w] of at.heights || []) { if (b <= this.bashoId) { if (cm) h = cm; if (w) kg = w; } else break; }
    /* Research probe only: current listed size when no dated measurement exists (leaks later size). */
    if (this.probeSize) { if (h == null) h = at.height || null; if (kg == null) kg = at.weight || null; }
    const st = this.style.get(id) || [0, 0, 0, 0];
    const pv = this.prev.get(id);
    let since = null;
    if (/^\d{6}$/.test(String(at.debut || ''))) since = ((+this.bashoId.slice(0, 4)) - (+at.debut.slice(0, 4))) * 6 + ((+this.bashoId.slice(4)) - (+at.debut.slice(4))) / 2;
    return {
      pos: position(r.rank), rs: rankScore(r.rank),
      r8: this.res[0].get(id) || 0, r16: this.res[1].get(id) || 0, r32: this.res[2].get(id) || 0, elo: this.pure.get(id), n: this.n.get(id) || 0,
      w: s.w, l: s.l, ab: s.a, f: s.w - s.l - s.a, decided, must: !decided && need > 0 && need >= left ? 1 : 0, needFrac: decided || !left ? 0 : need / left,
      age, h, kg, bmi: h && kg ? kg / (h / 100) ** 2 : null, since, maku: this.maku.get(id) || 0, foreign: foreignBorn(at.shusshin),
      push: (st[1] + 1) / (st[0] + 3), belt: (st[2] + 1) / (st[0] + 3), pull: (st[3] + 0.5) / (st[0] + 3), styleN: st[0],
      pw: pv ? pv[0] : null, pl: pv ? pv[1] : null, pa: pv ? pv[2] : null, dpos: pv && pv[3] != null && position(r.rank) != null ? position(r.rank) - pv[3] : null
    };
  }

  /* Features for one bout, side a = the higher-ranked man. */
  features(idA, idB, day) {
    const A = this.rows.get(Number(idA)), B = this.rows.get(Number(idB));
    if (!A || !B) return null;
    const a = this.side(A, day), b = this.side(B, day);
    const k = Math.min(A.rikishiID, B.rikishiID) + ':' + Math.max(A.rikishiID, B.rikishiID);
    const hh = this.h2h.get(k) || [0, 0, 0]; /* [wins of the smaller id, wins of the larger, last winner id] */
    const ha = A.rikishiID < B.rikishiID ? hh[0] : hh[1], hb = A.rikishiID < B.rikishiID ? hh[1] : hh[0];
    return { a, b, day, divA: A.div, divB: B.div, h2hA: ha, h2hB: hb, lastMet: hh[2] === A.rikishiID ? 1 : hh[2] === B.rikishiID ? -1 : 0 };
  }

  /* Fought bouts of one day, once each: [{ w, l, kimarite }]. */
  dayBouts(day) {
    const out = [];
    for (const r of this.rows.values()) {
      const b = (r.record || [])[day - 1];
      if (!b || b.result !== 'win' || !this.rows.has(Number(b.opponentID))) continue;
      out.push({ w: r, l: this.rows.get(Number(b.opponentID)), kimarite: b.kimarite || '' });
    }
    return out;
  }

  /* Update after a day's bouts. */
  updateDay(bouts) {
    for (const { w, l, kimarite } of bouts) {
      const W = w.rikishiID, L = l.rikishiID, d = rankScore(w.rank) - rankScore(l.rank);
      ELO.residual.forEach((K, i) => {
        const m = this.res[i], e = sig(ELO.rankWeight * d + ((m.get(W) || 0) - (m.get(L) || 0)) * LN10 / 400);
        m.set(W, (m.get(W) || 0) + K * (1 - e)); m.set(L, (m.get(L) || 0) - K * (1 - e));
      });
      const pe = sig(((this.pure.get(W) || 0) - (this.pure.get(L) || 0)) * LN10 / 400);
      const kOf = id => ELO.Kmin + ELO.Kx * Math.exp(-(this.n.get(id) || 0) / ELO.tau);
      const kw = kOf(W), kl = kOf(L);
      this.pure.set(W, (this.pure.get(W) || 0) + kw * (1 - pe)); this.pure.set(L, (this.pure.get(L) || 0) - kl * (1 - pe));
      this.n.set(W, (this.n.get(W) || 0) + 1); this.n.set(L, (this.n.get(L) || 0) + 1);
      const k = Math.min(W, L) + ':' + Math.max(W, L), hh = this.h2h.get(k) || [0, 0, 0];
      hh[W < L ? 0 : 1]++; hh[2] = W; this.h2h.set(k, hh);
      const st = this.style.get(W) || [0, 0, 0, 0];
      st[0]++; if (PUSH.has(kimarite)) st[1]++; else if (BELT.has(kimarite)) st[2]++; else if (PULL.has(kimarite)) st[3]++;
      this.style.set(W, st);
    }
  }

  endBasho() {
    for (const r of this.rows.values()) {
      const s = this.sofar(r, 16);
      this.prev.set(r.rikishiID, [s.w, s.l, s.a, position(r.rank)]);
      if (r.div === 'Makuuchi') this.maku.set(r.rikishiID, (this.maku.get(r.rikishiID) || 0) + 1);
    }
    /* A man missing from this basho's three divisions has no "previous basho" next time. */
    for (const id of [...this.prev.keys()]) if (!this.rows.has(id)) this.prev.delete(id);
    this.lastBasho = this.bashoId;
  }
}

/* Attributes from the Sumo API wrestler list (records with measurementHistory). */
export function attrsFrom(records) {
  const m = new Map();
  for (const r of records || []) {
    const hist = (r.measurementHistory || []).map(x => [String(x.bashoId), x.height || null, x.weight || null]).sort((a, b) => a[0].localeCompare(b[0]));
    if (m.has(Number(r.id))) continue;
    m.set(Number(r.id), { height: r.height || null, weight: r.weight || null, birthDate: r.birthDate && !/^0001/.test(r.birthDate) ? r.birthDate : null, shusshin: r.shusshin || '', debut: r.debut || '', heights: hist });
  }
  return m;
}
