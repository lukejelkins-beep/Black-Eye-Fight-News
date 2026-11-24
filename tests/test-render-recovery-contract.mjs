import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const file=fs.readFileSync(".github/workflows/befn-render-deploy-recovery.yml","utf8");
test("recovery listens to validated releases and preserves scheduled fallback",()=>{
 assert.match(file,/workflow_run:\s*\n\s*workflows:\s*\["BEFN release readiness"\]/);
 assert.match(file,/github\.event\.workflow_run\.conclusion == 'success'/);
 assert.match(file,/31 \*\/2 \* \* \*/);
});
test("unvalidated code, truncated comparisons and missing CI cannot deploy",()=>{
 assert.match(file,/status=success/);
 assert.match(file,/compare\/\$validated_sha\.\.\.\$source_sha/);
 assert.match(file,/file_count" -ge 300/);
 assert.match(file,/Unvalidated non-collector change/);
 assert.match(file,/No successful release-readiness commit/);
 // Only machine-written collector output (JSON under data/ or qa/) may follow a checked commit; anything else blocks.
 assert.match(file,/data\/\*\.json\|qa\/\*\.json\)/);
 assert.match(file,/Code, workflows, tests and non-JSON files are never auto-validated here/);
});
test("only drift and checked source permit existing private hook",()=>{
 assert.match(file,/steps\.drift\.outputs\.differences != '0'/);
 assert.match(file,/steps\.gate\.outputs\.approved == 'true'/);
 assert.match(file,/\$RENDER_DEPLOY_HOOK_URL/);
 assert.match(file,/Custom-domain CDN/);
});

test("new verified source assets missing on Render count as drift rather than fatal errors",()=>{
 assert.match(file,/status" == 404/);
 assert.match(file,/New asset not yet deployed/);
 assert.match(file,/Unexpected HTTP \$status.*fail closed/);
 assert.match(file,/Cannot determine live asset state/);
});

test("recheck allows absent new files without suppressing real outages",()=>{
 assert.match(file,/still_different=\$\(\(still_different \+ 1\)\)/);
 assert.match(file,/Unexpected HTTP \$status on recheck; fail closed/);
 assert.match(file,/Production transport unavailable/);
 assert.match(file,/new public file still missing after the grace period/i);
});

test("new commits during the grace window are strictly data-only before using their assets",()=>{
 assert.match(file,/compare\/\$source_sha\.\.\.\$new_main/);
 assert.match(file,/transition_status" != ahead \|\| "\$transition_count" -ge 300/);
 assert.match(file,/Code or unvalidated data changed during grace/);
 assert.match(file,/git fetch --quiet --no-tags origin main/);
 assert.match(file,/git reset --hard "\$new_main"/);
 assert.match(file,/source_sha="\$new_main"/);
 assert.match(file,/new_main=\$\(git rev-parse FETCH_HEAD\)/);
 assert.doesNotMatch(file,/Main advanced again while verifying/);
});

test("both release gates accept only collector-written data JSON, and the V3 snapshot is monitored once created",()=>{
 const pattern="data/*.json|qa/*.json)";
 assert.equal(file.split(pattern).length-1,2,"the source gate and the grace gate both use the same collector-only JSON rule");
 assert.match(file,/Unvalidated non-collector change/);
 assert.match(file,/Code or unvalidated data changed during grace/);
 assert.match(file,/if \[\[ -f data\/ufc-fighter-v3\.json \]\]; then/);
 assert.match(file,/files\+=\(data\/ufc-fighter-v3\.json\)/);
});
test("the offline V3 builder requests guarded recovery only for successfully published changes",()=>{
 const builder=fs.readFileSync(".github/workflows/build-ufc-fighter-v3.yml","utf8");
 assert.match(builder,/actions: write/);
 assert.match(builder,/echo "wrote=true" >> "\$GITHUB_OUTPUT"/);
 assert.match(builder,/if: steps\.publish\.outputs\.wrote == 'true'/);
 assert.match(builder,/befn-render-deploy-recovery\.yml\/dispatches/);
});

test("the exact fetched commit is the sole source of the grace comparison",()=>{
 const idx=file.indexOf("sleep 90");
 const stage=file.slice(idx,file.indexOf("still_different=0",idx));
 assert(idx>=0);
 assert.match(stage,/git fetch --quiet --no-tags origin main/);
 assert.match(stage,/new_main=\$\(git rev-parse FETCH_HEAD\)/);
 assert.doesNotMatch(stage,/^\s*new_main=.*ls-remote/m);
 assert.equal((stage.match(/git fetch --quiet --no-tags origin main/g)||[]).length,1);
 assert.match(file,/Main changed since source validation; aborting recovery/);
});
