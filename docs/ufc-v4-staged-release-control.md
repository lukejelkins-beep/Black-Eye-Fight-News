# UFC V4 staged release control — 14 November 2026

**Canonical release tracker: [#171](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/issues/171).**

This branch establishes **R1 nonproduction release safety**, not the public V4 experience. Release features will be separated into future PRs. No user-facing V4 UI, ratings, scores, leaderboards or achievements are enabled by this change.

## Sources of truth and work ownership
- **783 approved fighters:** `data/ufc-36-month-roster-approval.json` on current `main`; frozen as of 2026-11-14. No legacy 18-month or 24-month cohort replaces it.
- **Independently certified fighters:** `data/ufc-independent-full-career-verification.json` plus **latest completed strict Stage 3 audit** (`scripts/ufc-36-month-stage3-progress.mjs`); a registry entry or source attestation may still await final CI.
- **Certification queue:** `scripts/ufc-v4-certification-queue.mjs`; latest completed `qa/ufc-v4-certification-queue.json` GitHub Actions artifact, with exactly one lane per approved fighter (certified, fastLane, exceptions).
- **UFCalendar cached native fights:** Only existing `.github/workflows/ufcalendar-rich-backfill.yml` writes collector-owned files or makes paid UFCalendar API calls. Release CI and all independent research are **offline/read-only**.
- **Independent research:** existing :15 mainline automation owns fastLane, existing :45 exception automation owns exceptions. Do not queue the same athlete in both. Boxing work is independent.
- **V4 shadow:** draft #109 is offline research, NOT an alternative certification authority. Its count overlaps main and must never be added to main's count.

## R1 code/data boundaries
For this initial gate PR, only this release-control document, the dedicated read-only workflow, and its small boundary-check script/tests are permitted. No site assets, HTML, cached data, collector config or public JSON should be touched. The workflow tests the immutable cohort/registry inclusion and the changed-file allowlist. **It does not certify fighters or authorize a production release.**

For later R1 functional PRs: create a *new short-lived branch from latest main* and explicitly review any necessary code from #109/#133/#136/#137 against functionality already merged to main; use independently passed strict Stage 3 audit for certificates. Preserve publication hold until owner approval and deployed Render SHA verification. Do not merge an old PR wholesale.

## Release sequence
1. **R1 certification infrastructure:** isolate accepted source-proof validation and queue reporting; verify 783 partition, source-to-native measured bout joins, feeder/event scope, CI, exclusive collector, and no live-facing effects.
2. **R2 verified career view:** feature flag default OFF, activate only for independent strict full-career certificates. Test short/long UFC careers, timezone shifts, identity changes, NC and official TUF/RTU finals, desktop/mobile QA.
3. **R3 Last 5 / 10 / Career metrics:** reuse approved nine-tile design and correct true chronological windows. Per-period eligibility and metric coverage must be source-safe. No guessed/zero-filled missing data.
4. **R4 ratings, classifications, leaderboards:** separate, held-out model calibration, fairness by division/era, sample-size thresholds, responsive QA, explicit release authorization. External achievements are independently verified and bonus points remain OFF.

## Prior branches and duplicate control
- #109 remains research foundation and score sandbox; extract only tested, required modules onto current main.
- #133 historical source/triage and #153 existing main lane partition overlap; **never add a second collector or queue**.
- #136/#137 pilot investigations may now be superseded by already merged original pilot evidence; review differences before moving code.
- #141 historical Maryna PR may overlap newer main certificates; verify then close/supersede rather than remerge same evidence.
- #48 period design/engine and #95 DWCS classification are reviewed for unique still-missing changes only.
- #106 achievements design, #47/#77 legacy roster and 18-month concerns cannot override approved 783-cohort / V4 controls.
- Concurrent certified-fighter PRs must rebase latest main and edit only their fighters without stale whole-file registry overwrite.

## Release approval checklist (for **each** release)
- [ ] New branch and smallest PR on current main, documented changed-file ownership, no stale file overwrites.
- [ ] Latest completed Stage 3 audit and lane partition checked, no overlapping selected fighter research.
- [ ] All applicable CI green and actual source contradictions reconciled; no unverified counts promoted.
- [ ] No new UFCalendar paid worker/cache writes; existing scheduled collector continues.
- [ ] Read-only preview QA and desktop/mobile screenshots inspected for live-facing changes.
- [ ] Explicit owner approval for this **specific** release/feature flag, not inferred from approval to coordinate.
- [ ] Check exact GitHub main SHA versus deployed Render SHA; run live site regression and record rollback SHA.
- [ ] Update issue #171 with status `in PR / CI pass / human QA / approved / deployed and SHA confirmed`.

**Current disposition:** R1 guardrail only. R2–R4 remain unapproved for live activation. GitHub CI/merge does not by itself prove Render deployment. 
