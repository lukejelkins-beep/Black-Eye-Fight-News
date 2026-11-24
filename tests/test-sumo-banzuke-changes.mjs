import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildChanges, winning, tableRows } from '../assets/sumo-banzuke-changes.mjs';
import { renderChanges, releaseCard } from '../assets/sumo-banzuke-view.mjs';
import { position, bashoStart } from '../assets/sumo-home-data.mjs';
import { isPublished, nextBashoId } from '../scripts/sumo-check-banzuke-release.mjs';
import { bashoStart as calendarStart } from '../scripts/sumo-basho-calendar.mjs';
import { DATA_DIRS } from '../scripts/build-site.mjs';

const A = id => JSON.parse(readFileSync(new URL('../data/sumo/basho-archive/' + id + '.json', import.meta.url), 'utf8'));
const ch = JSON.parse(readFileSync(new URL('../data/sumo/career-history.json', import.meta.url), 'utf8'));
const h = { e: s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'), head: () => '', cutout: () => '', known: () => true, releases: ['202611', '202609'] };

test('winning record: more than half the division’s bouts; absences count against', () => {
  assert.equal(winning({ rank: 'Maegashira 3 East', wins: 8, losses: 7 }), true);
  assert.equal(winning({ rank: 'Maegashira 3 East', wins: 7, losses: 3, absences: 5 }), false);
  assert.equal(winning({ rank: 'Makushita 3 East', wins: 4, losses: 3 }), true);
});

test('July 2026: Aonishiki demoted from Ozeki, Kotozakura kadoban, Kazuma a Makuuchi debut', () => {
  const c = buildChanges(A('202607'), A('202605'), ch);
  assert.deepEqual(c.headline.ozekiDown.map(m => m.name), ['Aonishiki']);
  assert.deepEqual(c.headline.kadoban.map(m => m.name), ['Kotozakura']);
  const kazuma = c.headline.intoMakuuchi.find(m => m.name === 'Kazuma');
  assert.equal(kazuma.note, 'Makuuchi debut');
  assert.ok(c.observations.some(o => o.kind === 'slots'), 'four Sekiwake is an extra sanyaku place');
});

test('every move is consistent with the two banzuke and the record', () => {
  for (const [b, p] of [['202603', '202601'], ['202605', '202603'], ['202607', '202605'], ['202609', '202607'], ['202611', '202609']]) {
    const c = buildChanges(A(b), A(p), ch);
    for (const m of c.moves) assert.equal(m.change, position(m.from) - position(m.to), b + ' ' + m.name);
    for (const m of c.climbs) assert.ok(m.change > 0);
    for (const m of c.falls) assert.ok(m.change < 0);
    const lucky = c.observations.find(o => o.kind === 'lucky');
    if (lucky) for (const m of lucky.list) assert.ok(!m.winning && m.change > 0);
    const held = c.observations.find(o => o.kind === 'unlucky');
    if (held) for (const m of held.list) assert.ok(m.winning && m.change <= 0 && /^(Komusubi|Maegashira|Juryo)/.test(m.from));
    assert.ok(tableRows(c).length >= 60, b + ' table lists Makuuchi and Juryo');
    const html = renderChanges(c, h);
    assert.equal((html.match(/<h1>/g) || []).length, 1);
  }
});

test('a published banzuke saved before the basho (ranks, no bouts) still builds', () => {
  const nov = A('202611');
  const release = { bashoId: '202701', banzuke: Object.fromEntries(Object.entries(nov.banzuke).map(([k, v]) => [k, { rows: v.rows.map(r => ({ ...r, wins: 0, losses: 0, absences: 0, record: [] })) }])) };
  const c = buildChanges(release, nov, ch);
  assert.equal(c.name, 'January 2027');
  assert.ok(c.moves.length > 150);
});

test('release watch: an unpublished banzuke (null rows) is not saved', () => {
  assert.equal(isPublished({ east: null, west: null }), false);
  assert.equal(isPublished({ east: [{ rikishiID: 1, rank: 'Yokozuna 1 East' }], west: [] }), false);
  const rows = [...Array(42)].map((_, i) => ({ rikishiID: i + 1, rank: 'Maegashira ' + (i + 1) + ' East' }));
  assert.equal(isPublished({ east: rows, west: [] }), true);
  assert.equal(nextBashoId('202611'), '202701');
});

test('countdown card: counts days to the stated Japan date, then links once out', () => {
  const next = { id: '202701' };
  const now = Date.parse('2026-11-24T00:00:00Z');
  const card = releaseCard(h, { next, date: '2026-12-21', status: 'reported', now, latest: '202611' });
  assert.match(card, /27 days/);
  assert.match(card, /confirms on the day/);
  assert.match(releaseCard(h, { next, released: true }), /href="#changes\/202701"/);
  assert.match(releaseCard(h, { next, day1: '2027-01-10', now, latest: '202611' }), /10 January/);
});

test('day 1 rule matches the existing calendar', () => {
  for (const [y, m] of [[2027, 1], [2026, 11], [2027, 3], [2026, 7]]) assert.equal(bashoStart(y, m), calendarStart(y, m));
});

test('the site build publishes the archive and release folders the pages load by computed path', () => {
  assert.ok(DATA_DIRS.includes('data/sumo/basho-archive'));
  assert.ok(DATA_DIRS.includes('data/sumo/banzuke-release'));
});
