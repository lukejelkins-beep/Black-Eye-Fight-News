/* Overview hero leads with the official poster when BEFN holds one (owner, 25 Nov 2026). */
const assert = require('assert');
const O = require('../assets/sport-overview.js');
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const now = Date.parse('2026-11-25T06:00:00Z');
const fj = { id: 'fury-joshua-2026-12-11', date: '2026-12-11', sport: 'boxing', title: 'Tyson Fury vs Anthony Joshua', location: 'Principality Stadium, Cardiff, Wales', promotion: 'Zuffa Boxing / Netflix',
  bouts: [{ section: 'main', fighters: ['Tyson Fury', 'Anthony Joshua'], division: 'Heavyweight', note: 'Main event' }] };
const ctx = { area: 'boxing', now, events: [fj], results: [], cutouts: { 'tyson-fury': 'assets/img/boxing-cutouts/tyson-fury.webp', 'anthony-joshua': 'assets/img/boxing-cutouts/anthony-joshua.webp' }, featured: { boxing: ['fury-joshua-2026-12-11'] }, champions: {}, stories: [] };
const posters = { 'fury-joshua-2026-12-11': { portrait: { url: 'assets/img/posters/fury-joshua-2026-12-11-portrait.webp', credit: 'Event promotional artwork via www.netflix.com', width: 900, height: 1123 } } };
const base = { esc, safeURL: x => /^https:|^assets\/|^#/.test(x) ? esc(x) : '#', localImage: () => '' };
const hero = html => (html.match(/<section class="sov-hero[\s\S]*?<\/section>/) || [''])[0];

// With a held poster: the poster leads, whole, with its credit; no cut-outs.
let h = hero(O.build(ctx, { ...base, poster: id => posters[id] || null }));
assert.ok(h.includes('<figure class="sov-poster is-portrait"><img src="assets/img/posters/fury-joshua-2026-12-11-portrait.webp"'), h);
assert.ok(h.includes('alt="Fury vs Joshua official event poster"'));
assert.ok(h.includes('width="900" height="1123"'), 'intrinsic size given so the layout does not jump');
assert.ok(h.includes('<figcaption>Event promotional artwork via www.netflix.com</figcaption>'), 'credit shown');
assert.ok(!h.includes('sov-cast'), 'cut-outs not shown when the poster is');
assert.ok(!h.includes('is-flat'));

// A landscape-only poster is used and marked landscape.
h = hero(O.build(ctx, { ...base, poster: () => ({ landscape: { url: 'assets/img/posters/x-landscape.webp', credit: 'Promoter' } }) }));
assert.ok(h.includes('sov-poster is-landscape'));

// No poster held (or no poster helper on the page): cut-outs as before.
for (const helpers of [{ ...base, poster: () => null }, base]) {
  h = hero(O.build(ctx, helpers));
  assert.ok(!h.includes('sov-poster'));
}

// A poster URL outside BEFN's own assets is refused rather than shown.
h = hero(O.build(ctx, { ...base, poster: () => ({ portrait: { url: 'javascript:alert(1)' } }) }));
assert.ok(!h.includes('sov-poster') && !h.includes('javascript:'));
console.log('overview poster: ok');
