/**
 * BEFN banzuke release watch. Finds the next basho after the latest saved tournament and asks the
 * Sumo API whether its banzuke has been published. Before release the API returns empty rankings
 * (east and west are null); once published, the Makuuchi, Juryo and Makushita ranks are saved to
 * data/sumo/banzuke-release/YYYYMM.json, which the Banzuke changes page and the Sumo home's
 * countdown read. 1 request a day until release, then 3 more, then nothing until the next basho.
 *
 *   node scripts/sumo-check-banzuke-release.mjs [--now ISO]
 * Owner decision 2026-11-24: BEFN has the Sumo API provider's permission (see DECISIONS.md).
 */
import { mkdir, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createSumoClient, SUMO_API_BASE } from './sumo-api-source.mjs';
import { slimBanzuke, DIVISIONS, ARCHIVE_DIR } from './sumo-collect-basho-archive.mjs';

export const RELEASE_DIR = 'data/sumo/banzuke-release';

export function nextBashoId(id) {
  let y = Number(id.slice(0, 4)), m = Number(id.slice(4)) + 2;
  if (m > 11) { m = 1; y += 1; }
  return String(y) + String(m).padStart(2, '0');
}

/* A published banzuke: rows with parseable ranks, at least 40 in Makuuchi. */
export function isPublished(raw) {
  const rows = [...(raw?.east || []), ...(raw?.west || [])];
  return rows.length >= 40 && rows.every(r => Number.isInteger(r.rikishiID) && /^\w+ \d+ (East|West)$/.test(r.rank || ''));
}

export async function checkRelease({ client = createSumoClient({ maxCalls: 6 }), now = () => new Date() } = {}) {
  const saved = (await readdir(ARCHIVE_DIR)).filter(f => /^\d{6}\.json$/.test(f)).map(f => f.slice(0, 6)).sort();
  if (!saved.length) throw new Error('No saved tournaments to work from');
  const next = nextBashoId(saved[saved.length - 1]);
  const path = `${RELEASE_DIR}/${next}.json`;
  if (existsSync(path)) return { bashoId: next, status: 'already saved' };
  const makuuchi = await client.banzuke(next, 'Makuuchi');
  if (!isPublished(makuuchi)) return { bashoId: next, status: 'not yet published' };
  const banzuke = { Makuuchi: slimBanzuke(makuuchi, 'Makuuchi') };
  for (const div of DIVISIONS.slice(1)) banzuke[div] = slimBanzuke(await client.banzuke(next, div), div);
  for (const div of DIVISIONS) if (!banzuke[div].rows.length) throw new Error(`${div} banzuke for ${next} is empty; not saving a partial release`);
  const file = { schemaVersion: 1, bashoId: next, source: SUMO_API_BASE,
    sourceUrls: DIVISIONS.map(d => `${SUMO_API_BASE}/basho/${next}/banzuke/${d}`), firstSeenAt: now().toISOString(), banzuke };
  await mkdir(RELEASE_DIR, { recursive: true });
  await writeFile(path + '.tmp', JSON.stringify(file) + '\n');
  await rename(path + '.tmp', path);
  return { bashoId: next, status: 'saved', rows: DIVISIONS.map(d => banzuke[d].rows.length) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const i = process.argv.indexOf('--now');
  const fixed = i > 0 ? new Date(process.argv[i + 1]) : null;
  checkRelease({ now: () => fixed || new Date() })
    .then(r => console.log(JSON.stringify(r)))
    .catch(e => { console.error(e.message); process.exit(1); });
}
