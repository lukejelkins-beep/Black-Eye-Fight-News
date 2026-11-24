/**
 * BEFN Sumo basho archive: one saved, source-labelled file per completed tournament.
 * For each basho: dates, division champions (yusho), special prizes (sansho) and the
 * Makuuchi, Juryo and Makushita banzuke with every wrestler's bout-by-bout record.
 * The Sumo home page, the Basho review page and the promotion-run tracker read these files;
 * the browser never calls the API.
 *
 * Owner decision 2026-11-24: BEFN has the provider's permission ("collect as much as we need
 * as often as we need"); see docs/design/DECISIONS.md. Requests stay low-volume and paced.
 *
 *   node scripts/sumo-collect-basho-archive.mjs --from 202411 --to 202611 [--force]
 * Existing files for completed basho are kept unless --force is given.
 */
import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createSumoClient, SUMO_API_BASE } from './sumo-api-source.mjs';

export const ARCHIVE_DIR = 'data/sumo/basho-archive';
export const DIVISIONS = ['Makuuchi', 'Juryo', 'Makushita'];
const BOUTS = { Makuuchi: 15, Juryo: 15, Makushita: 7 };

export function bashoRange(from, to) {
  const out = [];
  let y = Number(from.slice(0, 4)), m = Number(from.slice(4));
  const end = Number(to);
  while (y * 100 + m <= end) {
    out.push(String(y * 100 + m));
    m += 2; if (m > 11) { m = 1; y += 1; }
  }
  return out;
}

const slimBout = b => (b && b.opponentID ? {
  result: b.result || '', opponentID: b.opponentID, opponentShikonaEn: b.opponentShikonaEn || '', kimarite: b.kimarite || ''
} : null);

export function slimBanzuke(raw, division) {
  const rows = [];
  for (const side of ['east', 'west']) {
    for (const r of raw?.[side] || []) {
      rows.push({
        rikishiID: r.rikishiID, shikonaEn: r.shikonaEn || '', side: r.side || side, rank: r.rank || '', rankValue: r.rankValue ?? null,
        wins: r.wins ?? 0, losses: r.losses ?? 0, absences: r.absences ?? 0,
        record: (r.record || []).map(slimBout)
      });
    }
  }
  rows.sort((a, b) => (a.rankValue ?? 1e9) - (b.rankValue ?? 1e9) || a.side.localeCompare(b.side));
  return { division, rows };
}

/* Integrity: every row has an ID and a rank. Wins and losses come from the bout list (fusen
   included); where the source's totals differ (two Juryo rows in July 2025 leave out the day-15
   bout), the bout list is used and the source totals are kept as sourceWins/sourceLosses. Returns { problems, notes }: problems stop the run; notes record
   unusual but consistent counts, such as a Makushita wrestler with 8 results after returning from
   an absence (Kamito, November 2024), so pages can say so instead of guessing. */
export function checkBasho(file) {
  const problems = [], notes = [];
  if (!/^\d{6}$/.test(file.bashoId)) problems.push('bad bashoId');
  for (const div of DIVISIONS) {
    const b = file.banzuke?.[div];
    if (!b || !Array.isArray(b.rows) || !b.rows.length) { problems.push(div + ': no rows'); continue; }
    for (const r of b.rows) {
      if (!Number.isInteger(r.rikishiID) || !r.rank) { problems.push(div + ': row without ID or rank'); continue; }
      const results = r.record.filter(Boolean).map(x => x.result);
      const wins = results.filter(x => /win/.test(x)).length, losses = results.filter(x => /loss/.test(x)).length;
      if (wins !== r.wins || losses !== r.losses) {
        /* docs/sumo-api-integration.md: derive wins from the bouts. Keep the source's own totals beside them. */
        notes.push(`${div} ${r.shikonaEn} (${r.rank}): source total ${r.wins}-${r.losses}, bout list ${wins}-${losses}; the bout list is used`);
        r.sourceWins = r.wins; r.sourceLosses = r.losses; r.wins = wins; r.losses = losses;
      }
      if (r.wins + r.losses > BOUTS[div]) notes.push(`${div} ${r.shikonaEn} (${r.rank}): ${r.wins + r.losses} results; the division normally has ${BOUTS[div]} bouts`);
    }
  }
  if (!file.yusho?.some(y => y.type === 'Makuuchi')) problems.push('no Makuuchi yusho');
  return { problems, notes };
}

async function writeJson(path, value) {
  const tmp = path + '.tmp';
  await writeFile(tmp, JSON.stringify(value) + '\n');
  await rename(tmp, path);
}

export async function collect({ from, to, force = false, client = createSumoClient({ maxCalls: 100 }), pauseMs = 700, now = () => new Date() } = {}) {
  await mkdir(ARCHIVE_DIR, { recursive: true });
  const done = [], skipped = [];
  for (const id of bashoRange(from, to)) {
    const path = `${ARCHIVE_DIR}/${id}.json`;
    if (!force && existsSync(path)) { skipped.push(id); continue; }
    const meta = await client.basho(id);
    /* Saved once and then kept, so wait two days after the last day for final results to settle. */
    if (!meta?.endDate || meta.endDate.startsWith('0001') || new Date(meta.endDate).getTime() + 2 * 86400e3 > now().getTime()) { skipped.push(id + ' (not finished)'); continue; }
    const banzuke = {};
    for (const div of DIVISIONS) {
      await new Promise(r => setTimeout(r, pauseMs));
      banzuke[div] = slimBanzuke(await client.banzuke(id, div), div);
    }
    const file = {
      schemaVersion: 1, bashoId: id, source: SUMO_API_BASE,
      sourceUrls: [`${SUMO_API_BASE}/basho/${id}`, ...DIVISIONS.map(d => `${SUMO_API_BASE}/basho/${id}/banzuke/${d}`)],
      collectedAt: now().toISOString(),
      startDate: meta.startDate || null, endDate: meta.endDate || null, location: meta.location || null,
      yusho: (meta.yusho || []).map(y => ({ type: y.type, rikishiId: y.rikishiId, shikonaEn: y.shikonaEn || '' })),
      specialPrizes: (meta.specialPrizes || []).map(p => ({ type: p.type, rikishiId: p.rikishiId, shikonaEn: p.shikonaEn || '' })),
      banzuke
    };
    const { problems, notes } = checkBasho(file);
    if (problems.length) throw new Error(`Basho ${id} failed integrity checks: ${problems.slice(0, 5).join('; ')}`);
    file.notes = notes;
    await writeJson(path, file);
    done.push(id);
    await new Promise(r => setTimeout(r, pauseMs));
  }
  /* Rewrite the index only when a tournament was added (or it is missing), so a daily run that
     finds nothing new changes no files. */
  if (!done.length && existsSync(`${ARCHIVE_DIR}/index.json`)) return { done, skipped, total: (await readdir(ARCHIVE_DIR)).filter(f => /^\d{6}\.json$/.test(f)).length };
  const ids = (await readdir(ARCHIVE_DIR)).filter(f => /^\d{6}\.json$/.test(f)).map(f => f.slice(0, 6)).sort();
  const index = { schemaVersion: 1, source: SUMO_API_BASE, updatedAt: now().toISOString(), basho: [] };
  for (const id of ids) {
    const f = JSON.parse(await readFile(`${ARCHIVE_DIR}/${id}.json`, 'utf8'));
    index.basho.push({ bashoId: id, startDate: f.startDate, endDate: f.endDate, location: f.location,
      makuuchiChampion: f.yusho.find(y => y.type === 'Makuuchi')?.shikonaEn || null });
  }
  await writeJson(`${ARCHIVE_DIR}/index.json`, index);
  return { done, skipped, total: ids.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const from = arg('--from'), to = arg('--to');
  if (!/^\d{6}$/.test(from || '') || !/^\d{6}$/.test(to || '')) { console.error('Use --from YYYYMM --to YYYYMM'); process.exit(2); }
  collect({ from, to, force: process.argv.includes('--force') })
    .then(r => console.log(JSON.stringify(r)))
    .catch(e => { console.error(e.message); process.exit(1); });
}
