import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build, referencedDataFiles, DATA_DIRS, OPTIONAL_DATA } from '../scripts/build-site.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const out = mkdtempSync(join(tmpdir(), 'befn-dist-'));
const report = build(ROOT, out);

test('reader pages and app files are published', () => {
  for (const name of ['index.html', 'privacy.html', 'terms.html', 'manifest.webmanifest', 'sw.js', 'robots.txt']) {
    assert.ok(existsSync(join(out, name)), name);
  }
  assert.ok(existsSync(join(out, 'assets', 'upcoming-cards.js')));
  assert.ok(existsSync(join(out, 'push', 'OneSignalSDKWorker.js')));
});

test('every data file a page requests is published', () => {
  const refs = referencedDataFiles(ROOT).filter(ref => existsSync(join(ROOT, ref)));
  assert.ok(refs.includes('data/results.json'));
  assert.ok(refs.includes('data/upcoming-cards.json'));
  for (const ref of refs) assert.ok(existsSync(join(out, ref)), ref);
});

test('no required data file is missing from the real build', () => {
  assert.deepEqual(report.missing, [], 'referenced but missing: ' + report.missing.join(', '));
});

test('a missing required feed is reported; an optional one is not', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'befn-fixture-'));
  const fixtureOut = join(fixture, 'dist');
  try {
    mkdirSync(join(fixture, 'data'));
    writeFileSync(join(fixture, 'data', 'present.json'), '{}');
    const optional = [...OPTIONAL_DATA.keys()].find(ref => !ref.includes('YYYY'));
    writeFileSync(join(fixture, 'index.html'),
      `<script>fetch('data/present.json');fetch('data/required.json');fetch('${optional}')</script>`);
    const r = build(fixture, fixtureOut);
    assert.deepEqual(r.missing, ['data/required.json']);
    assert.deepEqual(r.optionalMissing, [optional]);
    assert.ok(existsSync(join(fixtureOut, 'data', 'present.json')));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('every OPTIONAL_DATA entry has a reason', () => {
  for (const [ref, reason] of OPTIONAL_DATA) assert.ok(reason && reason.length > 10, ref);
});

test('internal files and research data stay off the public site', () => {
  for (const path of ['AGENTS.md', 'CLAUDE.md', 'README.md', '.github', 'docs', 'qa', 'scripts', 'tests', 'threads-review', 'package.json',
    'data/ufc-research-archive.json', 'data/ufcalendar-fighter-research.json', 'data/ufc-research-workers']) {
    assert.ok(!existsSync(join(out, path)), path + ' must not be published');
  }
  // A folder under data/ is legitimate two ways: it is copied whole from DATA_DIRS, or it
  // exists because a page asks for a file inside it (data/sumo/*.json, say) and only those
  // referenced files are copied. Anything else is a folder nobody asked to publish.
  const allowedDirs = new Set([
    ...DATA_DIRS.map(dir => dir.split('/')[1]),
    ...referencedDataFiles(ROOT).map(ref => ref.split('/')).filter(parts => parts.length > 2).map(parts => parts[1]),
  ]);
  const published = readdirSync(join(out, 'data'));
  assert.ok(published.every(name => name.endsWith('.json') || allowedDirs.has(name)), published.join(', '));
  // 44 -> 45 on 28 Nov 2026: data/ufc-fighter-gyms.json (UFC profile "Trains at" line) is a referenced file.
  assert.ok(published.filter(name => name.endsWith('.json')).length <= 45, 'only referenced data files are published');
  // Widening allowedDirs must not let a research file ride along inside a published folder:
  // only the files a page actually asks for are copied.
  for (const ref of ['data/sumo/official-portrait-research.json', 'data/sumo/portrait-intake-status.json']) {
    if (existsSync(join(ROOT, ref))) assert.ok(!existsSync(join(out, ref)), ref + ' must not be published');
  }
});

test('derived per-fighter statistics are published, JSON only', () => {
  const stats = join(out, 'data', 'ufc-stats');
  if (!existsSync(join(ROOT, 'data', 'ufc-stats'))) return;
  assert.ok(existsSync(join(stats, 'names.json')));
  const fighters = readdirSync(join(stats, 'fighters'));
  assert.ok(fighters.length > 500, 'fighter files are requested by computed path and must be copied');
  assert.ok(fighters.every(name => name.endsWith('.json')));
});

// A tripwire for runaway growth, not a budget. The published site was 156 MB on 2026-11-22
// (assets 142 MB: kimarite clips 54, UFC and poster images 44, Sumo portraits 43; data 47 MB),
// all of it owner-cleared media the site is meant to serve. The old 80 MB line was written when
// the build was a fraction of that and had been failing since the Sumo merge.
// 2026-11-25: 197.7 MB, almost all the growth being UFC headshots and cutouts (assets/img
// 44 -> 84 MB, #487); kimarite 54, Sumo portraits 43, data 52. The 200 MB line would have tripped
// on the next photo batch. 260 MB keeps about 30% headroom, as before: room for more approved
// photos, small enough that an unintended folder (raw research, video masters) still trips it.
test('the build does not grow unexpectedly', () => {
  assert.ok(report.megabytes < 260, `dist is ${report.megabytes} MB; if this growth is intended, raise the limit deliberately`);
});

test.after(() => rmSync(out, { recursive: true, force: true }));

test('stylesheets are bundled per unbroken run, in order, without crossing an inline <style>', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'befn-css-'));
  const fixtureOut = join(fixture, 'dist');
  try {
    mkdirSync(join(fixture, 'assets'));
    for (const n of ['a', 'b', 'c', 'd']) writeFileSync(join(fixture, 'assets', n + '.css'), '.' + n + '{color:red}');
    writeFileSync(join(fixture, 'sw.js'), "const SHELL = [\n  '/',\n];\n");
    writeFileSync(join(fixture, 'index.html'),
      '<link rel="stylesheet" href="assets/a.css?v=1"><script src="x.js"></script><link rel="stylesheet" href="assets/b.css">' +
      '<style>.inline{}</style><link rel="stylesheet" href="assets/c.css"><link rel="stylesheet" href="assets/d.css?v=2">');
    const r = build(fixture, fixtureOut);
    assert.equal(r.styles.length, 2, 'two runs, split by the inline style');
    const html = readFileSync(join(fixtureOut, 'index.html'), 'utf8');
    assert.match(html, /^<link rel="stylesheet" href="assets\/site\.[a-f0-9]{12}\.css"><script src="x\.js"><\/script><style>\.inline\{\}<\/style><link rel="stylesheet" href="assets\/site\.[a-f0-9]{12}\.css">$/);
    const first = readFileSync(join(fixtureOut, r.styles[0]), 'utf8');
    assert.ok(first.indexOf('.a{') < first.indexOf('.b{'), 'page order kept');
    const sw = readFileSync(join(fixtureOut, 'sw.js'), 'utf8');
    for (const n of r.styles) assert.ok(sw.includes("'/" + n + "'"), 'service worker caches ' + n);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

test('the real build bundles the site stylesheets', () => {
  assert.ok(report.styles.length >= 1);
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  assert.ok((html.match(/rel="stylesheet"/g) || []).length < 15, 'far fewer stylesheet requests than the ~40 in the source page');
});
