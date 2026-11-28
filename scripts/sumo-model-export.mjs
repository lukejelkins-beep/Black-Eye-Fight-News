#!/usr/bin/env node
/* Research export: replay the collected banzuke (scripts/sumo-collect-model-data.mjs cache) with the
   predictor's feature engine and write one CSV row per fought bout, side a = higher-ranked man,
   with what was known that morning. Used to choose and test the model; not published.
     node scripts/sumo-model-export.mjs --cache <dir> --out <file.csv> */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { SumoReplay, attrsFrom } from '../assets/sumo-model-features.mjs';
import { position } from '../assets/sumo-home-data.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const cache = arg('cache'), out = arg('out');
const attrs = attrsFrom(JSON.parse(readFileSync(cache + '/rikishis.json', 'utf8')).records);
const files = readdirSync(cache + '/banzuke').filter(f => /^\d{6}-\w+\.json$/.test(f));
const ids = [...new Set(files.map(f => f.slice(0, 6)))].sort();
const R = new SumoReplay(attrs);
const SIDE = ['pos', 'rs', 'r8', 'r16', 'r32', 'elo', 'n', 'w', 'l', 'ab', 'f', 'decided', 'must', 'needFrac', 'age', 'h', 'kg', 'bmi', 'since', 'maku', 'foreign', 'push', 'belt', 'pull', 'styleN', 'pw', 'pl', 'pa', 'dpos'];
const head = ['basho', 'day', 'divA', 'divB', 'idA', 'idB', 'h2hA', 'h2hB', 'lastMet', ...SIDE.map(k => 'a_' + k), ...SIDE.map(k => 'b_' + k), 'y'];
const lines = [head.join(',')];
const v = x => x == null || Number.isNaN(x) ? '' : typeof x === 'number' ? (Number.isInteger(x) ? x : x.toFixed(4)) : x;
for (const id of ids) {
  const rows = [];
  for (const div of ['Makuuchi', 'Juryo', 'Makushita']) {
    const p = `${cache}/banzuke/${id}-${div}.json`;
    if (!existsSync(p)) continue;
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    rows.push(...(raw.east || []), ...(raw.west || []));
  }
  if (!rows.length) continue;
  R.startBasho(id, rows);
  for (let day = 1; day <= 15; day++) {
    const bouts = R.dayBouts(day);
    for (const bt of bouts) {
      const [a, b] = position(bt.w.rank) <= position(bt.l.rank) ? [bt.w, bt.l] : [bt.l, bt.w];
      const x = R.features(a.rikishiID, b.rikishiID, day);
      lines.push([id, day, x.divA, x.divB, a.rikishiID, b.rikishiID, x.h2hA, x.h2hB, x.lastMet, ...SIDE.map(k => v(x.a[k])), ...SIDE.map(k => v(x.b[k])), a === bt.w ? 1 : 0].join(','));
    }
    R.updateDay(bouts);
  }
  R.endBasho();
}
writeFileSync(out, lines.join('\n') + '\n');
console.log('rows', lines.length - 1, 'basho', ids.length);
