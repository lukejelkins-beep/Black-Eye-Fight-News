/* Sport row on the Sumo pages. Boxing, MMA, Grappling and All sports belong to the main
   site, so choosing one saves that sport (same key as the main site's filter) and returns
   to the News page. Sumo is the current area. */
(() => {
  'use strict';
  const KEY = 'befn-selected-sport-v1.0.3';
  document.addEventListener('click', event => {
    const btn = event.target.closest && event.target.closest('button[data-sport-value]');
    if (!btn) return;
    try { localStorage.setItem(KEY, btn.dataset.sportValue); } catch (_) { /* private mode: still navigate */ }
    location.href = 'index.html#home';
  });

  /* Phone navigation: the same five tabs as the main site, linking back to it. */
  const icon = {
    news: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
    fights: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h4"/>',
    fighters: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    analysis: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    social: '<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5A9 9 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3a8.4 8.4 0 0 1 8.5 8.5Z"/>'
  };
  const items = [['home', 'News', 'news'], ['fights', 'Fights', 'fights'], ['fighters', 'Fighters', 'fighters'], ['analysis', 'Analysis', 'analysis'], ['social', 'Fight Talk', 'social']];
  function dock() {
    if (document.querySelector('.sumo-dock')) return;
    const nav = document.createElement('nav');
    nav.className = 'sumo-dock';
    nav.setAttribute('aria-label', 'Mobile quick navigation');
    nav.innerHTML = items.map(([key, label, ic]) =>
      '<a href="index.html#' + key + '"><svg aria-hidden="true" viewBox="0 0 24 24">' + icon[ic] + '</svg><span>' + label + '</span></a>').join('');
    document.body.append(nav);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', dock, { once: true });
  else dock();
})();
