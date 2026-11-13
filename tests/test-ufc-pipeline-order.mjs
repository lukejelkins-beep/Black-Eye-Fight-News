import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("UFC coverage audit always runs after the latest derived postfight metrics",()=>{
 const yaml=fs.readFileSync(".github/workflows/build-ufc-profile-queue.yml","utf8");
 const post=yaml.indexOf("node scripts/build-ufc-postfight-metrics.mjs");
 const history=yaml.indexOf("node scripts/build-ufc-last-five-coverage.mjs");
 assert(post>=0&&history>=0,"both source-derived stages are required");
 assert(post<history,"last-five coverage cannot use stale metric inputs");
 assert.match(yaml,/git add data\/ufc-profile-research-queue\.json data\/ufc-postfight-metrics\.json data\/ufc-last-five-coverage\.json/);
 assert.match(yaml,/node --test tests\/test-ufc-last-five-coverage\.mjs/);
});
