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

// Boxing rows carry the rights record the attestation requires.
assert.strictEqual(boxing.rights, 'promoter-press-kit');
assert(/attested/i.test(boxing.rightsNote));
for (const r of boxing.images) {
  assert(r.promoter && r.credit, 'no promoter credit for ' + r.name);
  assert(/^https:\/\//.test(r.sourceUrl) && /^https:\/\//.test(r.sourcePage), 'no source recorded for ' + r.name);
  assert(/^[a-f0-9]{64}$/.test(r.sha256), 'no checksum for ' + r.name);
  assert(r.attestation && r.attestation === boxing.rightsNote, 'row attestation must match the register');
}
console.log('local image map tests passed (' + checked + ' files checked)');
