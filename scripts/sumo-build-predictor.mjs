#!/usr/bin/env node
/* Fit and score the Sumo bout predictor (assets/sumo-predict.mjs) on the saved basho archive and
   write data/sumo/predictor.json. Offline: reads only data/sumo/basho-archive/*.json, no network.

   Method (walk-forward):
   - The first saved basho only warms the ratings up; it is never scored.
   - Elo settings (K, rank weight) and the three weights are fitted on the training basho.
   - The newest TEST_COUNT basho are scored with those weights, bouts predicted the morning of
     the day they were fought. That test score is what the site quotes.
   - Baselines on the same test bouts: "higher rank wins" and a rank-only logistic model.
   - The weights shipped for live use are then refitted on every scored basho (same Elo settings).

   Usage: node scripts/sumo-build-predictor.mjs [--check]   (--check: print, do not write) */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { replayBasho, sigmoid } from '../assets/sumo-predict.mjs';
import { isMakuuchi } from '../assets/sumo-home-data.mjs';

const ROOT = new URL('../', import.meta.url);
const DIR = new URL('data/sumo/basho-archive/', ROOT);
const OUT = new URL('data/sumo/predictor.json', ROOT);
const TEST_COUNT = 4;
const ids = readdirSync(DIR).filter(f => /^\d{6}\.json$/.test(f)).map(f => f.slice(0, 6)).sort();
const files = ids.map(id => JSON.parse(readFileSync(new URL(id + '.json', DIR), 'utf8')));

const FEATS = ['rank', 'rating', 'form'];
/* Logistic regression without intercept (side a is always the higher-ranked man; the rank term
   carries the edge). Newton's method with a little L2 to stay stable. */
function fit(rows, feats = FEATS, l2 = 0.5) {
  const n = feats.length;
  let w = new Array(n).fill(0);
  for (let it = 0; it < 50; it++) {
    const g = new Array(n).fill(0), H = Array.from({ length: n }, () => new Array(n).fill(0));
    for (const r of rows) {
      const x = feats.map(f => r.x[f]);
      const p = sigmoid(x.reduce((s, v, i) => s + v * w[i], 0));
      for (let i = 0; i < n; i++) { g[i] += (p - r.y) * x[i]; for (let j = 0; j < n; j++) H[i][j] += p * (1 - p) * x[i] * x[j]; }
    }
    for (let i = 0; i < n; i++) { g[i] += l2 * w[i]; H[i][i] += l2; }
    const step = solve(H, g);
    w = w.map((v, i) => v - step[i]);
    if (Math.max(...step.map(Math.abs)) < 1e-9) break;
  }
  return Object.fromEntries(FEATS.map(f => [f, feats.includes(f) ? w[feats.indexOf(f)] : 0]));
}
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
const prob = (r, coef) => sigmoid(FEATS.reduce((s, f) => s + coef[f] * r.x[f], 0));
function score(rows, pf) {
  let ll = 0, br = 0, hit = 0;
  for (const r of rows) { const p = Math.min(1 - 1e-9, Math.max(1e-9, pf(r))); ll -= r.y ? Math.log(p) : Math.log(1 - p); br += (p - r.y) ** 2; hit += (p >= 0.5) === !!r.y ? 1 : 0; }
  return { bouts: rows.length, logLoss: ll / rows.length, brier: br / rows.length, accuracy: hit / rows.length };
}

/* One full replay with given Elo settings; returns every prediction with the basho index and the
   ratings at the start of each basho and at the end. */
function replay(elo) {
  const ratings = new Map(), preBasho = {}, out = [];
  files.forEach((f, i) => {
    preBasho[f.bashoId] = Object.fromEntries([...ratings].map(([k, v]) => [k, Math.round(v * 10) / 10]));
    for (const q of replayBasho(f, ratings, { elo, coef: { rank: 0, rating: 0, form: 0 } })) out.push({ i, day: q.day, makuuchi: isMakuuchi(q.a.rank) && isMakuuchi(q.b.rank), x: q.x, y: q.aWon ? 1 : 0 });
  });
  return { out, preBasho, ratings };
}

const trainIdx = i => i >= 1 && i < files.length - TEST_COUNT, testIdx = i => i >= files.length - TEST_COUNT;
let best = null;
for (const K of [8, 12, 16, 20, 24, 32]) for (const rankWeight of [0, 0.25, 0.5, 0.75, 1, 1.5]) {
  const { out } = replay({ K, rankWeight });
  const train = out.filter(r => trainIdx(r.i));
  const coef = fit(train);
  const s = score(train, r => prob(r, coef));
  if (!best || s.logLoss < best.s.logLoss) best = { K, rankWeight, coef, s };
}
const elo = { K: best.K, rankWeight: best.rankWeight };
const { out, preBasho, ratings } = replay(elo);
const train = out.filter(r => trainIdx(r.i)), test = out.filter(r => testIdx(r.i));
const rankCoef = fit(train, ['rank']);
const noForm = fit(train, ['rank', 'rating']);
const higher = r => r.x.rank > 0 ? 1 : r.x.rank < 0 ? 0 : 0.5;
const sets = { all: test, makuuchi: test.filter(r => r.makuuchi) };
const testScores = Object.fromEntries(Object.entries(sets).map(([k, rows]) => [k, {
  model: score(rows, r => prob(r, best.coef)), rankOnly: score(rows, r => prob(r, rankCoef)), noForm: score(rows, r => prob(r, noForm)),
  higherRankWins: { accuracy: rows.filter(r => r.x.rank !== 0).reduce((s, r) => s + (higher(r) === r.y ? 1 : 0), 0) / rows.filter(r => r.x.rank !== 0).length }
}]));

/* Bootstrap the Brier gain over rank-only on the test bouts (by basho day, so a day's bouts move together). */
function bootstrap(rows, a, b, n = 2000) {
  const byDay = new Map();
  for (const r of rows) { const k = r.i + ':' + r.day; (byDay.get(k) || byDay.set(k, []).get(k)).push(r); }
  const keys = [...byDay.keys()];
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const diffs = [];
  for (let s = 0; s < n; s++) {
    let da = 0, cnt = 0;
    for (let k = 0; k < keys.length; k++) for (const r of byDay.get(keys[Math.floor(rnd() * keys.length)])) { da += (a(r) - r.y) ** 2 - (b(r) - r.y) ** 2; cnt++; }
    diffs.push(da / cnt);
  }
  diffs.sort((x, y) => x - y);
  return { low: diffs[Math.floor(n * 0.025)], high: diffs[Math.floor(n * 0.975)] };
}
const gain = bootstrap(test, r => prob(r, best.coef), r => prob(r, rankCoef));

/* Calibration of the test predictions in five bands (favourite's chance). */
const bands = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.01]].map(([lo, hi]) => {
  const inBand = test.map(r => { const p = prob(r, best.coef); return p >= 0.5 ? { p, won: r.y } : { p: 1 - p, won: 1 - r.y }; }).filter(x => x.p >= lo && x.p < hi);
  return { from: lo, to: Math.min(hi, 1), bouts: inBand.length, expected: inBand.length ? inBand.reduce((s, x) => s + x.p, 0) / inBand.length : null, actual: inBand.length ? inBand.reduce((s, x) => s + x.won, 0) / inBand.length : null };
});

const shipped = fit(out.filter(r => r.i >= 1));
const r4 = v => Math.round(v * 10000) / 10000;
const model = {
  schemaVersion: 1,
  builtFrom: { basho: ids, warmUp: ids[0], train: ids.filter((_, i) => trainIdx(i)), test: ids.filter((_, i) => testIdx(i)) },
  elo,
  coef: Object.fromEntries(Object.entries(shipped).map(([k, v]) => [k, r4(v)])),
  backtest: {
    note: 'Weights fitted on the training basho only; every test bout predicted the morning of its day.',
    coef: Object.fromEntries(Object.entries(best.coef).map(([k, v]) => [k, r4(v)])),
    test: JSON.parse(JSON.stringify(testScores, (k, v) => typeof v === 'number' ? r4(v) : v)),
    brierGainVsRankOnly: { mean: r4(testScores.all.rankOnly.brier - testScores.all.model.brier), interval95: [r4(-gain.high), r4(-gain.low)] },
    calibration: bands.map(b => ({ ...b, expected: b.expected == null ? null : r4(b.expected), actual: b.actual == null ? null : r4(b.actual) }))
  },
  preBasho,
  ratings: Object.fromEntries([...ratings].map(([k, v]) => [k, Math.round(v * 10) / 10]))
};
/* The basho after the last saved one starts from `ratings` (see bashoPredictions). */
console.log(JSON.stringify({ elo, coef: model.coef, backtest: { ...model.backtest } }, null, 1));
if (!process.argv.includes('--check')) { writeFileSync(OUT, JSON.stringify(model) + '\n'); console.log('wrote', OUT.pathname); }
