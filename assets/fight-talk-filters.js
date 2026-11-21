/* Fight Talk filters (Phase 2, step 4): promotion and fighter, with the same labels as the Fights page
 * (All sports / Boxing / MMA / Grappling come from the site-wide sport filter; MMA organisations are UFC, ONE, PFL).
 * Posts carry no promotion field, so a post counts for a promotion only when it is
 *   1. from that promotion's own promoter account (author name), or
 *   2. its author, or a fighter named in its text, is on an announced card of that promotion
 *      (exact or close-spelling name match, see related-news.js).
 * No other guessing: a post that fits neither is left out of a promotion filter.
 * Pure functions so tests can run them in Node. */
(function (root) {
  'use strict';

  const PROMOTIONS = { all: 'All promotions', ufc: 'UFC', one: 'ONE', pfl: 'PFL' };
  /* The same patterns the Fights page uses on an event's promotion; accounts add the exact official names. */
  const EVENT_PATTERN = { ufc: /\bufc\b|ultimate fighting championship/, one: /\bone\b|one championship/, pfl: /\bpfl\b|professional fighters league/ };
  const ACCOUNT_PATTERN = { ufc: /^ufc\b/, one: /^one championship\b/, pfl: /^pfl\b/ };

  const fold = text => String(text == null ? '' : text).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const postText = p => [p && p.name, p && (p.quote || p.summary)].filter(Boolean).join(' ');
  const related = () => (root.BEFNRelatedNews || (typeof require === 'function' ? require('./related-news.js') : null));

  /* { ufc: [fighter names], one: [...], pfl: [...] } from upcoming-card events (MMA only; unknown promotions ignored). */
  function cardIndex(events) {
    const index = { ufc: new Set(), one: new Set(), pfl: new Set() };
    for (const e of Array.isArray(events) ? events : []) {
      if (!e || e.sport !== 'mma' || !Array.isArray(e.bouts)) continue;
      const promo = String(e.promotion || '').toLowerCase();
      const key = Object.keys(EVENT_PATTERN).find(k => EVENT_PATTERN[k].test(promo));
      if (!key) continue;
      for (const b of e.bouts) for (const name of Array.isArray(b && b.fighters) ? b.fighters : []) if (name) index[key].add(String(name));
    }
    return Object.fromEntries(Object.entries(index).map(([k, v]) => [k, [...v]]));
  }

  /* Promotions this post belongs to, as a set of keys. `index` may be null while the cards are loading. */
  function postPromotions(post, index) {
    const found = new Set();
    const author = fold(post && post.name).trim();
    /* Only a promoter account counts as the promotion's own; fan and meme pages that borrow the name do not. */
    if (!post || !post.role || post.role === 'promoter') for (const key of Object.keys(ACCOUNT_PATTERN)) if (ACCOUNT_PATTERN[key].test(author)) found.add(key);
    const rn = related();
    if (index && rn) {
      const text = postText(post);
      for (const key of Object.keys(index)) {
        if (found.has(key)) continue;
        if (index[key].some(name => rn.namedIn(text, name))) found.add(key);
      }
    }
    return found;
  }

  /* Fighter search: folded text in the author's name or the post. Blank matches everything. */
  function matchesFighter(post, query) {
    const q = fold(query).replace(/\s+/g, ' ').trim();
    return !q || fold(postText(post)).replace(/\s+/g, ' ').includes(q);
  }

  /* Promotion applies to MMA only (as on the Fights page); under another sport it is ignored. */
  function filterPosts(posts, options, index) {
    const o = options || {};
    const usePromotion = o.sport === 'mma' && Object.hasOwn(EVENT_PATTERN, o.promotion);
    return (posts || []).filter(p => matchesFighter(p, o.query) && (!usePromotion || postPromotions(p, index).has(o.promotion)));
  }

  const api = { PROMOTIONS, cardIndex, postPromotions, matchesFighter, filterPosts };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BEFNTalkFilters = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
