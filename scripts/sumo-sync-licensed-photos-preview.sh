#!/usr/bin/env bash
# Optional CC BY-SA image stage for Sumo PREVIEW only.
# No publication on main or production. Existing files are immutable.
set -euo pipefail
SOURCE_ROOT="$(pwd)"
CANDIDATES="$SOURCE_ROOT/data/sumo/photo-candidates-cc.json"
PREVIEW_BRANCH="feat/sumo-section-test-20261114"
[[ -s "$CANDIDATES" ]] || { echo "No vetted CC candidates" >&2; exit 0; }
git config user.name "BEFN Sumo licensed-image preview"
git config user.email "sumo-image-preview@users.noreply.github.com"
git fetch origin "$PREVIEW_BRANCH"
PREVIEW_ROOT="$(mktemp -d /tmp/befn-sumo-cc-preview-XXXXXX)"
trap 'git worktree remove -f "$PREVIEW_ROOT" >/dev/null 2>&1 || true; rmdir "$PREVIEW_ROOT" >/dev/null 2>&1 || true' EXIT
git worktree add --detach "$PREVIEW_ROOT" "origin/$PREVIEW_BRANCH"
cd "$PREVIEW_ROOT"
SUMO_ISOLATED_TEST_WORKTREE=true SUMO_CC_CANDIDATES="$CANDIDATES" \
 node "$SOURCE_ROOT/scripts/sumo-stage-cc-photos-preview.mjs"
git add data/sumo/approved-photos.json data/sumo/photo-import-status.json sumo-photo-credits.html
if [[ -d assets/sumo-photos ]]; then git add assets/sumo-photos; fi
if git diff --cached --quiet; then
 echo "Licensed image and credit files already current; no repeat download or commit."
 exit 0
fi
git commit -m "Stage verified Commons CC BY-SA Sumo portraits with source credits (test only)"
for attempt in 1 2 3 4; do
 git fetch origin "$PREVIEW_BRANCH"
 if ! git rebase "origin/$PREVIEW_BRANCH"; then
  git rebase --abort || true
  echo "Concurrent preview image updates conflict; preserving both branches" >&2
  exit 1
 fi
 if git push origin "HEAD:$PREVIEW_BRANCH"; then
  echo "Verified licensed portraits and credits staged in isolated Sumo preview."
  exit 0
 fi
 sleep 3
done
echo "Could not stage Sumo photo assets after concurrent updates" >&2
exit 1
