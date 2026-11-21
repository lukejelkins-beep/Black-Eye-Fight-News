/* Related news for fight cards and fighter profiles (Phase 2, step 3).
 * A story is related to a fighter only when its HEADLINE names the fighter: the same name parts in any
 * order ("Su-hyeon Kim" = "Kim Suhyeon"), or the same parts with one spelled almost the same
 * (Maldozhanova / Moldazhanova). These are the results importer's rules in scripts/import-finished-results.py
 * (name_key, close_spelling) minus its surname-only fallback, which is too loose for headlines.
 * One-word names, and no match at all, show nothing: no guessing.
 * Pure functions so tests can run them in Node. */
(function (root) {
  'use strict';

  const fold = text => String(text == null ? '' : text).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /* Name parts the way the importer's name_key makes them: no (c)/(ic) tags, no hyphens, apostrophes or dots. */
  function parts(name) {
    const text = fold(name).replace(/\((?:c|ic)\)/g, '').replace(/[’‘`]/g, "'").replace(/[-'.]/g, '');
    return text.match(/[a-z0-9]+/g) || [];
  }

  /* Headline words. A trailing possessive is dropped first ("Turhan's" -> "turhan"). */
  function words(title) {
    const text = fold(title).replace(/[’‘`]/g, "'").replace(/'s\b/g, '').replace(/[-'.]/g, '');
    return text.match(/[a-z0-9]+/g) || [];
  }

  /* Python difflib.SequenceMatcher(None, a, b).ratio(), so "close spelling" means exactly what it does in the importer. */
  function ratio(a, b) {
    function matching(alo, ahi, blo, bhi) {
      let best = [alo, blo, 0];
      const lengths = new Map();
      let previous = new Map();
      for (let i = alo; i < ahi; i++) {
        const current = new Map();
        for (let j = blo; j < bhi; j++) {
          if (a[i] !== b[j]) continue;
          const k = (previous.get(j - 1) || 0) + 1;
          current.set(j, k);
          if (k > best[2]) best = [i - k + 1, j - k + 1, k];
        }
        previous = current;
      }
      lengths.clear();
      const [i, j, k] = best;
      if (!k) return 0;
      return k + (i > alo && j > blo ? matching(alo, i, blo, j) : 0) +
        (i + k < ahi && j + k < bhi ? matching(i + k, ahi, j + k, bhi) : 0);
    }
    const total = a.length + b.length;
    return total ? (2 * matching(0, a.length, 0, b.length)) / total : 1;
  }

  /* Same sorted name parts except one, and that one spelled nearly the same. Importer: close_spelling. */
  function closeSpelling(x, y) {
    if (x.length !== y.length || x.length < 2) return false;
    const diff = x.map((p, i) => [p, y[i]]).filter(([p, q]) => p !== q);
    return diff.length === 1 && Math.min(diff[0][0].length, diff[0][1].length) >= 5 && ratio(diff[0][0], diff[0][1]) >= 0.8;
  }

  /* Prepared once per fighter: sorted name parts. Names with fewer than two parts are not matchable. */
  function prepare(name) {
    const p = parts(name).sort();
    return p.length >= 2 ? { name: String(name), key: p } : null;
  }

  /* Does the headline name this fighter? Looks at every run of headline words as long as the name. */
  function names(titleWords, who) {
    const n = who.key.length;
    for (let i = 0; i + n <= titleWords.length; i++) {
      const window = titleWords.slice(i, i + n).sort();
      if (window.join(' ') === who.key.join(' ') || closeSpelling(window, who.key)) return true;
    }
    return false;
  }

  const time = a => Date.parse(a && a.publishedAt) || 0;
  const usable = a => a && typeof a.title === 'string' && a.title && /^https:\/\//.test(a.url || '') && a.source && time(a);

  /* The latest `limit` stories whose headline names any of `fighterNames`, newest first.
   * Each result is { story, matched: [fighter names] }. Stories need a title, https link, source and date. */
  function relatedNews(stories, fighterNames, limit) {
    const who = [...new Map((fighterNames || []).map(prepare).filter(Boolean).map(w => [w.key.join(' '), w])).values()];
    if (!who.length || !Array.isArray(stories)) return [];
    const seen = new Set();
    return stories
      .filter(usable)
      .sort((a, b) => time(b) - time(a))
      .map(story => { const w = words(story.title); return { story, matched: who.filter(f => names(w, f)).map(f => f.name) }; })
      .filter(r => r.matched.length && !seen.has(r.story.url) && seen.add(r.story.url))
      .slice(0, limit == null ? 3 : limit);
  }

  /* Markup. `h` carries the page's own esc and safeURL; `when` formats a date. Empty string when nothing matched. */
  function relatedHTML(items, h, options) {
    if (!items || !items.length) return '';
    const opts = options || {};
    const when = opts.when || (iso => String(iso).slice(0, 10));
    const heading = opts.heading || 'Related news';
    const rows = items.map(({ story, matched }) =>
      '<li class="rn-item"><a class="rn-link" href="' + h.safeURL(story.url) + '" target="_blank" rel="noopener noreferrer">' + h.esc(story.title) + '</a>' +
      '<span class="rn-meta"><span class="rn-source">' + h.esc(story.source) + '</span> · <time datetime="' + h.esc(story.publishedAt) + '">' + h.esc(when(story.publishedAt)) + '</time>' +
      (opts.showNames ? ' · <span class="rn-names">' + h.esc(matched.join(', ')) + '</span>' : '') + '</span></li>').join('');
    return '<section class="rn-block" aria-label="' + h.esc(heading) + '"><div class="rn-head"><strong>' + h.esc(heading) + '</strong><span>Latest ' + items.length + '</span></div><ul class="rn-list">' + rows + '</ul></section>';
  }

  const api = { parts, words, ratio, closeSpelling, relatedNews, relatedHTML };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BEFNRelatedNews = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
