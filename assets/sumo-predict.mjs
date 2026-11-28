/* BEFN Sumo bout predictor: a win probability for one bout, from three things known before it:
   1. rank: where each man sits on the banzuke (a log scale of position, so Y1 v O1 is a bigger
      gap than M14 v M15);
   2. rating: a running "better or worse than his rank" score (an Elo residual), updated after
      every fought bout in the saved archive (Makuuchi, Juryo, Makushita);
   3. form: wins minus losses so far in this basho.
   The weights are fitted offline by scripts/sumo-build-predictor.mjs on the older basho and scored
   on the newer ones (data/sumo/predictor.json). Pure functions, no DOM; the browser and the build
   script run the same code. Fusen bouts and absences are never rated. */
import { position, rows } from './sumo-home-data.mjs';

const LN10 = Math.log(10);
export const sigmoid = x => 1 / (1 + Math.exp(-x));
/* Higher is better; 0 at Yokozuna 1 East. Unknown ranks are treated as low Makushita. */
export const rankScore = rank => { const p = position(rank); return -Math.log(1 + (p ?? 260) / 8); };

/* Every fought bout of one saved basho, once each (from the winner's record), by day. The opponent
   must be in the file too, so his rank is known. */
export function boutsOf(file) {
  const all = rows(file?.banzuke ? asBz(file.banzuke) : {});
  const byId = new Map(all.map(r => [r.rikishiID, r]));
  const out = [];
  for (const r of all) (r.record || []).forEach((b, i) => {
    if (!b || b.result !== 'win') return;
    const o = byId.get(b.opponentID);
    if (!o) return;
    out.push({ day: i + 1, winner: r, loser: o, kimarite: b.kimarite || '' });
  });
  return out.sort((a, b) => a.day - b.day || position(a.winner.rank) - position(b.winner.rank));
}
/* Archive files keep { Makuuchi: { rows } }; live snapshots keep { Makuuchi: { data: { east, west } } }. */
function asBz(bz) {
  return Object.fromEntries(Object.entries(bz).map(([k, v]) => [k, v && Array.isArray(v.rows) ? { data: { east: v.rows, west: [] } } : v]));
}

/* Wins minus losses for one wrestler through `day` (fought bouts and fusen both count, as on the banzuke). */
export function formThrough(r, day) {
  let f = 0;
  for (const b of (r?.record || []).slice(0, Math.max(0, day))) { if (!b) continue; if (/win/.test(b.result)) f++; else if (/loss/.test(b.result)) f--; }
  return f;
}

export function features(a, b, ratings, day) {
  return {
    rank: rankScore(a.rank) - rankScore(b.rank),
    rating: ((ratings.get(a.rikishiID) || 0) - (ratings.get(b.rikishiID) || 0)) * LN10 / 400,
    form: (formThrough(a, day - 1) - formThrough(b, day - 1)) / 5
  };
}
export const logit = (x, c) => c.rank * x.rank + c.rating * x.rating + c.form * x.form;
export const probability = (x, model) => sigmoid(logit(x, model.coef));

/* Replay one basho: predict each day's bouts with what was known that morning, then update the
   ratings. `ratings` (Map id -> residual) is changed in place. Returns the predictions. */
export function replayBasho(file, ratings, model, { onlyThroughDay = 15 } = {}) {
  const { K, rankWeight } = model.elo;
  const preds = [];
  const bouts = boutsOf(file);
  for (let day = 1; day <= 15; day++) {
    const today = bouts.filter(b => b.day === day);
    if (!today.length) continue;
    /* Predict all of the day first (side a = the higher-ranked man), then update. */
    for (const bt of today) {
      const [a, b] = position(bt.winner.rank) <= position(bt.loser.rank) ? [bt.winner, bt.loser] : [bt.loser, bt.winner];
      const x = features(a, b, ratings, day);
      preds.push({ bashoId: file.bashoId, day, a, b, aWon: a === bt.winner, x, p: probability(x, model), kimarite: bt.kimarite });
    }
    if (day > onlyThroughDay) continue;
    for (const bt of today) {
      const w = bt.winner.rikishiID, l = bt.loser.rikishiID;
      const e = sigmoid(rankWeight * (rankScore(bt.winner.rank) - rankScore(bt.loser.rank)) + ((ratings.get(w) || 0) - (ratings.get(l) || 0)) * LN10 / 400);
      ratings.set(w, (ratings.get(w) || 0) + K * (1 - e));
      ratings.set(l, (ratings.get(l) || 0) - K * (1 - e));
    }
  }
  return preds;
}

/* Ratings at the start of a saved basho, from predictor.json (ids as strings there). */
export const ratingsMap = obj => new Map(Object.entries(obj || {}).map(([k, v]) => [Number(k), v]));

/* Predictions for one basho in the browser: start from the saved pre-basho ratings and replay. */
export function bashoPredictions(file, model) {
  /* The basho after the last saved one (live mode) starts from the latest ratings. */
  const saved = Object.keys(model.preBasho || {}).sort();
  const start = model.preBasho?.[file.bashoId] || (saved.length && String(file.bashoId) > saved[saved.length - 1] ? model.ratings : null);
  if (!start) return null;
  return replayBasho(file, ratingsMap(start), model);
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

/* A head-to-head pick for two current wrestlers (predictor page). `form` is wins minus losses so far. */
export function pick(a, b, model, { formA = 0, formB = 0 } = {}) {
  const ratings = ratingsMap(model.ratings);
  const x = {
    rank: rankScore(a.rank) - rankScore(b.rank),
    rating: ((ratings.get(Number(a.id)) || 0) - (ratings.get(Number(b.id)) || 0)) * LN10 / 400,
    form: (formA - formB) / 5
  };
  const c = model.coef;
  return { p: sigmoid(logit(x, c)), parts: { rank: c.rank * x.rank, rating: c.rating * x.rating, form: c.form * x.form }, ratingA: ratings.get(Number(a.id)) || 0, ratingB: ratings.get(Number(b.id)) || 0 };
}

/* One number per wrestler for a power table: the model's logit against a notional Yokozuna 1 East
   with a zero rating. Only differences between wrestlers mean anything. */
export const strength = (rank, rating, model) => model.coef.rank * rankScore(rank) + model.coef.rating * (rating || 0) * LN10 / 400;
