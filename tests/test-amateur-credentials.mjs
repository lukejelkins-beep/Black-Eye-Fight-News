// node --test tests/test-amateur-credentials.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { build, rowsFor, badgesFor, placeOf, yearOf } from '../scripts/build-amateur-credentials.mjs';

const src = (authority = 'federation', url = 'https://example.org/results') => [{ name: 'Official results', url, authority }];
const claim = (o = {}) => ({ kind: 'team_appearance', edition: '2019 World Wrestling Championships', sport: 'Wrestling',
  event: "Men's freestyle 125 kg", delegation: 'MDA', category: 'senior', result: '8th', medal: 'none', sources: src(), ...o });
const record = (lanes, slug = 'test-fighter') => ({ slug, identity: { url: 'https://www.ufc.com/athlete/' + slug, summary: '' }, lanes });

test('years and places come from the edition and result', () => {
  assert.equal(yearOf('Tokyo 2020'), 2020);
  assert.equal(yearOf('Rio 2016'), 2016);
  assert.equal(placeOf({ medal: 'gold', result: 'Gold medallist' }), 1);
  assert.equal(placeOf({ medal: 'none', result: '21st; lost his qualification bout' }), 21);
  assert.equal(placeOf({ medal: 'none', result: 'Seventh of eight after a quarterfinal' }), 7);
  assert.equal(placeOf({ medal: null, result: 'Competed' }), null);
});

test('only verified competition appearances with an official https source are published', () => {
  const rows = rowsFor(record({
    national: { state: 'seed', claims: [
      claim(),
      claim({ kind: 'team_selected', edition: '2021 Entry list' }),
      claim({ kind: 'squad_member', edition: '2025 Squad' }),
      claim({ edition: '2018 Europeans', sources: src('news') }),
      claim({ edition: '2017 Europeans', sources: src('federation', 'http://insecure.example/results') }),
    ] },
    olympic: { state: 'needs_review', claims: [claim({ kind: 'games_participation', edition: 'Paris 2024' })] },
  }));
  assert.deepEqual(rows.map(r => r.edition), ['2019 World Wrestling Championships']);
  assert.equal(rows[0].country, 'Moldova');
  assert.equal(rows[0].place, 8);
  assert.equal(rows[0].medal, null);
});

test('badges: Olympic gold is highlighted, age-group worlds are labelled junior, team level follows the category', () => {
  const rows = rowsFor(record({
    olympic: { state: 'seed', claims: [claim({ kind: 'games_participation', edition: 'Tokyo 2020', medal: 'gold', result: 'Gold', delegation: 'USA' })] },
    national: { state: 'seed', claims: [
      claim({ edition: '2015 Cadet World Wrestling Championships', category: 'cadet', medal: 'gold', result: '1st', delegation: 'USA' }),
      claim({ edition: '2017 Junior World Wrestling Championships', category: 'junior', medal: 'gold', result: '1st', delegation: 'USA' }),
      claim({ edition: '2021 Pan-American Wrestling Championships', medal: 'gold', result: '1st', delegation: 'USA' }),
    ] },
  }));
  const badges = badgesFor(rows);
  assert.deepEqual(badges.map(b => b.label), ['Olympic champion', 'Junior world titles ×2', 'Pan-American champion']);
  assert.equal(badges[0].highlight, true);
  assert.equal(badges.length <= 3, true);

  const youth = badgesFor(rowsFor(record({ national: { state: 'seed', claims: [claim({ category: 'cadet', delegation: 'JPN', result: '21st' })] } })));
  assert.deepEqual(youth.map(b => b.label), ['Japan youth team']);
});

test('build skips fighters with nothing publishable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'befn-am-'));
  writeFileSync(join(dir, 'a.json'), JSON.stringify(record({ national: { state: 'seed', claims: [claim()] } }, 'a')));
  writeFileSync(join(dir, 'b.json'), JSON.stringify(record({ national: { state: 'needs_review', claims: [], note: 'x' } }, 'b')));
  const out = build(dir);
  assert.deepEqual(Object.keys(out.fighters), ['a']);
  assert.equal(out.schema, 1);
});

test('committed data file matches the research records', () => {
  const committed = JSON.parse(readFileSync(new URL('../data/ufc-amateur-credentials.json', import.meta.url), 'utf8'));
  assert.deepEqual(committed, build());
});

test('page module escapes text and drops non-https source links', () => {
  const code = readFileSync(new URL('../assets/amateur-credentials.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(code, { window, fetch: () => Promise.reject(new Error('offline')) });
  const html = window.BEFNAmateur.sectionHTML({ rows: [
    { edition: '<img src=x onerror=alert(1)>', sport: 'Judo', year: 2012, event: 'Men -60 kg', country: 'Wales', medal: 'bronze', place: 3,
      result: 'Bronze', source: { name: 'Official', url: 'javascript:alert(1)' } },
  ] });
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('is-bronze'));
  const badges = window.BEFNAmateur.badgesHTML({ badges: [{ label: 'Olympic champion', medal: 'gold', highlight: true }] });
  assert.ok(badges.includes('is-highlight') && badges.includes('is-gold'));
  assert.equal(window.BEFNAmateur.slugOf({ name: 'José Aldo' }), 'jose-aldo');
  assert.equal(window.BEFNAmateur.slugOf({ name: "Sean O'Malley", statsSlug: 'sean-omalley' }), 'sean-omalley');
});
