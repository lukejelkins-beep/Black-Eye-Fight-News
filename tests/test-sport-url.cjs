/* The sport is kept in the address as ?sport=… so shared links open the same sport (QA audit D02). */
const assert = require('assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'global-sport-v1.0.3.js'), 'utf8');

function boot(href, saved) {
  const store = new Map(saved ? [['befn-selected-sport-v1.0.3', saved]] : []);
  const loc = new URL(href);
  const win = { listeners: {} };
  const ctx = {
    URL, URLSearchParams, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    location: { get href() { return loc.href; }, get search() { return loc.search; }, get pathname() { return loc.pathname; }, get hash() { return loc.hash; } },
    history: { state: null, replaceState: (_s, _t, u) => { const n = new URL(u, loc.href); loc.href = n.href; } },
    document: { body: null, addEventListener() {}, dispatchEvent() {}, querySelectorAll: () => [], documentElement: { dataset: {} } },
    window: null,
  };
  ctx.window = ctx; ctx.addEventListener = (t, f) => { win.listeners[t] = f; };
  vm.runInNewContext(src, ctx);
  return { sport: ctx.BEFNSport, url: () => loc.href, store, storage: win.listeners.storage };
}

// A shared MMA link opens MMA even if this browser last used Boxing, and keeps its route.
let b = boot('https://site.test/?sport=mma#fights/results', 'boxing');
assert.strictEqual(b.sport.get(), 'mma');
assert.strictEqual(b.url(), 'https://site.test/?sport=mma#fights/results');
assert.strictEqual(b.store.get('befn-selected-sport-v1.0.3'), 'mma', 'the link becomes the saved choice');

// An old link without ?sport uses the saved choice, and the address gains it so copying works.
b = boot('https://site.test/#fights', 'boxing');
assert.strictEqual(b.sport.get(), 'boxing');
assert.strictEqual(b.url(), 'https://site.test/?sport=boxing#fights');

// The front page carries no parameter.
b = boot('https://site.test/?sport=all#home', 'mma');
assert.strictEqual(b.sport.get(), 'all');
assert.strictEqual(b.url(), 'https://site.test/#home');

// Switching sport rewrites only the query; the route after # is untouched.
b = boot('https://site.test/?sport=mma#fights/results', null);
b.sport.set('boxing');
assert.strictEqual(b.url(), 'https://site.test/?sport=boxing#fights/results');
b.sport.set('all');
assert.strictEqual(b.url(), 'https://site.test/#fights/results');

// Unknown values are ignored; other query parameters are kept.
b = boot('https://site.test/?utm_source=x&sport=sumo#home', 'mma');
assert.strictEqual(b.sport.get(), 'mma');
assert.strictEqual(new URL(b.url()).searchParams.get('utm_source'), 'x');
assert.strictEqual(new URL(b.url()).searchParams.get('sport'), 'mma');

// Another tab changing sport updates this tab's address too.
b = boot('https://site.test/?sport=mma#home', null);
b.storage({ key: 'befn-selected-sport-v1.0.3', newValue: 'boxing' });
assert.strictEqual(b.url(), 'https://site.test/?sport=boxing#home');
console.log('sport url: ok');
