/* One download per live feed per page (speed, 28 Nov 2026).
 *
 * The live feeds (news, results, upcoming cards, grappling) are read from two places, the repository's raw copy on
 * GitHub (updated the moment a data bot pushes) and the site's own copy (updated when Render redeploys), and the
 * newer one wins. Several scripts did this on their own, so the front page downloaded results.json, news-live.json
 * and upcoming-cards.json up to four times each. Now the first script to ask starts the two downloads and every
 * other script in the same minute shares them. Each caller still applies its own check and picks the newest copy,
 * exactly as before.
 *
 * BEFNFeed.both(path, {bucketMs, timeoutMs}) -> Promise<[githubCopy|null, siteCopy|null]>
 * BEFNFeed.newest(path, validate, opts)       -> Promise<the newest copy that passes validate, or null>; opts.stamp(d)
 *                                                 sets the caller's own "newest" rule
 * BEFNFeed.local(path, {bucketMs})            -> Promise<the site's copy or null> (files with no GitHub copy)
 */
(function (root) {
  'use strict';
  const RAW = 'https://raw.githubusercontent.com/lukejelkins-beep/Black-Eye-Fight-News/main/';
  const cache = new Map();
  // Default "newest" rule, the news desk's: lastSuccessfulAt, else reviewedAt. A caller with its own rule passes o.stamp.
  const stamp = d => Date.parse(d && (d.lastSuccessfulAt || d.reviewedAt)) || 0;

  function get(url, timeoutMs) {
    const opts = { cache: 'no-store' };
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) opts.signal = AbortSignal.timeout(timeoutMs || 15000);
    return fetch(url, opts).then(r => (r.ok ? r.json() : null)).catch(() => null);
  }
  function remember(key, bucketMs, make) {
    const now = Date.now(), hit = cache.get(key);
    if (hit && now - hit.at < bucketMs) return hit.promise;
    const promise = make(Math.floor(now / bucketMs));
    cache.set(key, { at: now, promise });
    return promise;
  }
  function both(path, o) {
    const bucketMs = (o && o.bucketMs) || 60000, t = o && o.timeoutMs;
    return remember('both:' + path, bucketMs, b => Promise.all([get(RAW + path + '?t=' + b, t), get(path + '?t=' + b, t)]));
  }
  function newest(path, validate, o) {
    const by = (o && o.stamp) || stamp;   // ties keep the GitHub copy first, as before
    return both(path, o).then(list => list.filter(d => d && (!validate || validate(d)))
      .sort((a, b) => by(b) - by(a))[0] || null);
  }
  function local(path, o) {
    const bucketMs = (o && o.bucketMs) || 3600000;
    return remember('local:' + path, bucketMs, b => get(path + '?t=' + b, o && o.timeoutMs));
  }
  const api = { both, newest, local, _stamp: stamp, _cache: cache };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BEFNFeed = api;
})(typeof window !== 'undefined' ? window : globalThis);
