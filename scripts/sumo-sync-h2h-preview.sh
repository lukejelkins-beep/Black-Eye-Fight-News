#!/usr/bin/env bash
# Sync only validated, research-only H2H previews into the isolated Sumo
# design branch. Do not merge, deploy to production, or force push.
set -euo pipefail
SOURCE_BRANCH="research/sumo-190-career-cache-20261114"
PREVIEW_BRANCH="feat/sumo-section-test-20261114"
SRC="data/sumo/exports"
if [[ ! -s "$SRC/h2h-summary.json" || ! -s "$SRC/h2h-history.json" ]]; then
  echo "Research H2H export missing; refusing preview sync" >&2; exit 1
fi
node --input-type=module -e '
import{readFileSync}from"node:fs";
const a=JSON.parse(readFileSync("data/sumo/exports/h2h-summary.json"));
const b=JSON.parse(readFileSync("data/sumo/exports/h2h-history.json"));
if(a.cohortSize!==190||a.profileCount!==190||b.cohortSize!==190||b.certified!==false||
   !Object.keys(a.activePairs).length||!Object.keys(b.pairs).length)process.exit(2);
'
git config user.name "BEFN Sumo research preview sync"
git config user.email "sumo-preview-sync@users.noreply.github.com"
git fetch origin "$PREVIEW_BRANCH"
PREVIEW_ROOT="$(mktemp -d /tmp/befn-sumo-h2h-sync-XXXXXX)"
trap 'git worktree remove -f "$PREVIEW_ROOT" >/dev/null 2>&1 || true; rmdir "$PREVIEW_ROOT" 2>/dev/null || true' EXIT
git worktree add --detach "$PREVIEW_ROOT" "origin/$PREVIEW_BRANCH"
mkdir -p "$PREVIEW_ROOT/data/sumo"
cp "$SRC/h2h-summary.json" "$PREVIEW_ROOT/data/sumo/research-h2h-summary.json"
cp "$SRC/h2h-history.json" "$PREVIEW_ROOT/data/sumo/research-h2h-history.json"
cd "$PREVIEW_ROOT"
git add data/sumo/research-h2h-summary.json data/sumo/research-h2h-history.json
if git diff --cached --quiet; then
  echo "Sumo preview H2H cache already current. Skipping duplicate deployment."
  exit 0
fi
git commit -m "Sync source-backed Sumo head-to-head cache (research only)"
for attempt in 1 2 3 4; do
  git fetch origin "$PREVIEW_BRANCH"
  if ! git rebase "origin/$PREVIEW_BRANCH"; then
    git rebase --abort || true
    echo "Concurrent Sumo preview changes conflict; no force push attempted" >&2
    exit 1
  fi
  if git push origin "HEAD:$PREVIEW_BRANCH"; then
    echo "Isolated Sumo preview synchronized from research source."
    exit 0
  fi
  sleep 3
done
echo "Could not sync preview after four attempts; original branches preserved." >&2
exit 1
