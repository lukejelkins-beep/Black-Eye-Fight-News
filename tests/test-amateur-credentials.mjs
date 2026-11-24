// node --test tests/test-amateur-credentials.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { build, rowsFor, badgesFor, placeOf, yearOf, grapplingRows, tables } from '../scripts/build-amateur-credentials.mjs';

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
  const out = build(dir, null);
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

test('grappling rows: only verified fighters, adult or juvenile divisions, matching names, https sources', () => {
  const dir = mkdtempSync(join(tmpdir(), 'befn-bjj-'));
  writeFileSync(join(dir, 'profile-verified.json'), JSON.stringify({
    'adcc-results.md': { placements: ['ada-lee'], entries: ['bo-kim'] },
    'ibjjf-world-results.md': ['ada-lee'], 'ibjjf-majors-results.md': ['ada-lee'],
  }));
  writeFileSync(join(dir, 'adcc-results.md'), [
    '| Fighter slug | Edition | Division | Placement | Source |', '| --- | --- | --- | --- | --- |',
    '| ada-lee | 2019 | Women -60 kg | Gold | [ADCC](https://adcombat.com/r) |',
    '| zed-roe | 2019 | Men -77 kg | Gold | [ADCC](https://adcombat.com/r) |', '',
    '| Fighter slug | Edition | Division | What is documented | Sources |', '| --- | --- | --- | --- | --- |',
    '| bo-kim | 2026 Worlds | Men -66 kg | Invited (KOR). Competed: lost in the round of 16 | [ADCC list](https://adcombat.com/l) |',
    '| bo-kim | 2019 Worlds | Men -66 kg | Qualified; bout not yet checked | [ADCC list](https://adcombat.com/l) |',
  ].join('\n'));
  writeFileSync(join(dir, 'ibjjf-world-results.md'), [
    '| Fighter slug | Event | Division | Place | Published name | Academy | Source |', '| --- | --- | --- | ---: | --- | --- | --- |',
    '| ada-lee | 2015 Gi Worlds | Female / Adult / Black / Light | 1 | Ada Lee | Team | [IBJJF](https://ibjjf.com/e/1) |',
    '| ada-lee | 2016 Gi Worlds | Female / Master 1 / Black / Light | 1 | Ada Lee | Team | [IBJJF](https://ibjjf.com/e/2) |',
    '| ada-lee | 2017 Gi Worlds | Female / Adult / Black / Light | 2 | Adriana Leeson | Team | [IBJJF](https://ibjjf.com/e/3) |',
  ].join('\n'));
  writeFileSync(join(dir, 'ibjjf-majors-results.md'), [
    '| Fighter slug | Identity | Event | Division | Place | Published name | Academy | Source |', '| --- | --- | --- | --- | ---: | --- | --- | --- |',
    '| ada-lee | Provisional | 2014 Pan Championship | Female / Adult / Brown / Light | 1 | Ada Lee | Team | [IBJJF](https://ibjjf.com/e/4) |',
    '| ada-lee | Corroborated | 2013 Pan Championship | Female / Juvenile 2 / Purple / Light | 3 | Ada Lee | Team | [IBJJF](http://ibjjf.com/e/5) |',
    '| ada-lee | Corroborated (gym: Team) | 2012 Pan Championship | Female / Adult / Purple / Light | 2 | Ada Maria Lee Santos | Team | [IBJJF](https://ibjjf.com/e/6) |',
    '| ada-lee | Corroborated (gym: Team) | 2011 Pan Championship | Female / Adult / Purple / Light | 2 | Bea Lee | Team | [IBJJF](https://ibjjf.com/e/7) |',
  ].join('\n'));
  const rows = grapplingRows({ 'ada-lee': 'Ada Lee', 'bo-kim': 'Bo Kim', 'zed-roe': 'Zed Roe' }, dir);
  assert.deepEqual(Object.keys(rows).sort(), ['ada-lee', 'bo-kim']);
  assert.deepEqual(rows['ada-lee'].map(r => r.edition), ['2019 ADCC World Championship', '2015 Gi Worlds (IBJJF)', '2012 Pan Championship (IBJJF)']);
  assert.equal(rows['ada-lee'][1].belt, 'black');
  assert.deepEqual(rows['bo-kim'].map(r => [r.edition, r.medal]), [['2026 ADCC World Championship', null]]);
  const badges = badgesFor(rows['ada-lee']).map(b => b.label);
  assert.deepEqual(badges, ['ADCC world champion', 'BJJ world champion']);
  assert.deepEqual(badgesFor(rows['bo-kim']).map(b => b.label), ['ADCC Worlds competitor']);
  assert.equal(tables('| a | b |\n| - | - |\n| 1 | 2 |')[0].rows[0].b, '2');
});

test('long careers fold after eight rows', () => {
  const code = readFileSync(new URL('../assets/amateur-credentials.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(code, { window, fetch: () => Promise.reject(new Error('offline')) });
  const rows = Array.from({ length: 12 }, (_, i) => ({ edition: 'E' + i, sport: 'Brazilian jiu-jitsu', year: 2000 + i, event: 'Adult', medal: 'gold', place: 1, belt: 'black', source: { name: 'IBJJF', url: 'https://ibjjf.com' } }));
  const html = window.BEFNAmateur.sectionHTML({ rows });
  assert.ok(html.includes('Show all 12 results'));
  assert.equal((html.match(/befn-am-row/g) || []).length, 12);
  assert.ok(html.includes('befn-am-belt is-black'));
});
