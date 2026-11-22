import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const script = read('assets/sumo-stables.mjs');
const html = read('sumo-stables.html');
const sumoHtml = read('sumo.html');
const roster = JSON.parse(read('data/sumo/rikishi-index.json'));
const photos = JSON.parse(read('data/sumo/approved-photos.json'));
const names = [...(script.match(/const OFFICIAL_STABLES = \[([\s\S]*?)\];/)?.[1] || '').matchAll(/'([^']+)'/g)].map(x => x[1]);

test('the independent stable directory ships with valid JS and links from Sumo', () => {
  // The page loads this as a module; strip its static imports for the syntax check.
  assert.doesNotThrow(() => new Function(script.replace(/^import .*$/gm, '')));
  assert.match(html, /<script type="module" src="assets\/sumo-stables\.mjs/);
  assert.match(html, /assets\/sumo-stables\.mjs/);
  assert.match(html, /assets\/sumo-stables\.css/);
  assert.match(html, /noindex,nofollow/);
  assert.match(sumoHtml, /href="sumo-stables\.html"/);
});

test('JSA 45-stable names are unique and all tracked rikishi map to a stable', () => {
  assert.equal(names.length, 45);
  assert.equal(new Set(names).size, 45);
  assert.equal(roster.count, roster.rikishi.length);
  assert.ok(roster.rikishi.length > 0);
  const officialNames = new Set(names);
  const unassigned = roster.rikishi.filter(w => !officialNames.has(w.heya));
  assert.deepEqual(unassigned.map(w => ({ id: w.sourceId, stable: w.heya })), []);
});

test('stable profiles reuse official-photo approval and existing wrestler routes', () => {
  assert.match(script, /photos\?\.bySourceId/);
  assert.match(script, /approved === true/);
  assert.match(script, /sumo\.html#profile\//);
  assert.match(script, /a count of zero/i);
  assert.ok(Object.keys(photos.bySourceId).length > 0);
});
