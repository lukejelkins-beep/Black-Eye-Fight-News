#!/usr/bin/env node
/* Build the Sumo bout predictor v2 (assets/sumo-predict.mjs) and write data/sumo/predictor.json
   (read by the site) and data/sumo/predictor-state.json (the full replay state, for updates).

   Full refit (offline, needs the research cache from scripts/sumo-collect-model-data.mjs):
     node scripts/sumo-build-model.mjs --cache <dir>
   - Replays every saved Makuuchi/Juryo/Makushita basho from 2000 (cache, plus any newer file in
     data/sumo/basho-archive), recording each bout's inputs as known that morning. 2000-2002 only
     warm the ratings up.
   - Fits an L2 logistic model on 2003 to T-3, picks the penalty on T-2 and T-1, then a calibration
     slope on T-2 and T-1 that may soften but never sharpen the chances. Refits on 2003 to T-1 and
     scores T onwards against the v1 method (rank, rating against rank, form) on the same bouts.
     T is --test-from (default 2025: train 2003-2022, tune 2023-2024, test 2025-2026).
   - --gate: exit 2 unless the refit beats v1 on the test bouts (interval of the all-bout gain above
     zero, and a positive Makuuchi gain). The twice-yearly refit job uses it.
   - The weights the site uses are refitted on every bout from 2003 with the same penalty and slope.
   - Chances saved for the basho archive come from the 2003 to T-1 fit, so the test years are out of sample.

   Update (no cache, no network; the daily release watch runs this after saving a new basho):
     node scripts/sumo-build-model.mjs --update
   Rolls the saved state forward through any archive basho newer than it, saves their chances with
   the current weights, and refreshes the site's state. Weights are not refitted. */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { SumoReplay, attrsFrom } from '../assets/sumo-model-features.mjs';
import { FEATURES, vectorize, sigmoid } from '../assets/sumo-predict.mjs';
import { position, isMakuuchi } from '../assets/sumo-home-data.mjs';

const ROOT = new URL('../', import.meta.url);
const ARCH = new URL('data/sumo/basho-archive/', ROOT);
const OUT = new URL('data/sumo/predictor.json', ROOT), STATE = new URL('data/sumo/predictor-state.json', ROOT);
const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const archiveIds = readdirSync(ARCH).filter(f => /^\d{6}\.json$/.test(f)).map(f => f.slice(0, 6)).sort();
const readArchive = id => JSON.parse(readFileSync(new URL(id + '.json', ARCH), 'utf8'));
const archiveRows = f => Object.values(f.banzuke || {}).flatMap(v => v.rows || []);
const r4 = x => Math.round(x * 1e4) / 1e4;

/* Replay a list of basho [{ id, rows }]; onBout(row) gets every fought bout with its inputs. */
function replay(R, list, onBout) {
  for (const { id, rows } of list) {
    if (!rows.length) continue;
    R.startBasho(id, rows);
    for (let day = 1; day <= 15; day++) {
      const today = R.dayBouts(day);
      for (const { w, l } of today) {
        const [a, b] = position(w.rank) <= position(l.rank) ? [w, l] : [l, w];
        const F = R.features(a.rikishiID, b.rikishiID, day);
        onBout({ basho: id, day, a, b, y: a === w ? 1 : 0, v: vectorize(F), maku: isMakuuchi(a.rank) && isMakuuchi(b.rank), juryo: /^Juryo /.test(a.rank) && /^Juryo /.test(b.rank) });
      }
      R.updateDay(today);
    }
    R.endBasho();
  }
}

/* L2 logistic regression on standardised inputs, Newton's method; objective as scikit-learn's
   (0.5|w|^2 + C * sum of log loss), intercept unpenalised. Returns weights on the raw inputs. */
function fitLogistic(X, y, C, keys = FEATURES) {
  const n = X.length, k = keys.length, mean = new Array(k).fill(0), sd = new Array(k).fill(0);
  for (const x of X) keys.forEach((f, j) => { mean[j] += x[f] || 0; });
  mean.forEach((_, j) => { mean[j] /= n; });
  for (const x of X) keys.forEach((f, j) => { sd[j] += ((x[f] || 0) - mean[j]) ** 2; });
  sd.forEach((_, j) => { sd[j] = Math.sqrt(sd[j] / n) || 1; });
  const Z = X.map(x => keys.map((f, j) => ((x[f] || 0) - mean[j]) / sd[j]));
  let w = new Array(k + 1).fill(0); /* last = intercept */
  for (let it = 0; it < 40; it++) {
    const g = new Array(k + 1).fill(0), H = Array.from({ length: k + 1 }, () => new Float64Array(k + 1));
    for (let i = 0; i < n; i++) {
      const z = Z[i]; let s = w[k]; for (let j = 0; j < k; j++) s += w[j] * z[j];
      const p = sigmoid(s), r = p - y[i], q = p * (1 - p);
      for (let j = 0; j < k; j++) { g[j] += C * r * z[j]; const qz = C * q * z[j]; const Hj = H[j]; for (let m = j; m < k; m++) Hj[m] += qz * z[m]; Hj[k] += qz; }
      g[k] += C * r; H[k][k] += C * q;
    }
    for (let j = 0; j < k; j++) { g[j] += w[j]; H[j][j] += 1; for (let m = j + 1; m <= k; m++) H[m][j] = H[j][m]; }
    const step = solve(H, g);
    w = w.map((v, j) => v - step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-7) break;
  }
  const weights = keys.map((_, j) => w[j] / sd[j]);
  const intercept = w[k] - keys.reduce((s, _, j) => s + w[j] * mean[j] / sd[j], 0);
  return { keys, weights, intercept };
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
const logit = (m, x) => m.intercept + m.keys.reduce((s, f, j) => s + m.weights[j] * (x[f] || 0), 0);
function metrics(rows, pf) {
  let br = 0, ll = 0, hit = 0;
  for (const r of rows) { const p = Math.min(1 - 1e-9, Math.max(1e-9, pf(r))); br += (p - r.y) ** 2; ll -= r.y ? Math.log(p) : Math.log(1 - p); hit += (p >= 0.5) === !!r.y ? 1 : 0; }
  return { bouts: rows.length, brier: Math.round(br / rows.length * 1e5) / 1e5, logLoss: r4(ll / rows.length), accuracy: r4(hit / rows.length) };
}
/* Bootstrap the Brier gain of pf over pg, resampling whole basho days. */
function gain(rows, pf, pg, n = 2000) {
  const by = new Map();
  for (const r of rows) { const k = r.basho + ':' + r.day; const d = (pg(r) - r.y) ** 2 - (pf(r) - r.y) ** 2; const e = by.get(k) || [0, 0]; e[0] += d; e[1]++; by.set(k, e); }
  const v = [...by.values()]; let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const out = [];
  for (let s = 0; s < n; s++) { let a = 0, c = 0; for (let i = 0; i < v.length; i++) { const e = v[Math.floor(rnd() * v.length)]; a += e[0]; c += e[1]; } out.push(a / c); }
  out.sort((x, y) => x - y);
  const mean = v.reduce((s, e) => s + e[0], 0) / v.reduce((s, e) => s + e[1], 0);
  const r5 = x => Math.round(x * 1e5) / 1e5;
  return { mean: r5(mean), interval95: [r5(out[Math.floor(n * 0.025)]), r5(out[Math.floor(n * 0.975)])] };
}
function calibration(rows, pf) {
  return [0.5, 0.6, 0.7, 0.8, 0.9].map(lo => {
    const xs = rows.map(r => { const p = pf(r); return p >= 0.5 ? [p, r.y] : [1 - p, 1 - r.y]; }).filter(([q]) => q >= lo && q < lo + 0.1 + (lo === 0.9 ? 0.01 : 0));
    return { from: lo, to: Math.round(Math.min(1, lo + 0.1) * 10) / 10, bouts: xs.length, expected: xs.length ? r4(xs.reduce((s, x) => s + x[0], 0) / xs.length) : null, actual: xs.length ? r4(xs.reduce((s, x) => s + x[1], 0) / xs.length) : null };
  });
}

/* What the browser needs: state for the men in the latest basho's Makuuchi and Juryo (and Makushita
   top 30, who can be promoted), with their attributes. The full state keeps every man in the latest basho. */
function siteState(R, attrs, latestRows) {
  const keep = new Set(latestRows.filter(r => /^(Yokozuna|Ozeki|Sekiwake|Komusubi|Maegashira|Juryo)/.test(r.rank) || /^Makushita ([1-9]|[12]\d|30) /.test(r.rank)).map(r => Number(r.rikishiID)));
  const s = R.snapshot(keep);
  s.attrs = Object.fromEntries([...keep].filter(id => attrs.has(id)).map(id => [id, attrs.get(id)]));
  return s;
}
function fullState(R, attrs, latestRows) {
  const keep = new Set(latestRows.map(r => Number(r.rikishiID)));
  const s = R.snapshot(keep);
  s.attrs = Object.fromEntries([...keep].filter(id => attrs.has(id)).map(id => [id, attrs.get(id)]));
  return s;
}

if (process.argv.includes('--update')) {
  const model = JSON.parse(readFileSync(OUT, 'utf8')), full = JSON.parse(readFileSync(STATE, 'utf8'));
  const attrs = new Map(Object.entries(full.attrs || {}).map(([k, v]) => [Number(k), v]));
  const R = new SumoReplay(attrs, full);
  const todo = archiveIds.filter(id => id > String(full.lastBasho));
  if (!todo.length) { console.log('predictor: nothing newer than', full.lastBasho); process.exit(0); }
  const m = { keys: FEATURES, weights: model.weights, intercept: model.intercept };
  let latestRows = [];
  replay(R, todo.map(id => ({ id, rows: (latestRows = archiveRows(readArchive(id))) })), r => {
    if (!r.maku && !r.juryo) return;
    (model.archive[r.basho] ||= {})[r.day + ':' + r.a.rikishiID + ':' + r.b.rikishiID] = r4(sigmoid(model.temperature * logit(m, r.v)));
  });
  model.state = siteState(R, attrs, latestRows);
  model.updatedThrough = R.lastBasho;
  writeFileSync(OUT, JSON.stringify(model) + '\n');
  writeFileSync(STATE, JSON.stringify(fullState(R, attrs, latestRows)) + '\n');
  console.log('predictor: rolled forward through', todo.join(', '));
  process.exit(0);
}

const cache = arg('cache');
if (!cache) throw new Error('Use --cache <dir> for a full refit, or --update');
const attrs = attrsFrom(JSON.parse(readFileSync(cache + '/rikishis.json', 'utf8')).records);
const cached = [...new Set(readdirSync(cache + '/banzuke').filter(f => /^\d{6}-\w+\.json$/.test(f)).map(f => f.slice(0, 6)))].sort();
const list = cached.map(id => ({ id, rows: ['Makuuchi', 'Juryo', 'Makushita'].flatMap(div => { const p = `${cache}/banzuke/${id}-${div}.json`; if (!existsSync(p)) return []; const raw = JSON.parse(readFileSync(p, 'utf8')); return [...(raw.east || []), ...(raw.west || [])]; }) }));
for (const id of archiveIds) if (!cached.includes(id)) list.push({ id, rows: archiveRows(readArchive(id)) });
list.sort((a, b) => a.id.localeCompare(b.id));
const R = new SumoReplay(attrs);
const data = [];
replay(R, list, r => { if (r.basho >= '200301') data.push(r); });
const yr = r => +r.basho.slice(0, 4);
const T = Number(arg('test-from') || 2025);
if (!(T >= 2008 && T <= 2100)) throw new Error('--test-from must be a year');
const train = data.filter(r => yr(r) <= T - 3), valid = data.filter(r => yr(r) >= T - 2 && yr(r) <= T - 1), test = data.filter(r => yr(r) >= T), early = data.filter(r => yr(r) <= T - 1);
if (!test.length) throw new Error('No bouts from ' + T + ' on to test');
const Y = a => a.map(r => r.y), V = a => a.map(r => r.v);
const brier = (rows, f) => rows.reduce((s, r) => s + (f(r) - r.y) ** 2, 0) / rows.length;
/* Penalty and calibration chosen on the two years before the test. */
let best = null;
for (const C of [0.1, 0.3, 1, 3]) { const m = fitLogistic(V(train), Y(train), C); const b = brier(valid, r => sigmoid(logit(m, r.v))); if (!best || b < best.b) best = { C, b, m }; }
let T2 = 1, tb = Infinity;
for (let t = 0.6; t <= 1.0001; t += 0.02) { const b = brier(valid, r => sigmoid(t * logit(best.m, r.v))); if (b < tb) { tb = b; T2 = r4(t); } }
const C = best.C;
const mEarly = fitLogistic(V(early), Y(early), C);
const base = ['d_rs', 'd_r16', 'd_f'];
const m0 = fitLogistic(V(early), Y(early), 1, base);
const pv2 = r => sigmoid(T2 * logit(mEarly, r.v)), pv1 = r => sigmoid(logit(m0, r.v));
const sets = { all: test, makuuchi: test.filter(r => r.maku) };
const backtest = {
  note: 'Fitted on 2003-' + (T - 1) + ' (penalty and calibration chosen on ' + (T - 2) + '-' + (T - 1) + '); every bout from ' + T + ' predicted the morning of its day. v1 = rank, rating against rank and form, fitted on the same bouts.',
  test: Object.fromEntries(Object.entries(sets).map(([k, rows]) => [k, { model: metrics(rows, pv2), v1: metrics(rows, pv1), higherRankWins: { accuracy: r4(rows.reduce((s, r) => s + (r.y === 1 ? 1 : 0), 0) / rows.length) } }])),
  gainVsV1: { all: gain(test, pv2, pv1), makuuchi: gain(sets.makuuchi, pv2, pv1) },
  byYear: Object.fromEntries([...new Set(test.map(yr))].sort().map(y => { const rows = sets.makuuchi.filter(r => yr(r) === y); return [y, { makuuchi: { bouts: rows.length, model: metrics(rows, pv2).accuracy, v1: metrics(rows, pv1).accuracy } }]; })),
  calibration: calibration(test, pv2),
  penalty: C, temperature: T2
};
const shipped = fitLogistic(V(data), Y(data), C);
const archive = {};
/* Saved chances for the archive basho: Makuuchi and Juryo bouts (the review's day view shows both). */
for (const r of data) if ((r.maku || r.juryo) && archiveIds.includes(r.basho)) (archive[r.basho] ||= {})[r.day + ':' + r.a.rikishiID + ':' + r.b.rikishiID] = r4(pv2(r));
const latestRows = list[list.length - 1].rows;
const model = {
  schemaVersion: 2, builtAt: new Date().toISOString().slice(0, 10), updatedThrough: R.lastBasho,
  data: { from: list[0].id, to: R.lastBasho, bouts: data.length, basho: list.filter(x => x.rows.length).length, train: '2003-' + (T - 3), valid: (T - 2) + '-' + (T - 1), test: T + '-' },
  features: FEATURES, weights: shipped.weights.map(w => Math.round(w * 1e6) / 1e6), intercept: Math.round(shipped.intercept * 1e6) / 1e6, temperature: T2,
  backtest, archive, state: siteState(R, attrs, latestRows)
};
writeFileSync(OUT, JSON.stringify(model) + '\n');
writeFileSync(STATE, JSON.stringify(fullState(R, attrs, latestRows)) + '\n');
const gate = backtest.gainVsV1.all.interval95[0] > 0 && backtest.gainVsV1.makuuchi.mean > 0;
console.log(JSON.stringify({ C, temperature: T2, data: model.data, gate, backtest }, null, 1));
if (process.argv.includes('--gate') && !gate) { console.error('Gate not met: the refit does not clearly beat v1 on ' + T + ' onwards.'); process.exit(2); }
