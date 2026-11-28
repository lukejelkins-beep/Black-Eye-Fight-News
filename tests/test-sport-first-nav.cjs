/* The front page is the only all-sports page (owner, 28 Nov 2026: "Front page only"). */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function load(store, search = "") {
  const ctx = { localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
    location: { search, hash: "#home", href: "https://x/" + search + "#home", pathname: "/" },
    history: { replaceState: () => {} }, URL, URLSearchParams, CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } },
    document: { addEventListener: () => {}, dispatchEvent: () => {}, querySelectorAll: () => [], body: null }, addEventListener: () => {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("assets/global-sport-v1.0.3.js", "utf8"), ctx);
  return ctx.BEFNSport;
}
// First visit: front page, sections belong to Boxing.
let store = {};
let S = load(store);
assert.equal(S.get(), "all");
assert.equal(S.last(), "boxing", "first visit defaults to Boxing, the first sport tab");
// Choosing MMA is remembered as the last sport, also after going back to the front page.
S.set("mma"); S.set("all");
assert.equal(S.last(), "mma");
assert.equal(load(store).last(), "mma", "kept across visits");
// A shared ?sport=boxing link sets both.
store = {}; S = load(store, "?sport=boxing");
assert.equal(S.get(), "boxing"); assert.equal(S.last(), "boxing");
// The router moves any section other than the front page off "all" to the last sport.
const app = fs.readFileSync("assets/app-inline-2.js", "utf8");
assert.match(app, /if\(key!=='home'&&activeSport\(\)==='all'&&window\.BEFNSport\?\.last\)\{window\.BEFNSport\.set\(window\.BEFNSport\.last\(\)\)/);
assert.match(app, /!\(key==='home'&&activeSport\(\)==='all'\)/, "no section is marked current on the front page");
console.log("sport-first navigation: ok");
