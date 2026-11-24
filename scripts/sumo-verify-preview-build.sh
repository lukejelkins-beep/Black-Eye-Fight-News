#!/usr/bin/env bash
# Run the exact Render static preview build tests against the already-synced
# Sumo test branch. This is QA only: no publishing or production edits.
set -euo pipefail
PREVIEW_BRANCH="feat/sumo-section-test-20261114"
git fetch origin "$PREVIEW_BRANCH"
ROOT="$(mktemp -d /tmp/befn-sumo-preview-qa-XXXXXX)"
cleanup(){ git worktree remove -f "$ROOT" >/dev/null 2>&1 || true; rmdir "$ROOT" >/dev/null 2>&1 || true; }
trap cleanup EXIT
git worktree add --detach "$ROOT" "origin/$PREVIEW_BRANCH"
cd "$ROOT"
node --check assets/sumo.js
node --check assets/sumo-data.mjs
node --check assets/sumo-career.mjs
node --test tests/test-sumo-api-source.mjs
node --test tests/test-sumo-data.mjs
node --test tests/test-sumo-photo-credits.mjs
node --test tests/test-sumo-career-no-synthetic-weights.mjs
echo "Sumo preview branch passed Render-equivalent source and 190-rikishi career tests."
