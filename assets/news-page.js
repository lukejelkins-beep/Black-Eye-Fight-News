/* News page (design option A, "Broadcast"): two lead stories, a photo-led list, and
 * translated Japanese and Spanish headlines. Pure functions so tests can run them in Node.
 * The page code passes in its own helpers (esc, safeURL, meta, photo) and the filtered stories. */
(function (root) {
  'use strict';

  const SPORT_LABEL = { boxing: 'Boxing', mma: 'MMA', grappling: 'Grappling', sumo: 'Sumo' };
  const LANGUAGE_LABEL = { ja: 'Japanese', es: 'Spanish' };

  const time = a => Date.parse(a.publishedAt) || 0;
  const sportLabel = a => SPORT_LABEL[a.sport] || 'Combat sports';

  /* Newest and most covered. The feed names both in `leads`; when it does not, or a named story is
   * filtered out by the sport tab, the best remaining story takes the slot. Never the same story twice. */
  function pickLeads(stories, leads) {
    const byUrl = new Map(stories.map(a => [a.url, a]));
    const newestFallback = [...stories].sort((a, b) => time(b) - time(a))[0] || null;
    const newest = (leads && byUrl.get(leads.newest)) || newestFallback;
    let covered = (leads && byUrl.get(leads.mostCovered)) || null;
    if (!covered || (newest && covered.url === newest.url)) {
      covered = [...stories]
        .filter(a => !newest || a.url !== newest.url)
        .filter(a => (a.coverage || 1) > 1)
        .sort((a, b) => (b.coverage || 1) - (a.coverage || 1) || time(b) - time(a))[0] || null;
    }
    if (!covered && newest) {
      covered = [...stories].filter(a => a.url !== newest.url).sort((a, b) => time(b) - time(a))[0] || null;
    }
    return [
      newest && { story: newest, role: 'newest', label: 'Newest' },
      covered && { story: covered, role: 'covered', label: (covered.coverage || 1) > 1 ? 'Most covered' : 'Next up' }
    ].filter(Boolean);
  }

  function tile(a, h, cls) {
    return '<span class="np-photo np-photo-empty ' + cls + '" aria-hidden="true"><span>' + h.esc(sportLabel(a)) + '</span></span>';
  }

  function photoHTML(a, h, cls) {
    const photo = h.photo(a);
    if (!photo || !photo.url) return tile(a, h, cls);
    return '<span class="np-photo ' + cls + '"><img class="live-news-image" src="' + h.safeURL(photo.url) +
      '" alt="' + h.esc(photo.alt || '') + '" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>';
  }

  function coverageNote(a, h) {
    const n = a.coverage || 1;
    if (n < 2) return '';
    const names = Array.isArray(a.alsoCoveredBy) ? a.alsoCoveredBy.slice(0, 3) : [];
    return '<span class="np-coverage">' + n + ' outlets' + (names.length ? ' · also ' + names.map(h.esc).join(', ') : '') + '</span>';
  }

  function leadHTML(item, h) {
    const a = item.story, href = h.safeURL(a.url);
    return '<article class="np-lead np-lead-' + item.role + '">' +
      '<a class="np-lead-link" href="' + href + '" target="_blank" rel="noopener noreferrer" aria-label="Read ' + h.esc(a.title) + '">' +
      photoHTML(a, h, 'np-lead-photo') +
      '<span class="np-lead-copy">' +
      '<span class="np-chips"><span class="np-chip np-chip-role">' + h.esc(item.label) + '</span>' +
      '<span class="np-chip">' + h.esc(sportLabel(a)) + '</span></span>' +
      '<span class="np-lead-title">' + h.esc(a.title) + '</span>' +
      '<span class="np-lead-meta">' + h.meta(a) + coverageNote(a, h) + '</span>' +
      '</span></a></article>';
  }

  function leadsHTML(leads, h) {
    return leads.length ? '<section class="np-leads" aria-label="Lead stories">' + leads.map(i => leadHTML(i, h)).join('') + '</section>' : '';
  }

  function rowHTML(a, h) {
    const href = h.safeURL(a.url);
    return '<article class="np-row"><a class="np-row-link" href="' + href + '" target="_blank" rel="noopener noreferrer" aria-label="Read ' + h.esc(a.title) + '">' +
      photoHTML(a, h, 'np-row-photo') +
      '<span class="np-row-copy"><span class="np-tag">' + h.esc(sportLabel(a)) + '</span>' +
      '<span class="np-row-title">' + h.esc(a.title) + '</span>' +
      '<span class="np-row-meta">' + h.meta(a) + coverageNote(a, h) + '</span></span></a></article>';
  }

  /* Translated headlines. Only the headline is translated; the link goes to the publisher's own story. */
  function languageHTML(stories, h, limit) {
    /* One story per publisher first (Yahoo! News Japan alone can fill every slot), then fill up from the rest. */
    const all = stories || [], max = limit || 8, picked = [], seen = new Set();
    for (const s of all) { if (picked.length < max && !seen.has(s.source)) { seen.add(s.source); picked.push(s); } }
    for (const s of all) { if (picked.length < max && !picked.includes(s)) picked.push(s); }
    const shown = picked.sort((a, b) => time(b) - time(a));
    if (!shown.length) return '';
    return '<section class="np-intl" aria-label="Translated headlines from Japan">' +
      '<div class="np-section-head"><h2>' + (shown.every(x => x.sport === 'sumo' && x.language === 'ja') ? 'Sumo news from Japan' : 'From Japan and Spain') + '</h2><span class="np-note">Headlines translated by DeepL</span></div>' +
      '<div class="np-intl-grid">' + shown.map(s => {
        const href = h.safeURL(s.url);
        const lang = LANGUAGE_LABEL[s.language] || s.translatedFrom || '';
        return '<article class="np-intl-card"><a href="' + href + '" target="_blank" rel="noopener noreferrer" lang="en">' +
          '<span class="np-chips"><span class="np-chip np-chip-lang">' + h.esc((s.language || '').toUpperCase()) + ' · translated</span>' +
          '<span class="np-chip">' + h.esc(sportLabel(s)) + '</span></span>' +
          '<span class="np-intl-title">' + h.esc(s.title) + '</span>' +
          (s.originalTitle ? '<span class="np-intl-original" lang="' + h.esc(s.language || '') + '">' + h.esc(s.originalTitle) + '</span>' : '') +
          '<span class="np-row-meta"><span class="befn-news-publisher">' + h.esc(s.source || 'Publisher') + '</span>' +
          (lang ? '<span class="befn-news-meta-dot" aria-hidden="true">·</span><span>from ' + h.esc(lang) + '</span>' : '') + '</span>' +
          '</a></article>';
      }).join('') + '</div></section>';
  }

  /* The headline text is cut by the translator at 200 characters, and publisher suffixes like
   * "(Nikkan Sports)" stay in. Hide stories whose translation is missing so nothing untranslated shows. */
  function usableLanguageStories(data, sport) {
    const list = data && Array.isArray(data.stories) ? data.stories : [];
    return list
      .filter(s => s && s.title && s.url && s.language && s.title !== s.originalTitle)
      .filter(s => sport === 'all' || s.sport === sport)
      .sort((a, b) => time(b) - time(a));
  }

  const api = { pickLeads, leadsHTML, rowHTML, languageHTML, usableLanguageStories };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BEFNNewsPage = api;
})(typeof window !== 'undefined' ? window : globalThis);
