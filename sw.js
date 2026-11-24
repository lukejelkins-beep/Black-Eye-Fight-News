/* Offline-ready app shell. Always prioritise network for news and fight data. */
const CACHE_NAME = 'befn-v3-theme-20261122-photos3-boxing2-rating1-film1-cutout1-profiles5-prov1-r2-r2c-r3a-sb1-fresh1-ph151-alias1-hint1-areas1-faceoff1-hub3-results1-heroband1-flags1-ov1-bxh1-nav1-front1-d02-sw1-bxfo1-lf1-kb1-kb2-fx1-trap1-rx1-c01-a05-am1-fa1-am2-am3-am4-am5-tk1-am6-ffw1';
const SHELL = [
  '/', '/index.html', '/manifest.webmanifest',
  '/assets/mark.svg', '/assets/site-favicon-192.png', '/assets/icon-192.png', '/assets/icon-512.png', '/assets/apple-touch-icon.png', '/assets/icon-maskable-512.png',
  '/assets/app-install.css', '/assets/app-install.js',
  '/assets/brand-theme.css', '/assets/editorial-compact.css', '/assets/news-list.css', '/assets/news-page.css', '/assets/landing-page.css', '/assets/site-theme.css', '/assets/site-header.css', '/assets/fights-page.css', '/assets/fighters-page.css', '/assets/news-page.js', '/assets/landing.js', '/assets/sport-overview.js', '/assets/sport-overview.css', '/assets/phone-nav.css', '/assets/phone-nav.js', '/assets/global-sport-v1.0.3.css', '/assets/global-sport-v1.0.3.js', '/assets/compact-discipline-logos.css', '/assets/promotion-coverage.js', '/assets/promotion-coverage.css',
  '/assets/mobile-app.css', '/assets/mobile-app.js',
  '/assets/notifications.css', '/assets/notifications.js', '/assets/push-config.js',
  '/assets/ufcalendar-fights-enrichment.js',
  '/data/ufc334-fighter-evidence.json',
  '/assets/fighter-hover.js', '/assets/scout-intelligence.js', '/assets/ufcalendar-evidence.js',
  '/assets/local-time.js', '/assets/local-images.js', '/assets/upcoming-cards.js',
  '/assets/upcoming-cards.css', '/assets/related-news.css', '/assets/snapshot-tiles.css', '/assets/snapshot-tiles.js', '/assets/related-news.js', '/assets/fight-talk-filters.js', '/assets/fight-talk.css', '/assets/fight-talk-cards.css',
  '/assets/fight-film.css', '/assets/fight-film.js',
  '/assets/results.css', '/assets/results.js', '/assets/talk-status.js', '/assets/fights-route.js', '/assets/fights-hub.css', '/assets/event-status.js', '/assets/fighter-power-index.js', '/assets/form-rule.js', '/assets/fighter-insights.js', '/assets/fighter-power.css', '/assets/fighter-profile-pro.css', '/assets/fighters-hub.css', '/assets/fighters-hub.js'
];
const SHELL_PATHS = new Set(SHELL);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(
    // Every BEFN shell cache except this release's. Only this worker creates befn-* caches
    // (OneSignal uses its own names). Before 24 Nov 2026 only befn-app-shell-* was cleaned,
    // so befn-v3-* caches piled up, one per release (QA audit C04).
    names.filter(name => name.startsWith('ics-live-desk-') || (name.startsWith('befn-') && name !== CACHE_NAME))
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
    fetch(request, navigation ? {cache:'no-store'} : undefined).then(response => {
      if(response.ok && (navigation || shellAsset)) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request,copy)));
      }
      return response;
    }).catch(async () => {
      // Offline: answer only from this release's cache, never an older one, so HTML, JS and
      // CSS stay from the same release. ignoreSearch because the shell is stored without ?v=.
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request,{ignoreSearch:true});
      if(cached) return cached;
      if(navigation) return (await cache.match('/index.html')) || Response.error();
      return Response.error();
    })
  );
});
