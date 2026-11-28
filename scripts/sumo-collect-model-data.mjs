#!/usr/bin/env node
/**
 * BEFN Sumo predictor research data: every Makuuchi, Juryo and Makushita banzuke (with each
 * wrestler's bout-by-bout record) from --from to --to, and the full wrestler list with birth date,
 * stable, birthplace, debut and height/weight history. Raw responses go to a local cache folder
 * (not committed, not published); scripts/sumo-build-model-dataset.mjs turns them into the compact
 * training file. Owner permission for collection: docs/design/DECISIONS.md, 24 Nov 2026.
 * Paced: one request at a time, --pause ms apart (default 1000). Cached files are not fetched again.
 *
 *   node scripts/sumo-collect-model-data.mjs --from 200001 --to 202611 --cache <dir>
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createSumoClient } from './sumo-api-source.mjs';
import { bashoRange } from './sumo-collect-basho-archive.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const from = arg('from', '200001'), to = arg('to', '202611'), cache = arg('cache'), pause = Number(arg('pause', '1000'));
if (!cache) throw new Error('--cache <dir> is required (a local folder outside the published site)');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let client = createSumoClient({ maxCalls: 90 });
const call = async fn => { if (client.callCount >= 90) client = createSumoClient({ maxCalls: 90 }); const out = await fn(client); await sleep(pause); return out; };

await mkdir(cache + '/banzuke', { recursive: true });
let fetched = 0, kept = 0, empty = 0;
for (const id of bashoRange(from, to)) for (const div of ['Makuuchi', 'Juryo', 'Makushita']) {
  const path = `${cache}/banzuke/${id}-${div}.json`;
  if (existsSync(path)) { kept++; continue; }
  let raw;
  try { raw = await call(c => c.banzuke(id, div)); }
  catch (e) { console.warn(id, div, String(e.message).slice(0, 120)); await sleep(5000); continue; }
  const n = (raw.east || []).length + (raw.west || []).length;
  if (!n) empty++;
  await writeFile(path, JSON.stringify(raw));
  fetched++;
  if (fetched % 30 === 0) console.log('banzuke fetched', fetched, 'at', id);
}
const rpath = cache + '/rikishis.json';
if (!existsSync(rpath)) {
  const all = [];
  let total = null;
  /* The API may return fewer than the limit asked for (100 per page after the first): advance by what came back. */
  for (let skip = 0; total === null || skip < total;) {
    /* measurements=true makes the API ignore skip, so the plain list is paged (height and weight are the current listed values). */
    const page = await call(c => c.listRikishi({ limit: 1000, skip, intai: true }));
    total = page.total; all.push(...page.records);
    if (!page.records.length) break;
    skip += page.records.length;
  }
  if (all.length < total) throw new Error('Wrestler list incomplete: ' + all.length + ' of ' + total);
  await writeFile(rpath, JSON.stringify({ total, records: all }));
  console.log('rikishis', all.length, 'of', total);
}
console.log(JSON.stringify({ fetched, kept, empty }));
