/* Sumo area navigation (owner, 23 Nov 2026: sport first, then section; Sumo uses the same sections).
   The header markup is in each sumo page. This script:
   - saves the sport when Boxing, MMA or the logo is chosen, so the main site opens in that area;
   - marks the current section (Overview, Fights, Fighters, Analysis) and shows only that
     section's sumo pages in the row below it;
   - builds the phone bottom tab bar, matching the main site (the top bar is assets/phone-nav.js).
   Sumo has no Fight Talk posts yet, so that section is left out here. */
(() => {
  'use strict';
  const KEY = 'befn-selected-sport-v1.0.3';
  const SECTIONS = [
    ['overview', 'Overview', 'sumo.html#home', 'news'],
    ['fights', 'Fights', 'sumo.html#basho', 'fights'],
    ['fighters', 'Fighters', 'sumo.html#rikishi', 'fighters'],
    ['analysis', 'Analysis', 'sumo-stories.html', 'analysis']
  ];
  const icon = {
    news: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
    fights: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h4"/>',
    fighters: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    analysis: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'
  };

  /* Which section and sumo page the reader is on. */
  function where() {
    const file = (location.pathname.split('/').pop() || 'sumo.html').toLowerCase();
    if (file.startsWith('sumo-stables')) return { section: 'fighters', page: 'stables' };
    if (file.startsWith('sumo-stories')) return { section: 'analysis', page: 'stories' };
    const page = decodeURIComponent(location.hash.slice(1)).split(/[/?]/)[0] || 'home';
    if (page === 'basho') return { section: 'fights', page: 'basho' };
    if (page === 'matchups') return { section: 'fights', page: 'matchups' };
    if (page === 'h2h' || page === 'headtohead') return { section: 'fights', page: 'h2h' };
    if (page === 'rikishi' || page === 'profile') return { section: 'fighters', page: 'rikishi' };
    if (page === 'banzuke') return { section: 'fighters', page: 'banzuke' };
    if (page === 'changes') return { section: 'fighters', page: 'changes' };
    if (page === 'review') return { section: 'analysis', page: 'review' };
    if (page === 'insights') return { section: 'analysis', page: 'insights' };
    if (page === 'predict') return { section: 'analysis', page: 'predict' };
    if (page === 'kimarite') return { section: 'analysis', page: 'kimarite' };
    return { section: 'overview', page: 'home' };
  }

  function mark(el, on) {
    el.classList.toggle('active', on);
    if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  }

  function sync() {
    const here = where();
    document.querySelectorAll('[data-sumo-section]').forEach(a => mark(a, a.dataset.sumoSection === here.section));
    const sub = document.querySelector('[data-sumo-sub]');
    if (sub) {
      const links = [...sub.querySelectorAll('a[data-group]')];
      const shown = links.filter(a => a.dataset.group === here.section);
      links.forEach(a => {
        a.hidden = a.dataset.group !== here.section;
        mark(a, a.dataset.sumoPage === here.page);
      });
      /* A section with a single sumo page needs no second row. */
      sub.hidden = shown.length < 2;
      sub.dataset.section = here.section;
    }
  }

  /* Boxing, MMA and the logo belong to the main site: save the choice, then follow the link. */
  document.addEventListener('click', event => {
    const link = event.target.closest && event.target.closest('a[data-area]');
    if (!link) return;
    try { localStorage.setItem(KEY, link.dataset.area); } catch (_) { /* private mode: still navigate */ }
  });

  function phone() {
    /* The phone top bar (logo, sport tabs, menu icon) comes from assets/phone-nav.js, as on the main site. */
    if (!document.querySelector('.befn-mobile-tabs')) {
      const dock = document.createElement('nav');
      dock.className = 'befn-mobile-tabs befn-mobile-tabs-four';
      dock.setAttribute('aria-label', 'Sumo sections');
      dock.innerHTML = SECTIONS.map(([key, label, href, ic]) =>
        '<a href="' + href + '" data-sumo-section="' + key + '"><svg aria-hidden="true" viewBox="0 0 24 24">' + icon[ic] + '</svg><span>' + label + '</span></a>').join('');
      document.body.append(dock);
    }
  }

  function init() { phone(); sync(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
  window.addEventListener('hashchange', sync);
})();
