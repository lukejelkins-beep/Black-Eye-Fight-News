/* Speed (28 Nov 2026): live feeds are downloaded once per page and shared, and the large profile-only files load only
   when a profile (or a result / matchup panel, or the old fighter grid) is on screen. */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

(async () => {
  // 1. BEFNFeed: two callers in the same minute share one pair of downloads; newest copy wins; ties keep GitHub's.
  const seen = [];
  const ctx = { fetch: async url => { seen.push(url); const raw = url.startsWith("https://raw.githubusercontent.com/");
      return { ok: true, json: async () => ({ who: raw ? "github" : "site", lastSuccessfulAt: raw ? "2026-11-28T01:00:00Z" : "2026-11-28T02:00:00Z", articles: [] }) }; },
    AbortSignal: { timeout: () => undefined }, Date, Promise, Map, Math };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("assets/feed-cache.js", "utf8"), ctx);
  const F = ctx.BEFNFeed;
  const [a, b] = await Promise.all([F.newest("data/news-live.json", d => Array.isArray(d.articles)), F.newest("data/news-live.json")]);
  assert.equal(seen.length, 2, "one GitHub and one site download, shared by both callers");
  assert.equal(a.who, "site", "the newer copy wins");
  assert.equal(b.who, "site");
  const tie = await F.newest("data/news-live.json", null, { stamp: () => 0 });
  assert.equal(tie.who, "github", "with no newer copy, the GitHub copy is kept first, as results.js did");
  assert.equal(seen.length, 2, "still no new download inside the minute");
  await F.local("data/ufcalendar-card-enhancements.json"); await F.local("data/ufcalendar-card-enhancements.json");
  assert.equal(seen.filter(u => u.includes("card-enhancements")).length, 1, "a site-only file is downloaded once per hour");

  // 2. fighter-insights.js on a page with no profile: no request for the two large profile-only files.
  const asked = [];
  const listeners = new Map();
  const win = { location: { hash: "#home" }, COMBAT_DATA: { fighters: [], champions: { mma: [] } },
    BEFNPowerIndex: { normalize: x => String(x || "").toLowerCase() }, BEFNUfcClassifier: { classify: () => ({}) },
    addEventListener: (t, fn) => { (listeners.get(t) || listeners.set(t, []).get(t)).push(fn); }, dispatchEvent: () => {} };
  const doc = { addEventListener: () => {}, querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, body: {} };
  const sb = { window: win, document: doc, fetch: url => { asked.push(String(url).split("?")[0]); return new Promise(() => {}); },
    requestAnimationFrame: () => 1, Event: class { constructor(t) { this.type = t; } }, CustomEvent: class { constructor(t) { this.type = t; } }, Map, Set, console };
  vm.runInNewContext(fs.readFileSync("assets/fighter-insights.js", "utf8"), sb, { filename: "assets/fighter-insights.js" });
  assert(!asked.includes("data/ufc-postfight-metrics.json"), "post-fight totals (6.8 MB) are not loaded on a page with no profile");
  assert(!asked.includes("data/ufc-fighter-v3.json"), "the V3 snapshot (1.7 MB) is not loaded on a page with no profile");
  // Opening a profile starts both.
  win.location.hash = "#fighter/ufc--islam-makhachev";
  for (const fn of listeners.get("hashchange") || []) fn({ type: "hashchange" });
  assert(asked.includes("data/ufc-postfight-metrics.json") && asked.includes("data/ufc-fighter-v3.json"), "opening a profile loads them");
  console.log("feed cache and on-demand profile data: ok");
})().catch(e => { console.error(e); process.exit(1); });
