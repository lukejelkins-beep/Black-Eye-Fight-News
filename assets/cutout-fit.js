/* Consistent cut-outs (owner, 28 Nov 2026: "make them a consistent size ... seamless cutouts").
 * Every cut-out is placed so its head is the same width and its crown at the same height, whatever the source framing.
 * Head measurements come from data/ufc-cutout-head-metrics.json (scripts/build-cutout-head-metrics.py).
 *
 * BEFNCutoutFit.load()                         -> Promise, resolves when the measurements are in (or unavailable)
 * BEFNCutoutFit.style(set, slug, {head, crown}) -> inline style for an <img> inside a position:relative box, or ''
 *   set: 'champion' (official belt portraits) or 'fighter' (per-fighter cut-outs); head: head width in px;
 *   crown: px from the top of the box to the crown. The image is centred on the head, not on the file. */
(function (root) {
  'use strict';
  let sets = null, pending = null;
  function load() {
    if (sets) return Promise.resolve(sets);
    if (!pending) pending = fetch('data/ufc-cutout-head-metrics.json').then(r => (r.ok ? r.json() : null))
      .then(d => { sets = d && d.schema === 1 && d.sets ? d.sets : {}; return sets; })
      .catch(() => { sets = {}; return sets; });
    return pending;
  }
  function fit(m, o) {
    const [W, , top, headW, cx] = m;
    if (!(headW > 0)) return '';
    const s = o.head / headW, px = v => Math.round(v * 10) / 10 + 'px';
    return 'position:absolute;max-width:none;height:auto;width:' + px(W * s) + ';left:calc(50% - ' + px(cx * s) + ');top:' + px(o.crown - top * s);
  }
  function style(set, slug, o) {
    const m = sets && sets[set] && sets[set][slug];
    return m ? fit(m, o) : '';
  }
  const api = { load, style, fit, ready: () => !!sets };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BEFNCutoutFit = api;
})(typeof window !== 'undefined' ? window : globalThis);
