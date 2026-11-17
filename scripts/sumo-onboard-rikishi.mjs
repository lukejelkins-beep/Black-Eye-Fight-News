/**
 * Give wrestlers who are new to the tracked cohort the same career, head-to-head
 * and division data the rest of the preview has, from the Sumo API only.
 *
 * The research files in data/sumo/ were built once for the original 190
 * wrestlers. Each basho promotes and demotes some of them, so anyone new would
 * show "Not available" on their profile. This finds roster members missing from
 * those files, collects their full career from the API, and adds them. It never
 * rewrites existing wrestlers' own entries; it only adds the new wrestler to
 * their opponent lists and cohort pair records.
 *
 * Honest labelling: everything added is Sumo-API-only and flagged as pending
 * independent certification, exactly like the existing preview data.
 */
import { readFile, writeFile, rename } from 'node:fs/promises';
import { createSumoClient } from './sumo-api-source.mjs';

const API = 'https://www.sumo-api.com/api';
const FILES = {
  roster: ['data/sumo/rikishi-index.json', 2],
  career: ['data/sumo/career-history.json', 2],
  summary: ['data/sumo/research-h2h-summary.json', 0],
  opponents: ['data/sumo/research-h2h-opponents.json', 0],
  history: ['data/sumo/research-h2h-history.json', 0],
  divisions: ['data/sumo/division-stats.json', 2],
  trusted: ['data/sumo/api-trusted-status.json', 2]
};
const pairKey = (x, y) => (x < y ? x + ':' + y : y + ':' + x);
const newestFirst = (a, b) => b.bashoId.localeCompare(a.bashoId) || b.day - a.day || (b.matchNo || 0) - (a.matchNo || 0);

export function missingRikishiIds(roster, files) {
  return (roster.rikishi || []).map(r => Number(r.sourceId)).filter(id =>
    !files.career.bySourceId[id] || !files.summary.profiles[id] || !files.opponents.profiles[id] || !files.divisions.bySourceId[id]);
}

/** Decided bouts from one wrestler's point of view. */
export function normaliseMatches(id, records) {
  return (records || []).filter(m => Number(m.winnerId) > 0 && m.bashoId && Number.isInteger(m.day)).map(m => {
    const east = Number(m.eastId) === id;
    return {
      bashoId: String(m.bashoId), day: m.day, matchNo: m.matchNo || 0, division: m.division || '',
      kimarite: m.kimarite || '', winnerId: Number(m.winnerId),
      opponentId: Number(east ? m.westId : m.eastId), opponentName: String(east ? m.westShikona : m.eastShikona || ''),
      won: Number(m.winnerId) === id,
      // Playoffs (day 16) and pre-debut mae-zumo bouts are kept apart from the regular record.
      kind: m.division === 'Mae-zumo' ? 'mae-zumo' : m.day > 15 ? 'playoff' : 'regular'
    };
  }).filter(m => m.opponentId > 0 && m.opponentId !== id).sort(newestFirst);
}

// Forfeits (fusen) are results, not techniques, so they are left out of the technique counts.
const countBy = (list, key) => {
  const m = new Map();
  for (const x of list) if (x[key] && x[key] !== 'fusen') m.set(x[key], (m.get(x[key]) || 0) + 1);
  return [...m].map(([kimarite, count]) => ({ kimarite, count })).sort((a, b) => b.count - a.count);
};

export function buildOnboarding(rec, api) {
  const id = Number(rec.sourceId);
  const matches = normaliseMatches(id, api.matches?.records);
  const ranks = (Array.isArray(api.ranks) ? api.ranks : []).filter(r => r?.bashoId && r?.rank).sort((a, b) => a.bashoId.localeCompare(b.bashoId));
  const bodies = (Array.isArray(api.measurements) ? api.measurements : []).filter(m => m?.bashoId && m.weight > 0).sort((a, b) => a.bashoId.localeCompare(b.bashoId));
  const best = [...ranks].sort((a, b) => a.rankValue - b.rankValue)[0]?.rank || rec.currentRank || '';
  const weight = [];
  for (const m of bodies) {
    const last = weight[weight.length - 1];
    if (last && last.kg === m.weight && last.heightCm === m.height) continue;
    weight.push({
      basho: m.bashoId, kg: m.weight, heightCm: m.height,
      source: API + '/measurements?rikishiId=' + id, evidenceSource: 'Sumo API historical change',
      status: 'dated source record; full history not independently certified', independentlyCertified: false
    });
  }
  const career = {
    sumoApiId: id, officialNskId: rec.officialNskId ?? null, name: rec.shikonaEn,
    weight, rank: ranks.map(r => ({ basho: r.bashoId, rank: r.rank })),
    weightSource: API + '/measurements?rikishiId=' + id,
    rankSource: API + '/ranks?rikishiId=' + id + '&limit=200&skip=0&sortOrder=asc',
    independentRankReference: 'Not yet independently sourced',
    rankCrosscheck: 'Not yet cross-checked against the Japan Sumo Association',
    currentListedWeight: { kg: rec.weightKg ?? null, heightCm: rec.heightCm ?? null, source: API + '/rikishi/' + id, datedMeasurement: false },
    bestRank: best, weightResearchStatus: 'api-only-awaiting-independent-source',
    datedWeightSourceComplete: false, independentHistoricalRankCertification: false, certified: false, milestones: []
  };
  const regularBouts = matches.filter(m => m.kind === 'regular');
  const wins = regularBouts.filter(m => m.won), losses = regularBouts.filter(m => !m.won);
  const byOpponent = new Map();
  for (const m of matches) {
    const o = byOpponent.get(m.opponentId) || { id: m.opponentId, name: m.opponentName, wins: 0, losses: 0, meetings: 0, extraMeetings: 0 };
    if (m.kind !== 'regular') o.extraMeetings++;
    else { if (m.won) o.wins++; else o.losses++; o.meetings++; }
    byOpponent.set(m.opponentId, o);
  }
  const opponents = [...byOpponent.values()].sort((a, b) => b.meetings - a.meetings || a.id - b.id);
  const stats = api.stats || {};
  const summary = {
    name: rec.shikonaEn,
    careerWins: Number.isInteger(stats.totalWins) ? stats.totalWins : wins.length,
    careerLosses: Number.isInteger(stats.totalLosses) ? stats.totalLosses : losses.length,
    careerHigh: best, reconciledAggregateLag: false,
    recentPerformance: regularBouts.slice(0, 10).map(m => ({ bashoId: m.bashoId, day: m.day, opponentId: m.opponentId, opponentName: m.opponentName, outcome: m.won ? 'win' : 'loss', kimarite: m.kimarite })),
    kimarite: { wins: countBy(wins, 'kimarite'), losses: countBy(losses, 'kimarite') },
    opponentCount: opponents.length
  };
  const pairs = {};
  for (const [oppId, o] of byOpponent) {
    const a = Math.min(id, oppId), b = Math.max(id, oppId);
    const bouts = matches.filter(m => m.opponentId === oppId);
    const tuple = (m, kind) => [m.bashoId, m.day, m.winnerId, m.kimarite, m.division, m.matchNo, kind];
    const regular = bouts.filter(m => m.kind === 'regular');
    pairs[pairKey(id, oppId)] = {
      a, b, winsA: regular.filter(m => m.winnerId === a).length, winsB: regular.filter(m => m.winnerId === b).length,
      regular: regular.map(m => tuple(m, 'regular')), special: bouts.filter(m => m.kind !== 'regular').map(m => tuple(m, m.kind))
    };
  }
  const divisionStats = {
    sourceId: id, shikonaEn: rec.shikonaEn, status: stats.totalMatches ? 'available' : 'unavailable',
    stats: { winsByDivision: stats.winsByDivision || {}, lossByDivision: stats.lossByDivision || {}, basho: stats.basho ?? 0 }
  };
  return { id, career, summary, opponents, pairs, divisionStats, bouts: matches.length };
}

/** Merge onboarding results into the loaded files (mutates and returns them). */
export function applyOnboarding(files, results, nowIso) {
  const rosterIds = new Set(files.roster.rikishi.map(r => Number(r.sourceId)));
  const added = [];
  for (const r of results) {
    const id = r.id;
    files.career.bySourceId[id] = r.career;
    files.summary.profiles[id] = r.summary;
    files.opponents.profiles[id] = r.opponents;
    files.divisions.bySourceId[id] = r.divisionStats;
    for (const [key, pair] of Object.entries(r.pairs)) {
      files.history.pairs[key] = pair;
      const other = pair.a === id ? pair.b : pair.a;
      if (rosterIds.has(other)) {
        files.summary.activePairs[key] = { a: pair.a, b: pair.b, winsA: pair.winsA, winsB: pair.winsB, total: pair.regular.length, latest: pair.regular.slice(0, 5) };
        // Keep the other wrestler's opponent list in step (their own entry is otherwise untouched).
        const list = files.opponents.profiles[other];
        if (list && !list.some(o => o.id === id)) {
          const wins = pair.a === other ? pair.winsA : pair.winsB, losses = pair.a === other ? pair.winsB : pair.winsA;
          list.push({ id, name: r.summary.name, wins, losses, meetings: wins + losses, extraMeetings: 0 });
          list.sort((x, y) => y.meetings - x.meetings || x.id - y.id);
          if (files.summary.profiles[other]) files.summary.profiles[other].opponentCount = list.length;
        }
      }
    }
    added.push(id);
  }
  const size = files.roster.rikishi.length;
  for (const f of [files.career, files.summary, files.opponents, files.history]) f.cohortSize = size;
  files.summary.profileCount = Object.keys(files.summary.profiles).length;
  files.opponents.profileCount = Object.keys(files.opponents.profiles).length;
  files.summary.activePairCount = Object.keys(files.summary.activePairs).length;
  files.history.pairCount = Object.keys(files.history.pairs).length;
  files.divisions.cohortSize = size;
  const have = rosterIds;
  const avail = [...have].filter(id => files.divisions.bySourceId[id]?.status === 'available').length;
  files.divisions.availableCount = avail;
  files.divisions.unavailableCount = size - avail;
  // Readiness: everyone is API-trusted; the newly added are awaiting strict certification.
  const t = files.trusted;
  const pending = new Set((t.strictCareerResultsPendingSourceIds || []).map(Number).filter(x => have.has(x)));
  for (const id of added) pending.add(id);
  t.strictCareerResultsPendingSourceIds = [...pending];
  t.legacyJsaSpotcheckReviewSourceIds = (t.legacyJsaSpotcheckReviewSourceIds || []).map(Number).filter(x => have.has(x));
  t.cohortSize = size;
  t.apiTrustedPreviewReady = size;
  t.strictCareerResultsCertified = size - pending.size;
  if (nowIso) t.rosterSyncedAt = nowIso;
  return { added, size };
}

async function load(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function save(path, value, indent) {
  const tmp = path + '.tmp';
  await writeFile(tmp, JSON.stringify(value, null, indent || undefined) + '\n', 'utf8');
  await rename(tmp, path);
}
const pause = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const files = {};
  for (const [key, [path]] of Object.entries(FILES)) files[key] = await load(path);
  const missing = missingRikishiIds(files.roster, files);
  const cap = Number(process.env.SUMO_ONBOARD_MAX || 40);
  console.log('Roster ' + files.roster.rikishi.length + ', missing research data: ' + missing.length);
  if (!missing.length) {
    // Still drop stale ids from the readiness lists after a roster change.
    const before = JSON.stringify(files.trusted);
    applyOnboarding(files, [], files.trusted.rosterSyncedAt);
    if (JSON.stringify(files.trusted) !== before) await save(FILES.trusted[0], files.trusted, FILES.trusted[1]);
    return;
  }
  const todo = missing.slice(0, cap);
  const byId = new Map(files.roster.rikishi.map(r => [Number(r.sourceId), r]));
  const results = [];
  let client = createSumoClient({ maxCalls: 100, timeoutMs: 20000 });
  for (const id of todo) {
    if (client.callCount > 92) client = createSumoClient({ maxCalls: 100, timeoutMs: 20000 });
    const rec = byId.get(id);
    try {
      const [stats, matches, ranks, measurements] = [
        await client.stats(id), await client.matches(id, { limit: 1000 }), await client.ranks(id), await client.measurements(id)];
      const built = buildOnboarding(rec, { stats, matches, ranks, measurements });
      if (!built.bouts) throw new Error('no decided bouts returned');
      results.push(built);
      console.log('Added ' + rec.shikonaEn + ' (' + id + '): ' + built.bouts + ' bouts, ' + Object.keys(built.pairs).length + ' opponents');
    } catch (error) {
      console.warn('Skipped ' + (rec?.shikonaEn || id) + ' (' + id + '): ' + String(error.message).slice(0, 140));
    }
    await pause(250);
  }
  if (!results.length) { console.log('Nothing could be added this run'); return; }
  const { added, size } = applyOnboarding(files, results, new Date().toISOString());
  for (const key of ['career', 'summary', 'opponents', 'history', 'divisions', 'trusted']) await save(FILES[key][0], files[key], FILES[key][1]);
  console.log(JSON.stringify({ status: 'ok', added: added.length, stillMissing: missing.length - added.length, cohort: size }));
}

if (import.meta.url === 'file://' + process.argv[1]) await main();
