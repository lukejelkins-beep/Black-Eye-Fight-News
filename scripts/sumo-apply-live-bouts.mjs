/**
 * Fold the current basho's completed bouts into the career and head-to-head
 * research files, so career totals, series records, opponent lists, recent form
 * and technique counts stay current during a basho.
 *
 * The research files are a snapshot (e.g. through Day 7). Completed bouts
 * already live in preview-details.json (each wrestler's banzuke record: one slot
 * per day, with result, opponent and technique). This adds the ones the
 * snapshot does not have yet. It is idempotent: a bout is only applied if its
 * pair record has no entry for that basho and day, so re-running changes nothing.
 */
import { readFile, writeFile, rename } from 'node:fs/promises';

const FILES = {
  details: ['data/sumo/preview-details.json', 0, false],
  roster: ['data/sumo/rikishi-index.json', 2, false],
  summary: ['data/sumo/research-h2h-summary.json', 0, true],
  opponents: ['data/sumo/research-h2h-opponents.json', 0, true],
  history: ['data/sumo/research-h2h-history.json', 0, true],
  divisions: ['data/sumo/division-stats.json', 2, true]
};
const pairKey = (x, y) => (x < y ? x + ':' + y : y + ':' + x);

/** Decided bouts of the current basho, each once, from the banzuke records. */
export function completedBouts(details) {
  const bashoId = String(details.bashoId || '');
  const seen = new Map();
  for (const [division, section] of Object.entries(details.banzuke || {})) {
    for (const row of [...(section?.data?.east || []), ...(section?.data?.west || [])]) {
      (row.record || []).forEach((rec, i) => {
        const opp = Number(rec?.opponentID), id = Number(row.rikishiID);
        if (!['win', 'loss'].includes(rec?.result) || !(opp > 0) || !(id > 0) || opp === id) return;
        const key = bashoId + '|' + (i + 1) + '|' + pairKey(id, opp);
        const winnerId = rec.result === 'win' ? id : opp;
        const existing = seen.get(key);
        if (existing) { if (!existing.kimarite && rec.kimarite) existing.kimarite = rec.kimarite; return; }
        seen.set(key, {
          bashoId, day: i + 1, division, winnerId, kimarite: rec.kimarite || '',
          ids: [id, opp], names: { [id]: row.shikonaEn, [opp]: rec.opponentShikonaEn }, divisions: { [id]: division }
        });
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.day - b.day);
}

const bump = (list, kimarite) => {
  if (!kimarite || kimarite === 'fusen') return;
  const hit = list.find(x => x.kimarite === kimarite);
  if (hit) hit.count++; else list.push({ kimarite, count: 1 });
  list.sort((a, b) => b.count - a.count);
};

/** Apply bouts to the loaded files (mutates). Returns how many bouts were new. */
export function applyLiveBouts(files, bouts) {
  const inCohort = new Set(files.roster.rikishi.map(r => Number(r.sourceId)));
  let applied = 0;
  for (const bout of bouts) {
    const [x, y] = bout.ids;
    const key = pairKey(x, y);
    const a = Math.min(x, y), b = Math.max(x, y);
    const pair = files.history.pairs[key] || (files.history.pairs[key] = { a, b, winsA: 0, winsB: 0, regular: [], special: [] });
    if (pair.regular.some(t => t[0] === bout.bashoId && t[1] === bout.day)) continue;
    applied++;
    pair.regular.unshift([bout.bashoId, bout.day, bout.winnerId, bout.kimarite, bout.division, 0, 'regular']);
    pair.regular.sort((p, q) => q[0].localeCompare(p[0]) || q[1] - p[1]);
    if (bout.winnerId === a) pair.winsA++; else pair.winsB++;
    if (inCohort.has(x) && inCohort.has(y)) {
      files.summary.activePairs[key] = { a, b, winsA: pair.winsA, winsB: pair.winsB, total: pair.regular.length, latest: pair.regular.slice(0, 5) };
    }
    for (const id of bout.ids) {
      if (!inCohort.has(id)) continue;
      const opp = id === x ? y : x, won = bout.winnerId === id;
      const profile = files.summary.profiles[id];
      if (profile) {
        if (won) profile.careerWins++; else profile.careerLosses++;
        profile.recentPerformance.unshift({ bashoId: bout.bashoId, day: bout.day, opponentId: opp, opponentName: bout.names[opp] || '', outcome: won ? 'win' : 'loss', kimarite: bout.kimarite });
        profile.recentPerformance = profile.recentPerformance.slice(0, 10);
        bump(profile.kimarite[won ? 'wins' : 'losses'], bout.kimarite);
      }
      const list = files.opponents.profiles[id];
      if (list) {
        let row = list.find(o => o.id === opp);
        if (!row) { row = { id: opp, name: bout.names[opp] || '', wins: 0, losses: 0, meetings: 0, extraMeetings: 0 }; list.push(row); }
        if (won) row.wins++; else row.losses++;
        row.meetings++;
        list.sort((p, q) => q.meetings - p.meetings || p.id - q.id);
        if (profile) profile.opponentCount = list.length;
      }
      const ds = files.divisions.bySourceId[id];
      if (ds?.status === 'available') {
        const div = bout.divisions[id] || bout.division;
        // First bout in a division this wrestler had no record in: start both
        // sides at 0 so wins and losses always come as a pair.
        ds.stats.winsByDivision[div] = ds.stats.winsByDivision[div] || 0;
        ds.stats.lossByDivision[div] = ds.stats.lossByDivision[div] || 0;
        const bucket = won ? ds.stats.winsByDivision : ds.stats.lossByDivision;
        bucket[div] += 1;
      }
    }
  }
  return applied;
}

async function load(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function save(path, value, indent) {
  const tmp = path + '.tmp';
  await writeFile(tmp, JSON.stringify(value, null, indent || undefined) + '\n', 'utf8');
  await rename(tmp, path);
}

async function main() {
  const files = {};
  for (const [key, [path]] of Object.entries(FILES)) files[key] = await load(path);
  const bouts = completedBouts(files.details);
  const applied = applyLiveBouts(files, bouts);
  console.log('Completed bouts this basho: ' + bouts.length + ', newly applied: ' + applied);
  if (!applied) return;
  for (const [key, [path, indent, write]] of Object.entries(FILES)) if (write) await save(path, files[key], indent);
}
if (import.meta.url === 'file://' + process.argv[1]) await main();
