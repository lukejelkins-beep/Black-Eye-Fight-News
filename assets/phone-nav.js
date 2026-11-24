/* Phone navigation, option B (owner, 24 Nov 2026), shared by index.html and the three Sumo pages.
   One slim top bar: "BEFN" (the all-sports front page), the Boxing / MMA / Sumo tabs and a menu icon.
   The sections stay in the bottom tab bar (assets/mobile-app.js on the main site,
   assets/sumo-site-nav.js on Sumo). The top bar slides away while you scroll down and comes back as
   soon as you scroll up. Desktop is untouched: everything here is hidden above 760 px. */
(() => {
  'use strict';
  const PHONE = window.matchMedia('(max-width:760px)');
  const MENU = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';

  /* A menu for pages without the main site's own (the Sumo pages): sports, then this area's
     sections and pages, read from the header that is already on the page. */
  let sheet = null, opener = null;
  const esc = e => { if (e.key === 'Escape') closeSheet(); };
  function closeSheet() {
    if (!sheet) return;
    sheet.remove(); sheet = null;
    window.removeEventListener('keydown', esc);
    if (opener) opener.focus(); opener = null;
  }
  function group(title, links) {
    if (!links.length) return [];
    const h = document.createElement('h3'); h.className = 'befn-mobile-sheet-sub'; h.textContent = title;
    const grid = document.createElement('div'); grid.className = 'befn-mobile-sheet-grid';
    links.forEach(a => {
      const c = document.createElement('a'); c.href = a.getAttribute('href'); c.textContent = a.textContent.trim();
      if (a.dataset.area) c.dataset.area = a.dataset.area;
      if (a.hasAttribute('aria-current') || a.classList.contains('active')) c.setAttribute('aria-current', 'true');
      c.addEventListener('click', closeSheet); grid.append(c);
    });
    return [h, grid];
  }
  function openSheet(button) {
    if (sheet) { closeSheet(); return; }
    opener = button;
    const cover = document.createElement('div'); cover.className = 'befn-mobile-overlay';
    const panel = document.createElement('section'); panel.className = 'befn-mobile-sheet';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'All Black Eye Fight News sections');
    const head = document.createElement('div'); head.className = 'befn-mobile-sheet-head';
    const h2 = document.createElement('h2'); h2.textContent = 'Explore the fight desk';
    const x = document.createElement('button'); x.type = 'button'; x.textContent = 'Close'; x.addEventListener('click', closeSheet);
    head.append(h2, x);
    const brand = document.querySelector('.sh .sh-brand');
    const sports = [...document.querySelectorAll('.sh .sh-areas a')];
    if (brand) { const all = brand.cloneNode(false); all.textContent = 'All sports (front page)'; sports.unshift(all); }
    const area = document.querySelector('.sh-area-name');
    panel.append(head, ...group('Sports', sports), ...group(area ? area.textContent.trim() : 'Sections', [...document.querySelectorAll('.sh-sections a')]),
      ...group('Pages', [...document.querySelectorAll('[data-sumo-sub] a')].filter(a => !a.hidden)));
    cover.append(panel);
    cover.addEventListener('click', e => { if (e.target === cover) closeSheet(); });
    document.body.append(cover); sheet = cover;
    window.addEventListener('keydown', esc); x.focus();
  }

  function build() {
    const rail = document.querySelector('.sh .navrail');
    if (!rail || rail.querySelector('.befn-phonebar')) return;
    const bar = document.createElement('div'); bar.className = 'befn-phonebar';
    const brand = document.querySelector('.sh .sh-brand');
    const home = document.createElement('a'); home.className = 'befn-phonebar-brand';
    home.href = brand ? brand.getAttribute('href') : '#home'; home.dataset.area = 'all';
    home.setAttribute('aria-label', 'Black Eye Fight News home, all sports');
    home.innerHTML = 'BE<i>FN</i>';
    const sports = document.createElement('nav'); sports.className = 'befn-phonebar-sports'; sports.setAttribute('aria-label', 'Sports');
    document.querySelectorAll('.sh .sh-areas a').forEach(a => sports.append(a.cloneNode(true)));
    const menu = document.createElement('button'); menu.type = 'button'; menu.className = 'befn-phonebar-menu';
    menu.setAttribute('aria-label', 'Menu: all sections, alerts and settings'); menu.innerHTML = MENU;
    menu.addEventListener('click', () => (window.BEFNMobileMenu ? window.BEFNMobileMenu.open(menu) : openSheet(menu)));
    bar.append(home, sports, menu); rail.append(bar);
    /* The main site marks the current sport on its own header links; mirror it here. */
    const sync = () => {
      const now = window.BEFNSport ? window.BEFNSport.get() : null;
      sports.querySelectorAll('a').forEach(a => {
        const on = a.dataset.area ? a.dataset.area === now : !now; /* Sumo's own link is current only on Sumo pages */
        if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
    };
    if (window.BEFNSport) { sync(); document.addEventListener('befn:sport-change', sync); }
  }

  /* Slide the top bar away while reading down; bring it back on any scroll up, near the top,
     or when something in it has focus. */
  function autoHide() {
    const head = document.querySelector('.sh');
    if (!head) return;
    let last = window.scrollY, ticking = false;
    const update = () => {
      ticking = false;
      const y = window.scrollY, dy = y - last;
      const hide = PHONE.matches && !sheet && !document.querySelector('.befn-mobile-overlay') && !head.contains(document.activeElement);
      if (y < 80 || dy < -4 || !hide) head.classList.remove('is-away');
      else if (dy > 6) head.classList.add('is-away');
      if (Math.abs(dy) > 4) last = y;
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    head.addEventListener('focusin', () => head.classList.remove('is-away'));
    window.addEventListener('hashchange', () => head.classList.remove('is-away'));
  }

  function init() { build(); autoHide(); }
  window.BEFNPhoneNav = { openSheet };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
