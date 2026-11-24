/* The generated photo map serves two registers (UFC portraits, boxing press-kit photos)
   and must never point the site at a file that is not in the repository. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/local-images.js'), 'utf8'), sandbox);
const api = sandbox.window.BEFNLocalImages;
assert(api && typeof api.url === 'function' && typeof api.has === 'function');

const reg = f => JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'));
const ufc = reg('ufc-image-register.json');
const boxing = reg('boxing-image-register.json');

// Each sport resolves into its own folder.
const onDisk = (r, base) => r.images.filter(i => Object.values(i.files).every(f => fs.existsSync(path.join(root, base, f))));
const someUfc = onDisk(ufc, ufc.basePath)[0];
const someBoxer = onDisk(boxing, boxing.basePath)[0];
assert(someUfc && someBoxer, 'both registers need at least one image on disk');
assert.strictEqual(api.url(someUfc.name, 'portrait'), ufc.basePath + someUfc.id + '-portrait.webp');
assert.strictEqual(api.url(someBoxer.name, 'portrait'), boxing.basePath + someBoxer.id + '-portrait.webp');
assert(api.has(someBoxer.name) && api.has(someUfc.name));

// Unknown names and unknown crops behave as the callers expect.
assert.strictEqual(api.url('Nobody At All', 'portrait'), '');
assert.strictEqual(api.has('Nobody At All'), false);
assert.strictEqual(api.url(someBoxer.name, 'banner'), boxing.basePath + someBoxer.id + '-thumb.webp');
assert.strictEqual(api.url('  ' + someBoxer.name.toUpperCase() + ' ', 'thumb'), boxing.basePath + someBoxer.id + '-thumb.webp');

// A name two fighters share is dropped rather than guessed at.
const names = [...ufc.images, ...boxing.images].map(i => i.name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase());
const seen = new Set(), twice = new Set();
names.forEach(n => (seen.has(n) ? twice.add(n) : seen.add(n)));
twice.forEach(n => assert.strictEqual(api.url(n, 'thumb'), '', 'ambiguous name should resolve to nothing: ' + n));

// Every file the map can hand out exists.
let checked = 0;
for (const r of [...ufc.images, ...boxing.images]) {
  const url = api.url(r.name, 'card');
  if (!url) continue;
  assert(fs.existsSync(path.join(root, url)), 'missing file for ' + r.name + ': ' + url);
  checked++;
}
assert(checked > 100, 'expected the UFC library to be mapped too, got ' + checked);

// Boxing rows carry the rights record their source requires.
assert(/promoter-press-kit/.test(boxing.rights));
assert(/attested/i.test(boxing.rightsNote));
for (const r of boxing.images) {
  assert(/^https:\/\//.test(r.sourceUrl) && /^https:\/\//.test(r.sourcePage), 'no source recorded for ' + r.name);
  assert(/^[a-f0-9]{64}$/.test(r.sha256), 'no checksum for ' + r.name);
  if (r.rights === 'promoter-press-kit') {
    assert(r.promoter && r.credit, 'no promoter credit for ' + r.name);
    // Each promoter's row carries the attestation it falls under (2026-11-22, or Top Rank's of
    // 2026-11-24), one the register records and its rights note repeats.
    const attested = Object.values(boxing.attestations || { only: boxing.rightsNote });
    assert(r.attestation && attested.includes(r.attestation) && boxing.rightsNote.includes(r.attestation),
      'row attestation must be one the register records: ' + r.name);
    if (r.promoter === 'Top Rank') assert(/2026-11-24/.test(r.attestation), 'Top Rank rows fall under the 2026-11-24 attestation');
  } else {
    // A Creative Commons photograph is only usable with its photographer and licence named.
    assert.strictEqual(r.rights, 'wikimedia-cc', 'unknown rights for ' + r.name + ': ' + r.rights);
    assert(r.photographer, 'no photographer for ' + r.name);
    assert(/^(cc|public domain|pd)/i.test(r.licence || ''), 'not a free licence for ' + r.name + ': ' + r.licence);
    assert(/commons\.wikimedia\.org/.test(r.sourcePage), 'no Commons file page for ' + r.name);
    assert(r.changes, 'no record of what was changed for ' + r.name);
  }
}

// Every photograph is accounted for on the credits page, which is what the licences ask for.
const creditsPath = path.join(root, 'boxing-photo-credits.html');
assert(fs.existsSync(creditsPath), 'boxing-photo-credits.html is missing: run scripts/build-photo-credits.py');
const credits = fs.readFileSync(creditsPath, 'utf8');
for (const r of boxing.images) {
  assert(credits.includes(r.name), 'no credit line for ' + r.name);
  if (r.rights === 'wikimedia-cc') {
    assert(credits.includes(r.photographer), 'photographer not credited for ' + r.name);
    assert(credits.includes(r.licence), 'licence not named for ' + r.name);
  }
}
// And the page is linked where a reader can reach it.
assert(fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('boxing-photo-credits.html'),
  'index.html must link the credits page');
console.log('local image map tests passed (' + checked + ' files checked)');
