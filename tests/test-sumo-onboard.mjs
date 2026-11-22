import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildOnboarding, applyOnboarding, missingRikishiIds, normaliseMatches } from '../scripts/sumo-onboard-rikishi.mjs';
import { validateSumoPreviewReadiness } from '../assets/sumo-verification.mjs';

const load = f => JSON.parse(readFileSync(new URL('../data/sumo/' + f + '.json', import.meta.url), 'utf8'));
const fresh = () => ({
  roster: load('rikishi-index'), career: load('career-history'), summary: load('research-h2h-summary'),
  opponents: load('research-h2h-opponents'), history: load('research-h2h-history'),
  divisions: load('division-stats'), trusted: load('api-trusted-status')
});
// Rebuild what the API would return for one wrestler from the bouts stored in the existing research file.
function apiFor(files, id) {
  const rec = files.roster.rikishi.find(r => r.sourceId === id);
  const names = Object.fromEntries(files.opponents.profiles[id].map(o => [o.id, o.name]));
  const records = [];
  for (const [key, p] of Object.entries(files.history.pairs)) {
    if (!key.split(':').includes(String(id))) continue;
    const other = p.a === id ? p.b : p.a;
    for (const t of [...p.regular, ...p.special]) {
      records.push({ bashoId: t[0], day: t[1], winnerId: t[2], kimarite: t[3], division: t[4], matchNo: t[5],
        eastId: id, eastShikona: rec.shikonaEn, westId: other, westShikona: names[other] });
    }
  }
  const p = files.summary.profiles[id];
  return { rec, api: { stats: { totalWins: p.careerWins, totalLosses: p.careerLosses, totalMatches: 1, winsByDivision: {}, lossByDivision: {}, basho: 1 }, matches: { records }, ranks: [], measurements: [] } };
}

test('rebuilding a known wrestler from API-shaped bouts reproduces the stored research data', () => {
  const files = fresh();
  for (const id of [8850, 2]) {
    const { rec, api } = apiFor(files, id);
    const built = buildOnboarding(rec, api);
    const stored = files.summary.profiles[id];
    assert.deepEqual(built.summary.recentPerformance, stored.recentPerformance);
    assert.deepEqual(built.summary.kimarite, stored.kimarite);
    assert.equal(built.summary.opponentCount, stored.opponentCount);
    assert.deepEqual(built.opponents, files.opponents.profiles[id]);
    for (const [key, pair] of Object.entries(built.pairs)) assert.deepEqual(pair, files.history.pairs[key], 'pair ' + key);
  }
});

test('playoff and mae-zumo bouts stay out of the regular record', () => {
  const m = normaliseMatches(1, [
    { bashoId: '202501', day: 3, matchNo: 5, division: 'Makuuchi', eastId: 1, westId: 2, westShikona: 'B', winnerId: 1, kimarite: 'yorikiri' },
    { bashoId: '202501', day: 16, matchNo: 1, division: 'Makuuchi', eastId: 1, westId: 2, westShikona: 'B', winnerId: 2, kimarite: 'oshidashi' },
    { bashoId: '202501', day: 2, matchNo: 1, division: 'Mae-zumo', eastId: 2, eastShikona: 'B', westId: 1, winnerId: 1, kimarite: null },
    { bashoId: '202501', day: 15, matchNo: 9, division: 'Makuuchi', eastId: 1, westId: 2, westShikona: 'B', winnerId: 0, kimarite: '' }
  ]);
  assert.deepEqual(m.map(x => x.kind).sort(), ['mae-zumo', 'playoff', 'regular']);
});

test('a wrestler missing from the research files is detected, rebuilt and made consistent', () => {
  const files = fresh();
  const id = 19;
  const { rec, api } = apiFor(files, id);
  const original = JSON.parse(JSON.stringify(files));
  delete files.career.bySourceId[id]; delete files.summary.profiles[id];
  delete files.opponents.profiles[id]; delete files.divisions.bySourceId[id];
  assert.deepEqual(missingRikishiIds(files.roster, files), [id]);
  const built = buildOnboarding(rec, api);
  const { added, size } = applyOnboarding(files, [built], '2026-11-17T00:00:00.000Z');
  assert.deepEqual(added, [id]);
  assert.equal(size, files.roster.rikishi.length);
  assert.deepEqual(missingRikishiIds(files.roster, files), []);
  assert.equal(files.summary.profiles[id].careerWins, original.summary.profiles[id].careerWins);
  assert.ok(files.trusted.strictCareerResultsPendingSourceIds.includes(id), 'new wrestler is flagged as awaiting certification');
  assert.equal(validateSumoPreviewReadiness(files.trusted, files.roster), true);
  // Existing wrestlers who met the newcomer keep a consistent opponent list.
  const other = files.opponents.profiles[8850].find(o => o.id === id);
  assert.ok(other && other.meetings > 0);
});

test('readiness follows the roster size instead of a fixed 190', () => {
  const files = fresh();
  const dropped = files.roster.rikishi.pop();
  files.roster.count = files.roster.rikishi.length;
  const t = files.trusted;
  t.strictCareerResultsPendingSourceIds = t.strictCareerResultsPendingSourceIds.filter(x => x !== dropped.sourceId);
  t.legacyJsaSpotcheckReviewSourceIds = t.legacyJsaSpotcheckReviewSourceIds.filter(x => x !== dropped.sourceId);
  t.cohortSize = t.apiTrustedPreviewReady = files.roster.count;
  t.strictCareerResultsCertified = files.roster.count - t.strictCareerResultsPendingSourceIds.length;
  assert.equal(validateSumoPreviewReadiness(t, files.roster), true);
  t.cohortSize = 190;
  assert.throws(() => validateSumoPreviewReadiness(t, files.roster), /inconsistent or out of date/);
});
