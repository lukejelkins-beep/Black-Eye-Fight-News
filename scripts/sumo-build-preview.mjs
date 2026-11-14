/**
 * One-time development snapshot builder. Does not touch production/main.
 * Uses bounded read-only calls to sumo-api.com and writes only data/sumo/.
 * The API is a secondary data source; published figures require JSA checks.
 */
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { createSumoClient, collectRoster, buildRikishiIndex, SUMO_API_BASE } from './sumo-api-source.mjs';
import { TRACKED_DIVISIONS, trackedBanzukeCohort } from '../assets/sumo-data.mjs';

const PICKS = ['Onosato', 'Wakatakakage', 'Nishikigi'];
const CURRENT_BASHO = '202611';
const capturedAt = new Date().toISOString();
const client = createSumoClient({ maxCalls: 16, timeoutMs: 15000 });
const note = 'Developer preview; third-party source; cross-check results against the Japan Sumo Association before production.';

async function collectOptional(fn, label) {
  try { return { status: 'available', data: await fn() }; }
  catch (error) {
    console.warn(label + ': ' + error.message);
    return { status: 'unavailable', data: null, reason: String(error.message).slice(0,120) };
  }
}
async function save(path, value) {
  await mkdir('data/sumo', { recursive: true });
  const tmp = path + '.tmp';
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await rename(tmp, path);
}

const all = await collectRoster(client, { pageSize: 250, maxPages: 5 });
const base = buildRikishiIndex(all, capturedAt);
const picked = PICKS
  .map(name => all.find(x => x.shikonaEn?.toLowerCase() === name.toLowerCase()))
  .filter(Boolean);
const featured = [];
for (const r of picked.slice(0, 3)) {
  const stats = await collectOptional(() => client.stats(r.id), 'stats ' + r.shikonaEn);
  const matches = await collectOptional(() => client.matches(r.id, { limit: 18 }), 'matches ' + r.shikonaEn);
  featured.push({ id: r.id, shikonaEn: r.shikonaEn, stats, matches });
}
const basho = await collectOptional(() => client.basho(CURRENT_BASHO), 'basho');
const banzuke = {};
for (const div of TRACKED_DIVISIONS) {
  banzuke[div] = await collectOptional(() => client.banzuke(CURRENT_BASHO, div), div + ' banzuke');
}
const availableBanzuke = {};
for (const division of TRACKED_DIVISIONS) {
  if (banzuke[division]?.status !== 'available') {
    throw new Error('Cannot publish incomplete three-division banzuke: ' + division);
  }
  availableBanzuke[division] = banzuke[division].data;
}
const { rikishi: tracked, divisionCounts: counts } = trackedBanzukeCohort(base.rikishi, availableBanzuke);
console.log('Current banzuke cohort: ' + tracked.length + ' (' + JSON.stringify(counts) + ')');
const roster = {
  ...base,
  count: tracked.length,
  sourceRosterCount: all.length,
  trackedDivisions: TRACKED_DIVISIONS,
  divisionCounts: counts,
  rikishi: tracked,
  preview: true,
  notice: note,
  officialJsa: 'https://www.sumo.or.jp/EnSumoDataRikishi/search'
};
const details = {
  schemaVersion: 1,
  preview: true,
  source: SUMO_API_BASE,
  collectedAt: capturedAt,
  notice: note,
  bashoId: CURRENT_BASHO,
  trackedDivisions: TRACKED_DIVISIONS,
  featured,
  basho,
  banzuke
};
await save('data/sumo/rikishi-index.json', roster);
await save('data/sumo/preview-details.json', details);
console.log(JSON.stringify({
  status: 'ok', count: roster.count, divisions: counts, featured: featured.map(f => f.shikonaEn), basho: basho.status,
  banzuke: Object.fromEntries(Object.entries(banzuke).map(([key,value]) => [key,value.status])), apiCalls: client.callCount,
  exampleStatsKeys: Object.keys(featured[0]?.stats?.data ?? {}).slice(0, 30),
  exampleMatchKeys: Object.keys(featured[0]?.matches?.data ?? {}).slice(0, 30)
}));
