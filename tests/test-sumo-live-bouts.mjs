import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { completedBouts, applyLiveBouts } from '../scripts/sumo-apply-live-bouts.mjs';

const row = (id, name, record) => ({ rikishiID: id, shikonaEn: name, record });
const rec = (result, id, name, kimarite) => ({ result, opponentID: id, opponentShikonaEn: name, kimarite });
function mini() {
  const details = { bashoId: '202611', banzuke: { Makuuchi: { data: {
    east: [row(1, 'Alpha', [rec('win', 2, 'Beta', 'yorikiri'), rec('loss', 3, 'Gamma', 'oshidashi'), rec('', 0, '', '')])],
    west: [row(2, 'Beta', [rec('loss', 1, 'Alpha', 'yorikiri'), rec('', 0, '', '')]), row(3, 'Gamma', [rec('', 0, '', ''), rec('win', 1, 'Alpha', 'oshidashi')])]
  } } } };
  const profile = n => ({ name: n, careerWins: 10, careerLosses: 5, recentPerformance: [], kimarite: { wins: [{ kimarite: 'oshidashi', count: 2 }], losses: [] }, opponentCount: 0 });
  const files = {
    roster: { rikishi: [{ sourceId: 1 }, { sourceId: 2 }, { sourceId: 3 }] },
    summary: { profiles: { 1: profile('Alpha'), 2: profile('Beta'), 3: profile('Gamma') }, activePairs: {} },
    opponents: { profiles: { 1: [], 2: [], 3: [] } }, history: { pairs: {} },
    divisions: { bySourceId: { 1: { status: 'available', stats: { winsByDivision: { Makuuchi: 4 }, lossByDivision: {} } } } }
  };
  return { details, files };
}

test('each completed bout is found once even though both wrestlers record it', () => {
  const bouts = completedBouts(mini().details);
  assert.deepEqual(bouts.map(b => [b.day, b.winnerId]), [[1, 1], [2, 3]]);
});

test('applying bouts updates career, series, opponents, recent form and techniques', () => {
  const { details, files } = mini();
  assert.equal(applyLiveBouts(files, completedBouts(details)), 2);
  assert.deepEqual([files.summary.profiles[1].careerWins, files.summary.profiles[1].careerLosses], [11, 6]);
  assert.deepEqual([files.summary.profiles[2].careerWins, files.summary.profiles[2].careerLosses], [10, 6]);
  assert.deepEqual(files.summary.profiles[1].recentPerformance.map(r => [r.day, r.outcome, r.opponentName]), [[2, 'loss', 'Gamma'], [1, 'win', 'Beta']]);
  assert.deepEqual(files.summary.profiles[3].kimarite.wins[0], { kimarite: 'oshidashi', count: 3 });
  assert.equal(files.history.pairs['1:2'].winsA, 1);
  assert.equal(files.summary.activePairs['1:3'].total, 1);
  assert.deepEqual(files.opponents.profiles[1].map(o => [o.id, o.wins, o.losses, o.meetings]), [[2, 1, 0, 1], [3, 0, 1, 1]]);
  assert.equal(files.divisions.bySourceId[1].stats.winsByDivision.Makuuchi, 5);
});

test('re-applying the same bouts changes nothing', () => {
  const { details, files } = mini();
  applyLiveBouts(files, completedBouts(details));
  const once = JSON.stringify(files);
  assert.equal(applyLiveBouts(files, completedBouts(details)), 0);
  assert.equal(JSON.stringify(files), once);
});

test('a snapshot that already holds a day is not double counted', () => {
  const { details, files } = mini();
  files.history.pairs['1:2'] = { a: 1, b: 2, winsA: 1, winsB: 0, regular: [['202611', 1, 1, 'yorikiri', 'Makuuchi', 7, 'regular']], special: [] };
  assert.equal(applyLiveBouts(files, completedBouts(details)), 1);
  assert.equal(files.summary.profiles[1].careerWins, 10);
});

test('real data: applying the stored basho bouts twice is stable', () => {
  const L = f => JSON.parse(readFileSync(new URL('../data/sumo/' + f + '.json', import.meta.url), 'utf8'));
  const files = { roster: L('rikishi-index'), summary: L('research-h2h-summary'), opponents: L('research-h2h-opponents'), history: L('research-h2h-history'), divisions: L('division-stats') };
  const bouts = completedBouts(L('preview-details'));
  applyLiveBouts(files, bouts);
  assert.equal(applyLiveBouts(files, bouts), 0);
});

test('a win in a division with no earlier record also creates the matching loss entry at 0', () => {
  const { details, files } = mini();
  files.divisions.bySourceId[1].stats = { winsByDivision: { Makushita: 3 }, lossByDivision: { Makushita: 1 } };
  applyLiveBouts(files, completedBouts(details).slice(0, 1));
  const { winsByDivision, lossByDivision } = files.divisions.bySourceId[1].stats;
  assert.equal(winsByDivision.Makuuchi, 1);
  assert.equal(lossByDivision.Makuuchi, 0);
});
