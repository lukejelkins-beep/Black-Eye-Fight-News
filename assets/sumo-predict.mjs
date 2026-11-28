/* BEFN Sumo bout predictor (v2, 28 Nov 2026). A calibrated logistic model over what is known the
   morning of a bout, worked out by the feature engine in sumo-model-features.mjs:
   rank; two ratings (an Elo that starts from rank and learns fast for newcomers, and a rating
   against rank); this basho's form, absences and kachi-koshi pressure; age, career length and
   time in Makuuchi; head-to-head; the last basho's record, absences and promotion or demotion;
   fighting style from past winning techniques; birthplace.
   Weights are fitted by scripts/sumo-build-model.mjs on 2003-2024 and tested on 2025-2026
   (data/sumo/predictor.json, method in docs/sumo-predictor.md). Pure functions, no DOM.
   Side a is always the higher-ranked man. Fusen bouts and absences are never rated. */
import { position, rows } from './sumo-home-data.mjs';
import { SumoReplay } from './sumo-model-features.mjs';

export const sigmoid = x => 1 / (1 + Math.exp(-x));
const LN = Math.log(10) / 400;
export { rankScore } from './sumo-model-features.mjs';

/* The model's inputs, in order. Missing values count as 0 (no difference). */
export const FEATURES = ['d_rs', 'd_elo', 'd_r8', 'd_r16', 'd_logn', 'd_f', 'd_ab', 'bubbleA', 'bubbleB', 'd_needFrac', 'd_decided', 'd_age', 'd_age2', 'd_since', 'd_maku',
  'h2h', 'lastMet', 'a_hasPrev', 'a_prevNet', 'a_prevAbs', 'a_dpos', 'b_hasPrev', 'b_prevNet', 'b_prevAbs', 'b_dpos', 'd_push', 'd_belt', 'd_pull', 'pushXbelt', 'd_foreign', 'cross', 'a_rs', 'b_rs', 'day'];
/* How the explanation groups them. */
export const GROUPS = {
  rank: ['d_rs', 'a_rs', 'b_rs', 'cross'],
  rating: ['d_elo', 'd_r8', 'd_r16', 'd_logn'],
  basho: ['d_f', 'd_ab', 'bubbleA', 'bubbleB', 'd_needFrac', 'd_decided', 'day'],
  career: ['d_age', 'd_age2', 'd_since', 'd_maku'],
  h2h: ['h2h', 'lastMet'],
  last: ['a_hasPrev', 'a_prevNet', 'a_prevAbs', 'a_dpos', 'b_hasPrev', 'b_prevNet', 'b_prevAbs', 'b_dpos'],
  style: ['d_push', 'd_belt', 'd_pull', 'pushXbelt', 'd_foreign']
};

const num = v => (v == null || Number.isNaN(v) ? null : v);
const diff = (x, y) => (num(x) == null || num(y) == null ? 0 : x - y);
/* One bout's feature engine output -> named inputs (must match the research and the fit exactly). */
export function vectorize(F) {
  const a = F.a, b = F.b, out = {};
  out.d_rs = a.rs - b.rs;
  out.d_elo = diff(a.elo, b.elo) * LN; out.d_r8 = diff(a.r8, b.r8) * LN; out.d_r16 = diff(a.r16, b.r16) * LN;
  out.d_logn = Math.log1p(a.n) - Math.log1p(b.n);
  out.d_f = (a.f - b.f) / 5; out.d_ab = a.ab - b.ab;
  out.bubbleA = a.must * b.decided; out.bubbleB = b.must * a.decided;
  out.d_needFrac = a.needFrac - b.needFrac; out.d_decided = a.decided - b.decided;
  out.d_age = diff(a.age, b.age) / 5;
  out.d_age2 = num(a.age) == null || num(b.age) == null ? 0 : ((a.age - 28) ** 2 - (b.age - 28) ** 2) / 25;
  out.d_since = diff(a.since, b.since) / 30;
  out.d_maku = Math.log1p(a.maku) - Math.log1p(b.maku);
  out.h2h = (F.h2hA - F.h2hB) / (F.h2hA + F.h2hB + 4); out.lastMet = F.lastMet;
  for (const [s, x] of [['a', a], ['b', b]]) {
    const has = num(x.pw) != null;
    out[s + '_hasPrev'] = has ? 1 : 0;
    out[s + '_prevNet'] = has ? (x.pw - x.pl - x.pa) / 7 : 0;
    out[s + '_prevAbs'] = has ? x.pa / 15 : 0;
    out[s + '_dpos'] = num(x.dpos) == null ? 0 : x.dpos / 10;
  }
  out.d_push = a.push - b.push; out.d_belt = a.belt - b.belt; out.d_pull = a.pull - b.pull;
  out.pushXbelt = a.push * b.belt - b.push * a.belt;
  out.d_foreign = diff(a.foreign, b.foreign);
  out.cross = F.divA !== F.divB ? 1 : 0; out.a_rs = a.rs; out.b_rs = b.rs; out.day = F.day / 15;
  return out;
}
export const logitOf = (v, model) => model.intercept + FEATURES.reduce((s, k, i) => s + model.weights[i] * (v[k] || 0), 0);
export const probabilityOf = (v, model) => sigmoid((model.temperature || 1) * logitOf(v, model));

/* Each group's push on the chance, in logit units after calibration (positive favours side a). */
export function explain(v, model) {
  const T = model.temperature || 1, w = Object.fromEntries(FEATURES.map((k, i) => [k, model.weights[i]]));
  return Object.fromEntries(Object.entries(GROUPS).map(([g, ks]) => [g, T * ks.reduce((s, k) => s + w[k] * (v[k] || 0), 0)]));
}

/* Snapshot rows for a replay: archive files keep { Makuuchi: { rows } }, live snapshots { data: { east, west } }. */
export function bashoRows(file) {
  const bz = file?.banzuke || {};
  return Object.values(bz).flatMap(v => v && Array.isArray(v.rows) ? v.rows : v?.data ? [...(v.data.east || []), ...(v.data.west || [])] : []);
}
/* Every fought bout of one basho, once each (from the winner's record), with both rows. */
export function boutsOf(file) {
  const all = rows(file?.banzuke ? Object.fromEntries(Object.entries(file.banzuke).map(([k, v]) => [k, v && Array.isArray(v.rows) ? { data: { east: v.rows, west: [] } } : v])) : {});
  const byId = new Map(all.map(r => [r.rikishiID, r]));
  const out = [];
  for (const r of all) (r.record || []).forEach((b, i) => {
    if (!b || b.result !== 'win') return;
    const o = byId.get(b.opponentID);
    if (o) out.push({ day: i + 1, winner: r, loser: o, kimarite: b.kimarite || '' });
  });
  return out.sort((a, b) => a.day - b.day || position(a.winner.rank) - position(b.winner.rank));
}

const attrsOf = model => new Map(Object.entries(model.state?.attrs || {}).map(([k, v]) => [Number(k), v]));
/* A replay positioned at the start of `details`' basho (it must be the basho after model.state.lastBasho). */
export function replayFor(details, model) {
  if (!model?.state) return null;
  const R = new SumoReplay(attrsOf(model), model.state);
  R.startBasho(details.bashoId, bashoRows(details));
  return R;
}

/* Predictions for every fought bout of one basho: [{ day, a, b, aWon, p, kimarite }].
   A saved basho uses the chances saved when the model was built; the basho after the last saved one
   (live) is replayed from the saved state, day by day, with only what was known each morning. */
export function bashoPredictions(details, model) {
  if (!model) return null;
  const saved = model.archive?.[details.bashoId];
  const bouts = boutsOf(details);
  const side = bt => position(bt.winner.rank) <= position(bt.loser.rank) ? [bt.winner, bt.loser] : [bt.loser, bt.winner];
  if (saved) return bouts.map(bt => { const [a, b] = side(bt); const p = saved[bt.day + ':' + a.rikishiID + ':' + b.rikishiID]; return p == null ? null : { day: bt.day, a, b, aWon: a === bt.winner, p, kimarite: bt.kimarite }; }).filter(Boolean);
  if (!model.state || String(details.bashoId) <= String(model.state.lastBasho)) return null;
  const R = replayFor(details, model), out = [];
  for (let day = 1; day <= 15; day++) {
    const today = R.dayBouts(day);
    for (const { w, l, kimarite } of today) {
      const [a, b] = position(w.rank) <= position(l.rank) ? [w, l] : [l, w];
      const v = vectorize(R.features(a.rikishiID, b.rikishiID, day));
      out.push({ day, a, b, aWon: a === w, p: probabilityOf(v, model), kimarite });
    }
    R.updateDay(today);
  }
  return out;
}

/* Expected wins: the sum of the pre-bout chances of every rated bout a wrestler fought. */
export function expectedWins(preds, { makuuchiOnly = true, isMakuuchi } = {}) {
  const by = new Map();
  const add = (r, p, won) => {
    if (makuuchiOnly && isMakuuchi && !isMakuuchi(r.rank)) return;
    const x = by.get(r.rikishiID) || { id: r.rikishiID, name: r.shikonaEn, rank: r.rank, bouts: 0, wins: 0, expected: 0 };
    x.bouts++; x.wins += won ? 1 : 0; x.expected += p; by.set(r.rikishiID, x);
  };
  for (const q of preds) { add(q.a, q.p, q.aWon); add(q.b, 1 - q.p, !q.aWon); }
  return [...by.values()].map(x => ({ ...x, delta: x.wins - x.expected }));
}

/* A replay positioned for "the next bout": during a basho, the morning after the last completed day;
   otherwise the next basho's day 1 on today's ranks (`ranks`: Map id -> rank). */
export function nextMorning(model, { details, completed = 0, ranks } = {}) {
  if (!model?.state) return null;
  const live = details && String(details.bashoId) > String(model.state.lastBasho);
  if (live) {
    const R = replayFor(details, model);
    for (let d = 1; d <= completed; d++) R.updateDay(R.dayBouts(d));
    return { R, day: Math.min(15, completed + 1) };
  }
  const R = new SumoReplay(attrsOf(model), model.state);
  const last = String(model.state.lastBasho);
  let y = +last.slice(0, 4), m = +last.slice(4) + 2; if (m > 11) { m = 1; y++; }
  R.startBasho(String(y) + String(m).padStart(2, '0'), [...(ranks || new Map())].map(([id, rank]) => ({ rikishiID: Number(id), rank, record: [] })));
  return { R, day: 1 };
}

/* One pairing at that morning: { p (a = first argument), parts, v }. Either order. */
export function pickWith(M, model, idA, idB) {
  if (!M) return null;
  const A = M.R.rows.get(Number(idA)), B = M.R.rows.get(Number(idB));
  if (!A || !B) return null;
  const flip = position(A.rank) > position(B.rank);
  const [hi, lo] = flip ? [B, A] : [A, B];
  const F = M.R.features(hi.rikishiID, lo.rikishiID, M.day), v = vectorize(F);
  const p = probabilityOf(v, model), parts = explain(v, model);
  /* `mine`/`theirs`: the feature engine's view of the first and second argument (for the explanation). */
  return { p: flip ? 1 - p : p, parts: flip ? Object.fromEntries(Object.entries(parts).map(([k, x]) => [k, -x])) : parts, v,
    mine: flip ? F.b : F.a, theirs: flip ? F.a : F.b, met: { mine: flip ? F.h2hB : F.h2hA, theirs: flip ? F.h2hA : F.h2hB } };
}

/* Power: each man's average chance against every other man in the list, that morning. */
export function power(M, model, ids) {
  return ids.map(id => {
    let s = 0, n = 0;
    for (const o of ids) if (o !== id) { const q = pickWith(M, model, id, o); if (q) { s += q.p; n++; } }
    return { id, power: n ? s / n : null };
  });
}
