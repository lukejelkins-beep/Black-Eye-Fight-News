# Phase 3 plan: fighter snapshots on upcoming cards

Status: **proposal, waiting for the owner's OK.** Nothing here is built yet. Each step is its own PR and needs "Merge N".

Numbering note: `REVIEW-2026-11-17.md` still labels Phase 3 "polish and speed". `PHASE-1.md`, `PHASE-2.md` and the 19 Nov roadmap use Phase 3 for stats snapshots, and this plan follows that. The polish-and-speed items (image weight, accessibility pass) stay on the list as "Later".

## Goal
Open an upcoming UFC bout and see both fighters side by side at a glance: record, recent form, striking, takedowns, control, finishing, and three 0-100 scores (**Power, Defence, Wrestling**). Every number comes from verified data and says how many fights it rests on. Missing is shown as a dash, never as zero.

## Owner decisions (21 Nov)
- First snapshot shows **stat tiles plus the three 0-100 scores**.
- **UFC / MMA first.** Boxing follows once a punch-stats source is chosen.

## What exists today (checked 21 Nov 2026)
- `data/ufc-fighter-v3.json` (schema 4, UFC only, 714 fighters, as of 21 Nov): per-fighter `metrics` (strikes landed and absorbed per minute, knockdowns, takedowns, control, submissions, accuracy, takedown defence, KO and submission share), each with its bout count and rank. Present for **705 of 714** fighters.
- The same file has `power` and five `technical` scores (striking, wrestling, grappling, defence, form), but **every one is empty (0 of 714)**. That is deliberate: `AGENTS.md` and `ufc-v4-staged-release-control.md` hold ratings, rankings and leaderboards until the owner approves that specific release (R4).
- Of the 60 fighters on announced UFC cards, **52** are in the file today.
- `assets/fighter-power-index.js` is a "v3 preview only" engine for 0-100 indices. It is not calibrated or approved.
- Upcoming bouts already have a "Fight snapshot" and a tale of the tape; the new panel replaces their content, not their place.

## Guardrails this plan keeps
- Only the owner-approved 783-fighter cohort and the existing certification lanes. No new collector, no new paid calls, no research PR touches production.
- No ratings or scores go public until the owner explicitly approves that release (V4 R4). Step 3 therefore ships scores **switched off**.
- No guessing: unverified identity, missing metrics and thin samples show a dash or a "limited data" label.

## Steps
1. **Snapshot data file.** A script builds `data/ufc-card-snapshots.json` from `ufc-fighter-v3.json` for fighters on announced UFC cards only: tiles, bout counts, and a coverage flag. Offline, read-only, tested. Fighters not in the file show "Snapshot not available yet", not a blank. No visible site change.
2. **Snapshot panel (tiles).** On an upcoming UFC bout: mirrored bars and big numbers for both fighters, "based on last N fights" under each, phone first (390 px), same look as the cards. Replaces the current snapshot content. Scores are not shown yet.
3. **Power, Defence, Wrestling scores, hidden.** Offline calibration with a held-out test, minimum sample size, fairness check by division, written method (so the owner can read how a score is made). Output sits in the data file and renders only behind a feature flag that is **OFF** by default. Reviewing it is a separate approval from merging the code.
4. **Release.** Owner reviews screenshots with the flag on a preview, then approves switching scores on. Verify the deployed SHA and live QA, and update release tracker #171.

## Open questions for the owner
1. **Certification gate for tiles.** Should tiles appear for every fighter with verified metrics (705 of 714), or only for independently certified careers? The stricter option shows fewer fighters at first. Recommendation: use the same gate the fighter profile uses today, and confirm it against #171 before step 2.
2. **Window.** Tiles use the last five fights today. Show Last 5 / Last 10 / Career toggles (the approved V3 design) or last five only for the first version? Recommendation: last five only first.
3. **Score names.** Keep Power, Defence, Wrestling exactly, or use the file's striking / wrestling / grappling / defence / form set? Recommendation: your three, with the method note saying what each measures.

## Costs and limits
Nothing new to pay for: no new API, no new worker, GitHub Actions minutes only.

## Not in Phase 3
Per-bout analysis and predictions (Phase 4), betting odds, boxing and grappling snapshots, any change to Sumo. Later: image weight and the accessibility pass from the 17 Nov review.

## How it is checked
Each step is checked in a real browser at 390 px and 1280 px, with tests for the data build and the display rules. Its PR says what was and was not verified.
