/* Service worker cache hygiene (QA audit C04): activation removes every superseded
 * BEFN cache, and offline requests are answered only from this release's cache. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const CURRENT = src.match(/const CACHE_NAME = '([^']+)'/)[1];

function makeCaches(initial) {
  const store = new Map(Object.entries(initial).map(([name, entries]) => [name, new Map(Object.entries(entries))]));
  const strip = u => String(u).split('?')[0];
  const cacheObj = name => ({
    match: async (req, opts = {}) => {
      const m = store.get(name); if (!m) return undefined;
      const url = typeof req === 'string' ? req : req.url;
      const key = new URL(url, 'https://site.test').pathname + (opts.ignoreSearch ? '' : (new URL(url, 'https://site.test').search));
      for (const [k, v] of m) if ((opts.ignoreSearch ? strip(k) : k) === key) return v;
      return undefined;
    },
    put: async (req, res) => { store.get(name).set(new URL(req.url).pathname + new URL(req.url).search, res); },
    addAll: async urls => { for (const u of urls) store.get(name).set(u, 'fresh:' + u); },
  });
  return {
    store,
    keys: async () => [...store.keys()],
    delete: async name => store.delete(name),
    open: async name => { if (!store.has(name)) store.set(name, new Map()); return cacheObj(name); },
    // Deliberately searches every cache, as the real global caches.match does.
    match: async (req, opts) => { for (const name of store.keys()) { const r = await cacheObj(name).match(req, opts); if (r) return r; } },
  };
}

function load(caches, fetchImpl) {
  const listeners = {};
  const self = { addEventListener: (t, f) => { listeners[t] = f; }, skipWaiting: () => {}, clients: { claim: async () => {} }, location: { origin: 'https://site.test' } };
  vm.runInNewContext(src, { self, caches, fetch: fetchImpl, URL, Response: { error: () => 'ERROR' }, Promise, console });
  return listeners;
}

(async () => {
  // 1. Activation keeps only the current BEFN cache and leaves other apps' caches alone.
  const caches = makeCaches({
    'befn-app-shell-v2': {}, 'befn-v3-theme-20261122-th3': {}, 'befn-v3-profile-20261121-stage5': {},
    'ics-live-desk-1': {}, 'OneSignal-cache': {}, [CURRENT]: {},
  });
  const l = load(caches, async () => { throw new Error('offline'); });
  let waited; l.activate({ waitUntil: p => { waited = p; } }); await waited;
  assert.deepStrictEqual([...caches.store.keys()].sort(), [CURRENT, 'OneSignal-cache'].sort());

  // 2. Offline, a versioned asset comes from the current cache, not an older one that also has it.
  const c2 = makeCaches({
    'befn-v3-theme-OLD': { '/assets/results.js?v=old': 'OLD JS', '/index.html': 'OLD HTML' },
    [CURRENT]: { '/assets/results.js': 'NEW JS', '/index.html': 'NEW HTML' },
  });
  const l2 = load(c2, async () => { throw new Error('offline'); });
  const respond = async (url, mode = 'no-cors') => {
    let p; l2.fetch({ request: { method: 'GET', url, mode }, respondWith: x => { p = x; }, waitUntil: () => {} }); return p;
  };
  assert.strictEqual(await respond('https://site.test/assets/results.js?v=20261124-d02'), 'NEW JS');
  assert.strictEqual(await respond('https://site.test/some/page', 'navigate'), 'NEW HTML');

  // 3. With only an older cache present (activation not yet run), offline gives an error, not old code.
  const c3 = makeCaches({ 'befn-v3-theme-OLD': { '/assets/results.js': 'OLD JS' } });
  const l3 = load(c3, async () => { throw new Error('offline'); });
  let p3; l3.fetch({ request: { method: 'GET', url: 'https://site.test/assets/results.js?v=new', mode: 'no-cors' }, respondWith: x => { p3 = x; }, waitUntil: () => {} });
  assert.strictEqual(await p3, 'ERROR');

  console.log('service worker: ok');
})().catch(e => { console.error(e); process.exit(1); });
