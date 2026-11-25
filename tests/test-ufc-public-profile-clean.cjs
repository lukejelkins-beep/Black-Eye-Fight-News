#!/usr/bin/env node
// Audit provenance and scoring internally; keep public fighter cards editorially clean.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const html=require('./helpers/read-index.cjs')();
const insights=fs.readFileSync("assets/fighter-insights.js","utf8");
const modal=html.slice(html.indexOf("function openFighter(id){"),html.indexOf("function navigate(){"));
const section=(start,end)=>{const a=insights.indexOf(start),z=insights.indexOf(end,a);assert(a>=0&&z>a,"Missing frontend rendering boundary: "+start);return insights.slice(a,z)};
const profile=section("function renderProfile(f){","function scoreTier(");
const v3Profile=section("function renderV3Profile(f,v3,kind){","function renderV3Boards(){");
const boards=section("function renderV3Boards(){","function applyV3(f){");
const snapshot=insights.slice(insights.indexOf("function renderSnapshot(article){"),insights.indexOf("let timer=null;"));
const tracked=insights.slice(insights.indexOf("function trackedMetricHTML(f){"),insights.indexOf("function classificationHTML(f){"));
// Profile design A (owner, 2026-11-25): openFighter hands the dialog to assets/fighter-profile-a.js, whose Overview
// lists the recent fights (it replaced the "Five most recent results" table).
const profileA=fs.readFileSync("assets/fighter-profile-a.js","utf8");
assert(modal.includes("PA.render(dialog,f,"),"openFighter renders the design A profile");
assert(profileA.includes("<h3>Recent fights</h3>"),"Keep fight outcomes");
assert(profile.includes("Fighter ratings"),"Keep fighter skill ratings");
assert(profile.includes("trackedMetricHTML(f)"),"Keep UFC statistics");
for(const [name,markup] of [["modal",modal],["ratings",profile],["V3 ratings",v3Profile],["fight snapshot",snapshot],["postfight stats",tracked],["profile A",profileA]]){
 assert(!/<h3>Source links<\/h3>|View stats source|How are MMA scores|credentialScoreDetail|ratingSource|ratingsEvidence|scoreMethodHTML|record caution|verificationNote|Source: saved|source reports/i.test(markup),
  name+": public research/methodology content found");
 assert(!/<a\s+href=/i.test(markup),name+": public research link found");
}
// A statistics *navigation* page may link to the site's own fighter pages,
// but must never expose methodology, research reports or external source URLs.
assert(/<a href="#fighter\//.test(boards),
 "UFC rankings should use verified internal profile navigation");
assert(!/<a\s+href=["'](?:https?:|\/\/)/i.test(boards),
 "Leaderboard cannot expose external source or research links");
assert(!/ratingSource|ratingsEvidence|scoreMethodHTML|View stats source|Source: saved/i.test(boards),
 "Leaderboard must not reveal calculation or research internals");
assert(!insights.includes("data-credential-source="),"Badge should not reveal source URL");
assert(!insights.includes('link.textContent=" · Source"'),"Badge should not render source link");
console.log("Public fighter presentation policy passed");
