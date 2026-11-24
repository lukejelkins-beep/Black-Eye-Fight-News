import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { completedDay, through, titleRace, dayHighlights, recap, asOfDay } from '../assets/sumo-live-data.mjs';
import { renderLiveHome, dayByDay } from '../assets/sumo-live.mjs';
import { asDetails } from '../assets/sumo-review-data.mjs';
import { position, tierOf } from '../assets/sumo-home-data.mjs';

const details = JSON.parse(readFileSync(new URL('../data/sumo/preview-details.json', import.meta.url), 'utf8'));
const archive = JSON.parse(readFileSync(new URL('../data/sumo/basho-archive/202611.json', import.meta.url), 'utf8'));
const h = { e: s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'), head: () => '', cutout: () => '', known: () => true };

test('replaying November: completed day and records cut back correctly', () => {
  for (const day of [1, 5, 10, 15]) {
    const d = asOfDay(details, day);
    assert.equal(completedDay(d), day);
    const onosato = d.banzuke.Makuuchi.data.east.find(r => r.shikonaEn === 'Onosato');
    assert.equal(onosato.wins + onosato.losses, day);
  }
  assert.deepEqual(through({ record: [{ result: 'win' }, { result: 'fusen win' }, { result: 'absent' }, { result: 'fusen loss' }, null] }, 5), { w: 2, l: 2 });
});

test('title race: leaders have the fewest losses; chasers one and two behind', () => {
  const r = titleRace(asOfDay(details, 10), 10);
  assert.deepEqual(r.leaders.map(x => x.name).sort(), ['Atamifuji', 'Wakamotoharu']);
  assert.ok(r.leaders.every(x => x.l === 1) && r.one.every(x => x.l === 2) && r.two.every(x => x.l === 3));
  for (const x of r.leaders) assert.ok(!x.notMet.some(o => o.id === x.id));
  assert.equal(titleRace(asOfDay(details, 1), 1).leaders[0].notMet.length, 0, 'no still-to-face lists on day 1');
});

test('highlights: upset winner is always the lower rank; kinboshi only Maegashira over Yokozuna', () => {
  for (let day = 1; day <= 15; day++) {
    const hi = dayHighlights(asOfDay(details, day), day);
    if (hi.upset) assert.ok(position(hi.upset.winner.rank) > position(hi.upset.loser.rank));
    for (const k of hi.kinboshi) { assert.equal(tierOf(k.winner.rank), 'Maegashira'); assert.equal(tierOf(k.loser.rank), 'Yokozuna'); }
  }
  assert.deepEqual(dayHighlights(asOfDay(details, 8), 8).kinboshi.map(k => k.winner.name), ['Hakunofuji']);
});

test('day 15 tie: a playoff decides while live; the winner is named once the title is known', () => {
  assert.match(recap(asOfDay(details, 15), 15).text, /a playoff decides the title/);
  assert.match(recap(asDetails(archive, null), 15).text, /Onosato won the playoff for the title/);
});

test('live home and day-by-day render with one h1, escaped names and a preview label', () => {
  const d = asOfDay(details, 10);
  const html = renderLiveHome({ bashoId: d.bashoId, preview: true, recap: recap(d, 10), sanyakuView: { sanyaku: [], watch: { next: { month: 'January' } } } }, h);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /Preview: November 2026 replayed as of day 10/);
  assert.match(html, /data-recap-copy/);
  const pre = renderLiveHome({ bashoId: '202701', recap: null }, h);
  assert.match(pre, /Day 1 is Sunday 10 January/);
  const days = dayByDay(h, [1, 2, 3].map(n => recap(asOfDay(details, n), n)));
  assert.equal((days.match(/data-recap-panel/g) || []).length, 3);
});
