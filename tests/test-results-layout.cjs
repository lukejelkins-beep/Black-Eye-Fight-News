/* Results page, design G (phone) / H (desktop), owner 25 Nov 2026: the result of the week, then each week
   newest first as poster cards, "Show older weeks", and search that names the fight that matched.
   Runs assets/results.js in a sandbox on real results up to 22 Nov 2026, with "today" fixed at 25 Nov. */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const all = JSON.parse(fs.readFileSync('data/results.json', 'utf8'));
const fixture = { ...all, results: all.results.filter(r => r.date <= '2026-11-22') };
fixture.events = all.events.filter(e => fixture.results.some(r => r.eventId === e.id));

const ui = { view: 'results', promotion: 'all', query: '' };
const listeners = {};
const ctx = {
  console, URL, URLSearchParams, Date, JSON, Math, Promise, Set, Map, AbortSignal,
  setInterval: () => 0, requestAnimationFrame: () => 0,
  location: { href: 'https://example.test/#fights/results', hash: '#fights/results' },
  document: {
    hidden: false,
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    createElement: () => ({ set textContent(_) {} }),
    head: { appendChild: () => {} },
    getElementById: () => null,
    querySelectorAll: () => [],
  },
  fetch: async url => {
    const body = /results\.json/.test(url) ? fixture : { events: {} };
    return { ok: true, json: async () => JSON.parse(JSON.stringify(body)) };
  },
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
ctx.FightTime = { dayKey: () => '2026-11-25', venueDay: d => d, locale: 'en-GB' };
ctx.BEFNSport = { get: () => 'mma' };
ctx.BEFNFightsUI = ui;
vm.runInContext(fs.readFileSync('assets/local-posters.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('assets/results.js', 'utf8'), ctx);
const desk = ctx.ResultsDesk;
const L = desk.layout;

// Weeks run Monday to Sunday on the venue's date.
assert.strictEqual(L.weekStart('2026-11-21'), '2026-11-16');
assert.strictEqual(L.weekStart('2026-11-16'), '2026-11-16');
assert.strictEqual(L.weekStart('2026-11-22'), '2026-11-16');
assert.strictEqual(L.weekLabel('2026-11-23', '2026-11-25'), 'This week');
assert.strictEqual(L.weekLabel('2026-11-16', '2026-11-25'), 'Last week');
assert.strictEqual(L.weekLabel('2026-11-09', '2026-11-25'), '9–15 Nov');
assert.strictEqual(L.weekLabel('2026-10-26', '2026-11-25'), '26 Oct–1 Nov');
assert.strictEqual(L.shortDay('2026-11-21'), 'Sat 21 Nov');

// Poster choice: the wide image only when it is sharp (600 px or more), otherwise the tall poster.
const qatar = L.posterArt({ id: 'ufc-qatar-2026-11-21' });
assert.ok(/ufc-qatar-2026-11-21-portrait\.webp$/.test(qatar.url), 'UFC Qatar uses the 900 px poster, not the 323 px photo');
assert.ok(/ufc-334-2026-11-14-landscape\.webp$/.test(L.posterArt({ id: 'ufc-334-2026-11-14' }).url));
assert.strictEqual(L.posterArt({ id: 'no-such-event' }), null);
assert.ok(/^https:/.test(L.posterArt({ id: 'no-such-event' }, { url: 'https://example.test/p.jpg', kind: 'poster' }).url));

(async () => {
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
  const html = desk.render({ embedded: true });
  assert.ok(!/undefined|NaN|\[object/.test(html), 'no broken values in the page');

  // Result of the week first, then the rest of its week, then older weeks.
  const lead = html.indexOf('Result of the week');
  assert.ok(lead > -1, 'result of the week heading');
  const firstCard = html.match(/data-result-event="([^"]+)"/)[1];
  assert.strictEqual(firstCard, 'ufc-qatar-2026-11-21', 'the biggest card of the newest week leads');
  assert.ok(/rxp-card is-lead/.test(html));
  assert.ok(html.includes('Also last week'), 'the lead is not repeated in its own week');
  assert.strictEqual((html.match(/data-result-event="ufc-qatar-2026-11-21"/g) || []).length, 1);
  assert.ok(html.indexOf('9–15 Nov') > html.indexOf('Also last week'));

  // Three weeks at first, then "Show older weeks".
  assert.ok(html.includes('data-results-older'), 'older weeks button');
  assert.ok(!html.includes('ufc-archive-2026-10-24'), 'October cards wait behind the button');
  const click = listeners.click[0];
  click({ target: { closest: s => (s === '[data-results-older]' ? {} : null) } });
  assert.ok(desk.render({ embedded: true }).includes('2026-10-'), 'the button adds older weeks');

  // The two newest weeks use big posters, older weeks the smaller ones.
  assert.ok(/rxp-grid is-big/.test(html) && /rxp-grid is-small/.test(html));
  // Every card front has a picture or a dark name tile, and opens the full card in place.
  const cards = html.split('<details class="result-event befn-result-list-event rxp-card').slice(1);
  assert.ok(cards.length >= 8);
  for (const c of cards) {
    assert.ok(/class="rxp-art"><img src="[^"]+"/.test(c) || /rxp-art is-tile/.test(c), 'poster or tile');
    assert.ok(c.includes('class="result-event-bouts"'), 'full card inside');
  }
  assert.ok(html.includes('<span class="rxp-tile">'), 'a card without a poster gets a name tile');
  assert.ok(!/RIZIN 55 — verified/.test(html), 'editorial notes are trimmed from event names');

  // Search: matching cards, naming the fight that matched.
  ui.query = 'hooker';
  const found = desk.render({ embedded: true });
  assert.ok(found.includes('Cards matching “hooker”'));
  assert.ok(found.includes('Dan Hooker beat Brian Ortega · UD'), 'the matching fight is named');
  assert.ok(!found.includes('Result of the week'), 'no lead while searching');
  ui.query = 'zzzz-no-match';
  assert.ok(desk.render({ embedded: true }).includes('No results match your search'));
  console.log('results layout: ok');
})().catch(e => { console.error(e); process.exit(1); });
