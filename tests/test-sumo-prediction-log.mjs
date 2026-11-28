import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordPicks, scoreLog, summary, emptyLog } from '../assets/sumo-prediction-log.mjs';
import { asDetails } from '../assets/sumo-review-data.mjs';
import { asOfDay } from '../assets/sumo-live-data.mjs';
import { bashoPredictions } from '../assets/sumo-predict.mjs';

const json = p => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const model = json('data/sumo/predictor.json');
/* A pretend live January: November 2026's banzuke and bouts under the next basho's id. */
const full = { ...asDetails(json('data/sumo/basho-archive/202611.json')), bashoId: '202701' };
/* The snapshot the live refresh would hold on the evening of day d-1: results through d-1, day d's torikumi announced. */
function evening(d) {
  const s = d > 1 ? asOfDay(full, d - 1) : asOfDay(full, 0);
  s.bashoId = '202701'; s.announcedDay = d; s.torikumi = {};
  for (const division of ['Makuuchi', 'Juryo']) {
    const rows = [...full.banzuke[division].data.east, ...full.banzuke[division].data.west];
    const t = rows.flatMap(r => { const b = r.record[d - 1]; return b && b.result === 'win' ? [{ bashoId: '202701', division, day: d, eastId: r.rikishiID, westId: b.opponentID, winnerId: 0, eastShikona: r.shikonaEn, westShikona: b.opponentShikonaEn, matchNo: 1 }] : []; });
    s.torikumi[division] = { status: 'available', data: { date: '202701', torikumi: t } };
  }
  return s;
}

test('a whole basho: picks saved each evening, never changed, scored after, matching the live replay', () => {
  let log = emptyLog();
  const frozen = {};
  for (let d = 1; d <= 15; d++) {
    const ev = evening(d);
    const r = recordPicks(log, ev, model, { now: new Date(Date.UTC(2027, 0, 9 + d, 10)) });
    assert.deepEqual(r.saved, ['Makuuchi', 'Juryo'], 'day ' + d + ': ' + r.reason);
    const again = JSON.stringify(log);
    assert.deepEqual(recordPicks(log, ev, model).saved, [], 'a saved day is not saved twice');
    assert.equal(JSON.stringify(log), again);
    frozen[d] = JSON.stringify(log.basho['202701'].days[d].Makuuchi.picks.map(p => p.p));
    /* Results of day d come in: score them. */
    const after = asOfDay(full, d); after.bashoId = '202701';
    scoreLog(log, after);
  }
  /* Scoring never touched a chance. */
  for (let d = 1; d <= 15; d++) assert.equal(JSON.stringify(log.basho['202701'].days[d].Makuuchi.picks.map(p => p.p)), frozen[d]);
  /* Saved chances equal the live replay's for the same bouts (rounded to 4 places). */
  const live = new Map(bashoPredictions(full, model).map(q => [q.day + ':' + q.a.rikishiID + ':' + q.b.rikishiID, q.p]));
  let n = 0;
  for (const [d, D] of Object.entries(log.basho['202701'].days)) for (const pk of D.Makuuchi.picks) {
    const p = live.get(d + ':' + pk.a + ':' + pk.b);
    if (p == null) continue; n++;
    assert.ok(Math.abs(p - pk.p) < 6e-5, d + ':' + pk.a + ':' + pk.b);
  }
  assert.ok(n > 280);
  const S = summary(log);
  assert.equal(S.total.Makuuchi.pending, 0);
  assert.ok(S.total.Makuuchi.bouts > 280 && S.total.Juryo.bouts > 180);
  assert.ok(S.total.Makuuchi.rate > 0.45 && S.total.Makuuchi.rate < 0.8);
  assert.equal(S.basho.length, 1);
  assert.equal(S.latest.day, 15);
});

test('too late: once any bout of the announced day is fought, that day is not saved', () => {
  const ev = evening(5);
  const half = asOfDay(full, 5); /* day 5 results already in */
  Object.assign(ev, { banzuke: half.banzuke });
  const r = recordPicks(emptyLog(), ev, model);
  assert.deepEqual(r.saved, []);
  assert.match(r.reason, /started|not all in/);
});

test('a missing day of results blocks saving (the morning state would be incomplete)', () => {
  const ev = evening(6);
  const stale = asOfDay(full, 4); /* results only through day 4 */
  Object.assign(ev, { banzuke: stale.banzuke });
  const r = recordPicks(emptyLog(), ev, model);
  assert.deepEqual(r.saved, []);
  assert.match(r.reason, /not all in/);
});

test('outside a basho nothing is saved, and the committed log starts empty', () => {
  const r = recordPicks(emptyLog(), json('data/sumo/preview-details.json'), model);
  assert.deepEqual(r.saved, []);
  const log = json('data/sumo/prediction-log.json');
  assert.equal(log.schemaVersion, 1);
  const S = summary(log);
  assert.equal(S.total.Makuuchi.bouts + S.total.Makuuchi.pending, Object.values(log.basho).reduce((s, b) => s + Object.values(b.days).reduce((t, D) => t + (D.Makuuchi?.picks.length || 0), 0), 0));
});
