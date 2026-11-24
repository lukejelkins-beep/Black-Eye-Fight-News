/* Fallback front page film panel (QA audit D03): name-only matches are labelled as
 * related fighter videos with a date, never as film "from this card". */
const assert = require('assert');
const L = require('../assets/landing.js');
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = { esc, safeURL: x => /^https:/.test(x) ? esc(x) : '#' };
const v = (title, date, extra = {}) => ({ title, date, url: 'https://example.com/' + encodeURIComponent(title), thumbnail: 'https://example.com/t.jpg', verified: true, publisher: 'UFC', ...extra });
const result = { winner: 'Navajo Stirling', loser: 'Jiri Prochazka' };
const html = L.cardFilm(result, [v('Stirling vs Blachowicz full fight', '2025-06-01'), v('Unrelated vs Someone', '2026-11-21')], h);
assert.ok(!/from this card/i.test(html), 'must not claim the clip is from this card');
assert.ok(html.includes('Related fighter videos'));
assert.ok(html.includes('1 Jun 2025'), 'each clip shows its date so an older fight is recognisable');
assert.ok(!html.includes('Unrelated'), 'clips naming neither fighter are left out');
assert.strictEqual(L.cardFilm(result, [v('Unrelated vs Someone', '2026-11-21')], h), '', 'no matches takes no space');
assert.strictEqual(L.cardFilm(result, [v('Stirling vs Blachowicz', '2025-06-01', { verified: false })], h), '', 'unverified clips are left out');
console.log('landing film: ok');
