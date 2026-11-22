import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const data = JSON.parse(read('data/sumo/landmarks.json'));
const js = read('assets/sumo.js');
const css = read('assets/sumo-poster.css');

assert.equal(data.schemaVersion, 1);
assert.deepEqual(Object.keys(data.byCountry).sort(), ['KZ', 'MN', 'RU', 'UA']); // Japan and China keep their characters
for (const [code, m] of Object.entries(data.byCountry)) {
  assert.match(m.path, /^assets\/sumo-landmarks\/[a-z]{2}\.webp$/, code);
  assert.ok(existsSync(new URL(m.path, root)), `${code} file exists`);
  assert.equal(statSync(new URL(m.path, root)).size, m.bytes, `${code} byte size matches`);
  assert.equal(createHash('sha256').update(readFileSync(new URL(m.path, root))).digest('hex'), m.sha256, `${code} hash matches`);
  assert.ok(m.alt && m.rights, `${code} has alt text and a rights note`);
  assert.equal(typeof m.approved, 'boolean', code);
  assert.ok(m.fade.every(x => x === 'left' || x === 'bottom'), `${code} fade edges`);
  assert.ok(m.bytes < 250000, `${code} stays small`);
}
// Readers see a landmark only when approved; the preview flag is the only other way in.
assert.match(js, /if\(m\.approved!==true&&!preview\)return '';/);
assert.match(js, /get\('landmarks'\)==='preview'/);
// The kanji keeps its grid cell so the hero columns do not shift.
assert.match(css, /\.sumo-poster\.has-landmark \.sumo-poster-kanji\{visibility:hidden\}/);
console.log('sumo landmark checks passed');
