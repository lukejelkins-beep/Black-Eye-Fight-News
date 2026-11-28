/* Consistent cut-outs (owner, 28 Nov 2026: "make them a consistent size ... seamless cutouts").
 * Every cut-out is placed so its head is the same width and its crown at the same height, whatever the source framing.
 * Head measurements come from data/ufc-cutout-head-metrics.json (scripts/build-cutout-head-metrics.py).
 *
 * BEFNCutoutFit.load()                         -> Promise, resolves when the measurements are in (or unavailable)
 * BEFNCutoutFit.style(set, slug, {head, crown}) -> inline style for an <img> inside a position:relative box, or ''
 *   set: 'champion' (official belt portraits) or 'fighter' (per-fighter cut-outs); head: head width in px;
 *   crown: px from the top of the box to the crown. The image is centred on the head, not on the file.
 *   box: [w, h] for photographs, which must cover the slot (see fit). Sets: champion, fighter, boxer, boxerPhoto. */
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
  /* o.box = [width, height] of the slot (photographs only): a photograph has a background, so it must cover the
     slot. It is enlarged if the head size would leave it smaller than the slot, and kept inside the slot's edges. */
  function fit(m, o) {
    const [W, H, top, headW, cx] = m;
    if (!(headW > 0)) return '';
    const px = v => Math.round(v * 10) / 10 + 'px';
    let s = o.head / headW;
    if (o.box && H > 0) {
      const [bw, bh] = o.box;
      s = Math.max(s, bw / W, bh / H);
      const left = Math.min(0, Math.max(bw - W * s, bw / 2 - cx * s));
      const y = Math.min(0, Math.max(bh - H * s, o.crown - top * s));
      return 'position:absolute;max-width:none;height:auto;width:' + px(W * s) + ';left:' + px(left) + ';top:' + px(y);
    }
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
