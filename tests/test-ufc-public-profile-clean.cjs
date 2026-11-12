#!/usr/bin/env node
// Audit provenance and scoring internally; keep public fighter cards editorially clean.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const html=fs.readFileSync("index.html","utf8");
const insights=fs.readFileSync("assets/fighter-insights.js","utf8");
const modal=html.slice(html.indexOf("function openFighter(id){"),html.indexOf("function navigate(){"));
const profile=insights.slice(insights.indexOf("function renderProfile(f){"),insights.indexOf("function getName(article,side){"));
const snapshot=insights.slice(insights.indexOf("function renderSnapshot(article){"),insights.indexOf("let timer=null;"));
const tracked=insights.slice(insights.indexOf("function trackedMetricHTML(f){"),insights.indexOf("function classificationHTML(f){"));
assert(modal.includes("Five most recent results"),"Keep fight outcomes");
assert(profile.includes("Fighter ratings"),"Keep fighter skill ratings");
assert(profile.includes("trackedMetricHTML(f)"),"Keep UFC statistics");
for(const [name,markup] of [["modal",modal],["ratings",profile],["fight snapshot",snapshot],["postfight stats",tracked]]){
 assert(!/<h3>Source links<\/h3>|View stats source|How are MMA scores|credentialScoreDetail|ratingSource|ratingsEvidence|scoreMethodHTML|record caution|verificationNote|Source: saved|source reports/i.test(markup),
  name+": public research/methodology content found");
 assert(!/<a\s+href=/i.test(markup),name+": public research link found");
}
assert(!insights.includes("data-credential-source="),"Badge should not reveal source URL");
assert(!insights.includes('link.textContent=" · Source"'),"Badge should not render source link");
console.log("Public fighter presentation policy passed");
