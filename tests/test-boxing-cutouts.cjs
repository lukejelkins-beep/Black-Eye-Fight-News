/* The boxing cut-out register must stay honest: every cut-out the site can show is a
   derivative of a photograph already in data/boxing-image-register.json, the file is in
   the repository, and the row carries the credit and rights it inherited. A cut-out with
   no source row would be a picture with no provenance, which is the thing the image rules
   exist to prevent. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const OUT = 'assets/img/boxing-cutouts';
const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

const cut = read('data/boxing-cutout-register.json');
const src = read('data/boxing-image-register.json');
const sources = new Map(src.images.map(i => [i.id, i]));

assert(cut && cut.cutouts && typeof cut.cutouts === 'object', 'register has a cutouts map');
assert(typeof cut.note === 'string' && /credit and rights/.test(cut.note), 'the register says where the rights come from');

const kept = Object.entries(cut.cutouts).filter(([, v]) => v.ok === true);
assert(kept.length > 0, 'at least one cut-out was kept');

for (const [id, row] of Object.entries(cut.cutouts)) {
  assert(sources.has(id), `${id} has no row in the boxing image register`);
  assert(typeof row.reason === 'string' && row.reason, `${id} records why it was kept or dropped`);
  if (row.ok !== true) continue;
  assert(fs.existsSync(path.join(root, OUT, `${id}.webp`)), `${id} is marked kept but the file is missing`);
  assert(row.credit, `${id} carries no credit`);
  assert(row.rights, `${id} carries no rights status`);
  assert.strictEqual(row.credit, sources.get(id).credit, `${id} credit differs from its source photograph`);
  assert.strictEqual(row.rights, sources.get(id).rights, `${id} rights differ from its source photograph`);
}

// No orphans the other way either: a file in the folder with no kept row could be shown
// by a hand-written path and carry no provenance.
for (const file of fs.readdirSync(path.join(root, OUT)).filter(f => f.endsWith('.webp'))) {
  const id = file.replace(/\.webp$/, '');
  assert(cut.cutouts[id] && cut.cutouts[id].ok === true, `${file} is on disk with no kept register row`);
}

// A dropped boxer keeps the photograph, so the photograph must still be there.
for (const [id, row] of Object.entries(cut.cutouts)) {
  if (row.ok === true) continue;
  const files = (sources.get(id) || {}).files || {};
  if (!files.thumb) continue;
  assert(fs.existsSync(path.join(root, src.basePath, files.thumb)), `${id} fell back to a photograph that is not there`);
}

console.log(`boxing cut-outs: ok (${kept.length} kept of ${Object.keys(cut.cutouts).length})`);
