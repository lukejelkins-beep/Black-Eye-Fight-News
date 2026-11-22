import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build, referencedDataFiles, DATA_DIRS } from '../scripts/build-site.mjs';

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
  assert.ok(published.filter(name => name.endsWith('.json')).length <= 40, 'only referenced data files are published');
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
// the build was a fraction of that and had been failing since the Sumo merge. 200 MB leaves
// about 28% headroom: enough for more photos, small enough that an unintended folder trips it.
test('the build does not grow unexpectedly', () => {
  assert.ok(report.megabytes < 200, `dist is ${report.megabytes} MB; if this growth is intended, raise the limit deliberately`);
});

test.after(() => rmSync(out, { recursive: true, force: true }));
