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
 assert.doesNotMatch(file,/data\/\*/);
});
test("only drift and checked source permit existing private hook",()=>{
 assert.match(file,/steps\.drift\.outputs\.differences != '0'/);
 assert.match(file,/steps\.gate\.outputs\.approved == 'true'/);
 assert.match(file,/\$RENDER_DEPLOY_HOOK_URL/);
 assert.match(file,/Custom-domain CDN/);
});
