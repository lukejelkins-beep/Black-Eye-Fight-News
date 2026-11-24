import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as H from '../assets/sumo-home-data.mjs';
import { renderHome } from '../assets/sumo-home.mjs';

const j = f => JSON.parse(readFileSync(new URL('../data/sumo/' + f, import.meta.url), 'utf8'));
const details = j('preview-details.json'), careerHistory = j('career-history.json'), roster = j('rikishi-index.json'), editorial = j('fun-facts-editorial.json');
const home = H.buildHome({ details, careerHistory, roster, editorial, now: new Date('2026-11-24T00:00:00Z') });

test('rank helpers', () => {
  assert.equal(H.shortRank('Maegashira 3 West'), 'M3W');
  assert.equal(H.plainRank('Komusubi 1 East'), 'Komusubi');
  assert.equal(H.plainRank('Juryo 6 East'), 'Juryo 6');
  assert.ok(H.position('Yokozuna 1 East') < H.position('Maegashira 1 East'));
  assert.ok(H.position('Maegashira 17 West') < H.position('Juryo 1 East'));
  assert.deepEqual(H.nextBasho('202611'), { id: '202701', month: 'January', venue: 'Tokyo' });
});

test('headline: champion, record and the bouts he lost come from the snapshot', () => {
  const c = home.headline.champion;
  const yusho = details.basho.data.yusho.find(y => y.type === 'Makuuchi');
  assert.equal(c.id, yusho.rikishiId);
  const row = H.rows(details.banzuke).find(r => r.rikishiID === c.id);
  assert.equal(c.wins, row.wins);
  assert.equal(c.lostTo.length, row.losses);
});

test('kinboshi: only Maegashira wins over a Yokozuna, never fusen', () => {
  assert.ok(home.kinboshi.length > 0);
  for (const k of home.kinboshi) assert.equal(H.tierOf(k.rank), 'Maegashira');
  const fake = { banzuke: { Makuuchi: { data: { east: [
    { rikishiID: 1, shikonaEn: 'Y', rank: 'Yokozuna 1 East', record: [] },
    { rikishiID: 2, shikonaEn: 'M', rank: 'Maegashira 1 East', record: [{ result: 'fusen win', opponentID: 1 }, { result: 'win', opponentID: 1, kimarite: 'yorikiri' }] },
    { rikishiID: 3, shikonaEn: 'S', rank: 'Sekiwake 1 East', record: [{ result: 'win', opponentID: 1 }] }], west: [] } } } };
  const k = H.kinboshi(fake);
  assert.equal(k.length, 1);
  assert.equal(k[0].day, 2);
});

test('kadoban and demotion follow the previous basho', () => {
  const mk = (prevWins, wins) => H.sanyaku({
    previousBanzuke: { Makuuchi: { data: { east: [{ rikishiID: 5, shikonaEn: 'O', rank: 'Ozeki 1 East', wins: prevWins, losses: 15 - prevWins }], west: [] } } },
    banzuke: { Makuuchi: { data: { east: [{ rikishiID: 5, shikonaEn: 'O', rank: 'Ozeki 1 East', wins, losses: 15 - wins }], west: [] } } } })[0].flag;
  assert.equal(mk(9, 7), 'kadoban');
  assert.equal(mk(6, 7), 'demoted');
  assert.equal(mk(6, 8), null);
});

test('movers name the line crossed; sanyaku moves come first', () => {
  const up = home.movers.up;
  assert.ok(up.length && /sanyaku/i.test(up[0].note), JSON.stringify(up[0]));
  for (const m of [...up, ...home.movers.down]) assert.ok(!/places/.test(m.note), 'no estimated place counts');
});

test('rising stars climbed and are at Juryo or above, or Makushita 1-10', () => {
  assert.ok(home.rising.length > 0);
  for (const r of home.rising) {
    assert.ok(H.position(r.from) > H.position(r.to));
    const p = H.parseRank(r.to);
    assert.ok(H.isMakuuchi(r.to) || p.tier === 'Juryo' || (p.tier === 'Makushita' && p.number <= 10));
  }
});

test('watch list reads the records the stated way', () => {
  for (const x of home.watch.atRisk) assert.ok(H.parseRank(x.rank).number >= 12 && Number(x.record.split('–')[0]) < 8);
  for (const x of home.watch.knocking) assert.equal(H.tierOf(x.rank), 'Makushita');
});

test('fact of the basho uses a verified family link only when both took an honour', () => {
  if (home.fact?.kind === 'family') {
    const item = editorial.items.find(i => i.memberIds.map(Number).join() === home.fact.ids.join());
    assert.ok(item && item.sourceUrl);
  }
  assert.equal(H.factOfTheBasho({ basho: { data: { yusho: [] } }, banzuke: {}, previousBanzuke: {} }, editorial), null);
});

test('rendered page escapes names and links each wrestler to a profile', () => {
  const html = renderHome(home, { e: s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'), head: () => '', cutout: () => '' });
  assert.match(html, /<h1>/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /href="#profile\/\d+"/);
  assert.match(html, /Sanyaku scorecard/);
  const evil = structuredClone(home);
  evil.headline.champion.name = '<img onerror=x>';
  assert.doesNotMatch(renderHome(evil, { e: s => String(s).replace(/</g, '&lt;'), head: () => '', cutout: () => '' }), /<img onerror/);
});

test('during a basho the page does not name a champion', () => {
  const live = { ...home, finished: false };
  const html = renderHome(live, { e: s => String(s), head: () => '', cutout: () => '' });
  assert.match(html, /in progress/);
  assert.doesNotMatch(html, /Champions and prizes/);
  assert.match(html, /If it ended today/);
});
