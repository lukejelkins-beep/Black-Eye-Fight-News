/* Offline-ready app shell. Always prioritise network for news and fight data. */
const CACHE_NAME = 'befn-app-shell-v14-20261109-card-order-v3';
const SHELL = [
  '/', '/index.html', '/manifest.webmanifest',
  '/assets/mark.svg', '/assets/icon-192.png', '/assets/icon-512.png', '/assets/apple-touch-icon.png', '/assets/icon-maskable-512.png',
  '/assets/app-install.css', '/assets/app-install.js',
  '/assets/brand-theme.css',
  '/assets/mobile-app.css', '/assets/mobile-app.js',
  '/assets/notifications.css', '/assets/notifications.js', '/assets/push-config.js',
  '/assets/fighter-hover.js', '/assets/local-time.js', '/assets/upcoming-cards.js',
  '/assets/upcoming-cards.css', '/assets/fight-talk.css',
  '/assets/fight-film.css', '/assets/fight-film.js',
  '/assets/results.css', '/assets/results.js', '/assets/event-status.js'
];
const SHELL_PATHS = new Set(SHELL);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(
    names.filter(name => name.startsWith('ics-live-desk-') || (name.startsWith('befn-app-shell-') && name !== CACHE_NAME))
      .map(name => caches.delete(name))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if(request.method !== 'GET') return;
  const url = new URL(request.url);
  if(url.origin !== self.location.origin) return;
  // Do not cache live feeds, results, calendar JSON, or API data.
  if(url.pathname.startsWith('/data/') || url.pathname.startsWith('/api/')) return;
  const navigation = request.mode === 'navigate';
  const shellAsset = SHELL_PATHS.has(url.pathname);
  if(!navigation && !shellAsset) return;
  event.respondWith(
    fetch(request).then(response => {
      if(response.ok && (navigation || shellAsset)) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request,copy)));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request,{ignoreSearch:true});
      if(cached) return cached;
      if(navigation) return (await caches.match('/index.html')) || Response.error();
      return Response.error();
    })
  );
});
