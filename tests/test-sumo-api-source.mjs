import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUMO_API_BASE, createSumoClient, validateRikishiPage, collectRoster, buildRikishiIndex
} from '../scripts/sumo-api-source.mjs';

const sample = [
  { id: 2, nskId: 3682, sumodbId: 12291, shikonaEn: 'Asanoyama', shikonaJp: '朝乃山', currentRank: 'Maegashira 10 East', height: 188, weight: 170 },
  { id: 3, nskId: 4187, shikonaEn: 'Hakunofuji', currentRank: 'Maegashira 3 West' },
  { id: 4, shikonaEn: 'Sample Third', currentRank: 'Juryo 2 East' }
];
function mockApi(options = {}) {
  const urls = [];
  const fetchImpl = async (url, request) => {
    urls.push(url);
    assert.equal(request.method, 'GET');
    const u = new URL(url);
    assert.equal(u.origin, 'https://www.sumo-api.com');
    if (u.pathname === '/api/rikishis') {
      const offset = Number(u.searchParams.get('skip'));
      const limit = Number(u.searchParams.get('limit'));
      const obj = { total: sample.length, skip: offset, limit, records: sample.slice(offset, offset + limit) };
      return { ok: true, status: 200, text: async () => JSON.stringify(options.badPage || obj) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ rikishiId: 2, totalWins: 1 }) };
  };
  return { client: createSumoClient({ fetchImpl, maxCalls: 12 }), urls };
}
test('build-time adapter uses official upstream rather than discovery directory', () => {
  assert.equal(SUMO_API_BASE, 'https://www.sumo-api.com/api');
});
test('rikishi list validates authoritative ID and name', async () => {
  const { client, urls } = mockApi();
  const page = validateRikishiPage(await client.listRikishi({ limit: 2 }));
  assert.equal(page.records[0].id, 2);
  assert.match(urls[0], /limit=2&skip=0/);
});
test('invalid IDs, arbitrary division, invalid tournament and basho day fail closed', async () => {
  const { client, urls } = mockApi();
  await assert.rejects(client.stats('../admin'), /Invalid sumo rikishi ID/);
  await assert.rejects(client.basho('202612'), /Invalid basho ID/);
  await assert.rejects(client.banzuke('202611', 'random'), /Invalid sumo division/);
  await assert.rejects(client.torikumi('202611', 'Makuuchi', 16), /Invalid basho day/);
  await assert.rejects(client.listRikishi({ limit: 5000 }), /limit must be/);
  await assert.rejects(client.kimariteBouts('../../../etc'), /Invalid kimarite/);
  assert.equal(urls.length, 0);
});
test('collector paginates and certifies exact total without truncation', async () => {
  const { client, urls } = mockApi();
  const rows = await collectRoster(client, { pageSize: 2, maxPages: 2 });
  assert.deepEqual(rows.map(r => r.id), [2, 3, 4]);
  assert.equal(urls.length, 2);
  const derived = buildRikishiIndex(rows, '2026-11-14T00:00:00Z');
  assert.equal(derived.count, 3);
  assert.equal(derived.rikishi[0].heightCm, 188);
  assert.equal(derived.rikishi[1].weightKg, null);
  assert.equal(derived.rikishi[0].officialNskId, 3682);
});
test('collector rejects incomplete pagination', async () => {
  const { client } = mockApi();
  await assert.rejects(collectRoster(client, { pageSize: 2, maxPages: 1 }), /Incomplete rikishi roster/);
});
test('collector does not accept malformed response or missing identities', async () => {
  assert.throws(() => validateRikishiPage({ total: 2 }), /Unusable rikishi list/);
  assert.throws(() => validateRikishiPage({ total: 1, records: [{id: 0, shikonaEn: ''}] }), /Unusable rikishi identity/);
});
test('per-process budget limits upstream calls', async () => {
  const client = createSumoClient({ fetchImpl: async () => ({ok: true, text: async () => '{}'}), maxCalls: 1 });
  await client.kimarite();
  await assert.rejects(client.kimarite(), /request budget exhausted/);
});
test('explicit 429 is a failure, not an empty roster', async () => {
  const client = createSumoClient({ fetchImpl: async () => ({ok: false, status: 429}), maxCalls: 1 });
  await assert.rejects(client.listRikishi(), /HTTP 429/);
});
test('bad upstream JSON cannot overwrite a local snapshot', async () => {
  const client = createSumoClient({ fetchImpl: async () => ({ok: true, text: async () => '<html>denied</html>'}), maxCalls: 1 });
  await assert.rejects(client.listRikishi(), /did not return a JSON object/);
});
