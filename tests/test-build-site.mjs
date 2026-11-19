import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build, referencedDataFiles } from '../scripts/build-site.mjs';

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
  const published = readdirSync(join(out, 'data'), { recursive: true })
    .filter(name => !statSync(join(out, 'data', name)).isDirectory());
  assert.ok(published.every(name => name.endsWith('.json')), 'only JSON data is published');
  assert.ok(published.length <= 40, 'only referenced data files are published');
});

test('the build stays well under the old repo publish', () => {
  // Sumo preview: about 80 MB of Sumo photos and technique clips are reader files.
  assert.ok(report.megabytes < 120, `dist is ${report.megabytes} MB`);
});

test.after(() => rmSync(out, { recursive: true, force: true }));
