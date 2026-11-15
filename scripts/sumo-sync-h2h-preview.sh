#!/usr/bin/env bash
# Sync validated research-only H2H and career timelines into isolated Sumo
# design branch. Do not merge, deploy to production, or force push.
set -euo pipefail
SOURCE_BRANCH="research/sumo-190-career-cache-20261114"
PREVIEW_BRANCH="feat/sumo-section-test-20261114"
SRC="data/sumo/exports"
if [[ ! -s "$SRC/h2h-summary.json" || ! -s "$SRC/h2h-opponents.json" || ! -s "$SRC/h2h-history.json" ||
      ! -s "$SRC/career-history.json" ]]; then
  echo "Research H2H or career timeline export missing; refusing preview sync" >&2; exit 1
fi
node --input-type=module -e '
import{readFileSync}from"node:fs";
const a=JSON.parse(readFileSync("data/sumo/exports/h2h-summary.json"));
const b=JSON.parse(readFileSync("data/sumo/exports/h2h-history.json"));
const o=JSON.parse(readFileSync("data/sumo/exports/h2h-opponents.json"));
const c=JSON.parse(readFileSync("data/sumo/exports/career-history.json"));
if(c.schemaVersion!==1||c.cohortSize!==190||c.certified!==false||c.productionPublished!==false||
   Object.keys(c.bySourceId||{}).length!==190||
   Object.values(c.bySourceId).some(p=>
      p.certified!==false||!Array.isArray(p.weight)||!Array.isArray(p.rank)||
      p.weight.some(m=>!/^(18|19|20)[0-9]{2}(01|03|05|07|09|11)$/.test(m.basho)||
         !(m.kg>=45&&m.kg<=400)||m.independentlyCertified!==false)||
      p.currentListedWeight?.datedMeasurement===true))process.exit(3);
if(a.cohortSize!==190||a.profileCount!==190||b.cohortSize!==190||b.certified!==false||o.profileCount!==190||
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
cp "$SRC/h2h-opponents.json" "$PREVIEW_ROOT/data/sumo/research-h2h-opponents.json"
cp "$SRC/h2h-history.json" "$PREVIEW_ROOT/data/sumo/research-h2h-history.json"
cp "$SRC/career-history.json" "$PREVIEW_ROOT/data/sumo/career-history.json"
cd "$PREVIEW_ROOT"
git add data/sumo/research-h2h-summary.json data/sumo/research-h2h-opponents.json data/sumo/research-h2h-history.json data/sumo/career-history.json
if git diff --cached --quiet; then
  echo "Sumo preview H2H and career caches already current. Skipping duplicate deployment."
  exit 0
fi
git commit -m "Sync source-backed Sumo H2H and career timelines (research only)"
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
