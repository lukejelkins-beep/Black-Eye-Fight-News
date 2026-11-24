/* Fights tab URLs survive reload and sharing (audit D02). */
const assert = require('assert');
const R = require('../assets/fights-route.js');
const cases = [
  ['#fights', 'upcoming', '#fights'],
  ['#fights/results', 'results', '#fights/results'],
  ['#fights/upcoming', 'upcoming', '#fights'],
  ['#fights/nonsense', 'upcoming', '#fights'],
  ['#results', 'results', '#fights/results'],
  ['#calendar', 'upcoming', '#fights'],
];
for (const [hash, view, canonical] of cases) assert.deepStrictEqual(R.parse(hash), { view, canonical }, hash);
for (const hash of ['', '#', '#home', '#news', '#champions', '#fighter/ufc--x', '#resultsx']) assert.strictEqual(R.parse(hash), null, hash);
// The canonical URL for each tab parses back to that tab, so a reload lands where the reader was.
for (const view of ['upcoming', 'results']) assert.strictEqual(R.parse(R.hashFor(view)).view, view);
assert.strictEqual(R.hashFor('bogus'), '#fights');
console.log('fights route: ok');
