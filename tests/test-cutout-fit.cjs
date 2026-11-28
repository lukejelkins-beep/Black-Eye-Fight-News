/* Consistent cut-outs (owner, 28 Nov 2026): every head the same width, every crown at the same height. */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Fit = require("../assets/cutout-fit.js");
const data = JSON.parse(fs.readFileSync("data/ufc-cutout-head-metrics.json", "utf8"));
assert.equal(data.schema, 1);
assert.deepEqual(data.fields, ["W", "H", "top", "headW", "cx"]);
// Every owner-supplied champion belt cut-out is measured.
const reg = JSON.parse(fs.readFileSync("data/ufc-champion-photo-register.json", "utf8"));
for (const p of reg.photos) assert.ok(data.sets.champion[p.slug], "champion measured: " + p.slug);
// The placement: head scaled to the target width, crown at the target height, centred on the head.
const px = (style, key) => Number((style.match(new RegExp(key + ":(-?[\\d.]+)px")) || [])[1]);
for (const [slug, m] of Object.entries(data.sets.champion)) {
  const style = Fit.fit(m, { head: 44, crown: 4 });
  const s = 44 / m[3];
  assert.ok(Math.abs(px(style, "width") - m[0] * s) < 0.11, slug + " width");
  assert.ok(Math.abs(px(style, "top") - (4 - m[2] * s)) < 0.11, slug + " crown");
  assert.match(style, new RegExp("left:calc\\(50% - " + (Math.round(m[4] * s * 10) / 10) + "px\\)"), slug + " centred on the head");
}
assert.equal(Fit.fit([400, 500, 10, 0, 200], { head: 40, crown: 0 }), "", "no measurement, no placement");
console.log("cutout fit: ok");
