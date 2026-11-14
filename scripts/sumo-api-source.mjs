/**
 * BEFN Sumo data-source adapter. Server/build-time only: never call the
 * upstream API directly from the public browser. No API key is required.
 * Read-only requests, bounded paging, timeouts and a per-process call cap.
 */
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SUMO_API_BASE = 'https://www.sumo-api.com/api';
export const SUMO_API_GUIDE = 'https://www.sumo-api.com/api-guide';
const DIVISIONS = new Set(['Makuuchi','Juryo','Makushita','Sandanme','Jonidan','Jonokuchi']);
const MONTHS = new Set(['01','03','05','07','09','11']);
const DEFAULT_MAX_CALLS = 12;

function positiveId(value) {
  if (!/^[1-9]\d{0,8}$/.test(String(value))) throw new Error('Invalid sumo rikishi ID');
  return Number(value);
}
function bashoId(value) {
  const v = String(value);
  if (!/^19\d{4}$|^20\d{4}$/.test(v) || !MONTHS.has(v.slice(-2))) {
    throw new Error('Invalid basho ID (use YYYYMM in a basho month)');
  }
  return v;
}
function division(value) {
  const v = String(value);
  if (!DIVISIONS.has(v)) throw new Error('Invalid sumo division');
  return v;
}
function listParams({ limit = 100, skip = 0, shikona } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('limit must be 1..1000');
  if (!Number.isInteger(skip) || skip < 0 || skip > 100000) throw new Error('skip must be 0..100000');
  const p = new URLSearchParams({ limit: String(limit), skip: String(skip) });
  if (shikona !== undefined) {
    if (typeof shikona !== 'string' || !shikona.trim() || shikona.length > 90) throw new Error('Invalid shikona search');
    p.set('shikona', shikona.trim());
  }
  return p.toString();
}
export function createSumoClient({ fetchImpl = globalThis.fetch, maxCalls = DEFAULT_MAX_CALLS, timeoutMs = 16000 } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 100) throw new Error('Invalid request cap');
  let calls = 0;
  async function request(route) {
    if (calls >= maxCalls) throw new Error('Sumo API request budget exhausted');
    calls += 1;
    const url = new URL(SUMO_API_BASE + route);
    if (url.origin !== 'https://www.sumo-api.com' || !url.pathname.startsWith('/api/')) {
      throw new Error('Unexpected sumo data source URL');
    }
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json, text/plain;q=0.9', 'User-Agent': 'BlackEyeFightNews/1.0 (source-research; low-volume)' },
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      throw new Error('Sumo API network failure: ' + (error?.message || String(error)));
    }
    if (!response.ok) throw new Error('Sumo API returned HTTP ' + response.status);
    const raw = await response.text(); // Some upstream endpoints return JSON labelled text/plain.
    if (!raw || raw.length > 8_000_000) throw new Error('Sumo API response missing or too large');
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
      return parsed;
    } catch {
      throw new Error('Sumo API did not return a JSON object');
    }
  }
  return Object.freeze({
    get callCount() { return calls; },
    listRikishi: (opts) => request('/rikishis?' + listParams(opts)),
    rikishi: (id) => request('/rikishi/' + positiveId(id)),
    stats: (id) => request('/rikishi/' + positiveId(id) + '/stats'),
    matches: (id, { limit = 15, skip = 0, basho } = {}) =>
      request('/rikishi/' + positiveId(id) + '/matches?' +
        listParams({ limit, skip }) + (basho ? '&bashoId=' + bashoId(basho) : '')),
    headToHead: (id, opponentId) => request('/rikishi/' + positiveId(id) + '/matches/' + positiveId(opponentId)),
    basho: (id) => request('/basho/' + bashoId(id)),
    banzuke: (id, div) => request('/basho/' + bashoId(id) + '/banzuke/' + division(div)),
    torikumi: (id, div, day) => {
      if (!Number.isInteger(day) || day < 1 || day > 15) throw new Error('Invalid basho day');
      return request('/basho/' + bashoId(id) + '/torikumi/' + division(div) + '/' + day);
    },
    kimarite: () => request('/kimarite'),
    kimariteBouts: (name) => {
      if (!/^[a-z-]{2,40}$/.test(String(name))) throw new Error('Invalid kimarite');
      return request('/kimarite/' + name);
    }
  });
}
export function validateRikishiPage(page) {
  if (!page || !Array.isArray(page.records) || !Number.isInteger(page.total) || page.total < 0) {
    throw new Error('Unusable rikishi list (missing records/total)');
  }
  for (const row of page.records) {
    if (!Number.isInteger(row?.id) || !row.id || typeof row?.shikonaEn !== 'string' || !row.shikonaEn.trim()) {
      throw new Error('Unusable rikishi identity data');
    }
  }
  return page;
}
export async function collectRoster(client, { pageSize = 250, maxPages = 5 } = {}) {
  const byId = new Map();
  let expected = null;
  for (let page = 0; page < maxPages; page++) {
    const raw = validateRikishiPage(await client.listRikishi({ limit: pageSize, skip: page * pageSize }));
    if (expected === null) expected = raw.total;
    else if (raw.total !== expected) throw new Error('Roster total changed during pagination; try later');
    if (!raw.records.length && byId.size < expected) throw new Error('Rikishi pagination ended early');
    for (const row of raw.records) byId.set(row.id, row);
    if (byId.size >= expected) break;
  }
  if (expected === null || byId.size !== expected) throw new Error('Incomplete rikishi roster; refusing to publish');
  return [...byId.values()].sort((a,b) => a.id - b.id);
}
export function buildRikishiIndex(records, collectedAt) {
  return {
    schemaVersion: 1,
    source: SUMO_API_BASE,
    sourceGuide: SUMO_API_GUIDE,
    collectedAt,
    count: records.length,
    rikishi: records.map((r) => ({
      sourceId: r.id, officialNskId: r.nskId ?? null, sumoDbId: r.sumodbId ?? null,
      shikonaEn: r.shikonaEn, shikonaJp: r.shikonaJp ?? null,
      currentRank: r.currentRank ?? null, heya: r.heya ?? null,
      birthplace: r.shusshin ?? null, birthDate: r.birthDate ?? null,
      heightCm: Number.isFinite(r.height) ? r.height : null,
      weightKg: Number.isFinite(r.weight) ? r.weight : null,
      debutBasho: r.debut ?? null, sourceUpdatedAt: r.updatedAt ?? null
    }))
  };
}
async function atomicJson(path, object) {
  await mkdir(dirname(path), { recursive: true });
  const temp = path + '.tmp';
  await writeFile(temp, JSON.stringify(object, null, 2) + '\n', 'utf8');
  await rename(temp, path);
}
async function main() {
  const mode = process.argv[2];
  if (mode !== '--smoke' && mode !== '--write-snapshot') {
    console.error('Use: node scripts/sumo-api-source.mjs --smoke | --write-snapshot');
    process.exitCode = 2;
    return;
  }
  const client = createSumoClient();
  if (mode === '--smoke') {
    const page = validateRikishiPage(await client.listRikishi({ limit: 2 }));
    if (!page.records.length) throw new Error('Sumo API returned an empty roster');
    const stats = await client.stats(page.records[0].id);
    if (!stats || typeof stats !== 'object' || Array.isArray(stats)) throw new Error('Missing fighter statistics');
    console.log(JSON.stringify({ status: 'ok', source: SUMO_API_BASE, requests: client.callCount,
      totalRikishi: page.total, exampleId: page.records[0].id, exampleName: page.records[0].shikonaEn }));
    return;
  }
  const records = await collectRoster(client);
  const index = buildRikishiIndex(records, new Date().toISOString());
  // Snapshot is opt-in and NEVER automatically written to main or deployed.
  await atomicJson('data/sumo/rikishi-index.json', index);
  console.log('Saved ' + index.count + ' rikishi to data/sumo/rikishi-index.json (' + client.callCount + ' API requests)');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
