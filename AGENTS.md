# BEFN repository instructions for Codex

## Authority and scope
- Treat current GitHub `main`, completed GitHub Actions runs, and the actual Render deployment SHA as operational facts. PR descriptions and old reports are historical context; check their head commit and latest completed audit before using a count.
- Read `README.md`, relevant `docs/` guidance and the affected workflow before editing. Keep UFC, boxing, sumo and QA tasks in separate branches and PRs. Coordinate shared deployment and data contracts explicitly.
- Do not use TinyFish. Do not expose credentials, private identifiers or raw provider payloads in code, logs, PRs or public assets.

## UFC certification
- Preserve the owner-approved 783-fighter cohort and 2026-11-14 approval anchor in `data/ufc-36-month-roster-approval.json`. Do not expand or replace it through a collector, stale branch or research PR.
- `data/ufc-independent-full-career-verification.json` is the canonical independent evidence register. A record in it is not by itself a certificate. Use the latest **completed, successful, full-cohort strict Stage 3 audit** from `scripts/ufc-36-month-stage3-progress.mjs` and its queue artifact for certified, fastLane and exception counts. The three mutually exclusive lanes must total 783.
- Before researching a fighter, check the canonical register, current queue, existing PRs and active automation ownership. Reuse completed source work; never certify or research the same fighter twice merely because two branches have different counts. Do not add overlapping branch totals.
- Keep source-linked complete UFC careers, native fighter and bout IDs, both corners, outcome, dates, measured rounds and independently verified exclusions. Do not infer missing metrics as zero or promote an unresolved identity, event-scope or source conflict. Apply the established rules for DWCS, Road to UFC and TUF bouts.
- Owner standing rule (24 Nov 2026, `data/ufc-standing-certification-approval.json`): fighters outside the 783 are certified in their own cohorts, never by changing the 783. The 141-fighter extension cohort (`data/ufc-extension-cohort-approval-20261124.json`) is fixed. Every later newcomer joins the rolling cohort through `.github/workflows/ufc-weekly-certification.yml` only, and certified fighters are rolled forward there after new fights. A fight saved UFCalendar history lacks needs UFCStats AND the event's Wikipedia article to agree. Results reach `main` only through that job's draft PR and the owner's "Merge N".
- Preserve existing certification schedules and checkpoints. Do not cancel, replace, restart or duplicate them. Research branches do not publish V4 ratings, rankings or certificates to production.

## Sources, budgets and caches
- The existing `.github/workflows/ufcalendar-rich-backfill.yml` owns paid UFCalendar collection and mutable provider caches. Do not add another paid worker or write collector-owned files from an independent research or release job.
- Check the current provider-specific budget and rate-limit documents before any API work, including `docs/ufcalendar-budget.md` and `docs/ufc-research-archive.md`. Fail closed when usage, authorization or source availability is uncertain. Use saved evidence and offline tests for certification and PR validation.
- Keep boxing and sumo source rules, caches and research checkpoints separate from UFC. Preserve provenance and licensing restrictions; do not publish unverified claims or copied provider datasets.

## Change and release discipline
- Start a short-lived branch from current `main` for each bounded change. Inspect related open PRs before editing shared files. Make the smallest change that preserves existing data; do not merge a diverged research branch wholesale or silently overwrite newer main data.
- Add focused regression tests for certification logic, data transforms and release-sensitive behavior. Run the affected tests, the full-cohort Stage 3 audit for UFC certification changes, and applicable QA checks. Report the exact commit and pass/fail result; distinguish research-only results from production checks.
- `main` auto-deploys to the Render static site. Keep draft research and unapproved public features off `main`. Follow `docs/ufc-v4-staged-release-control.md` and release tracker #171 for UFC V4. Obtain explicit owner approval for the specific merge or production release, then verify the deployed SHA and live QA result.
- Record unresolved conflicts, provider limits and skipped checks in the PR. Do not treat a passing unit test, a running audit or a registry entry as proof of production behavior or source truth.

## Design and working agreement
- Read `docs/design/README.md` before any visual or front-end change. `docs/design/DIRECTION.md` is the look and feel, `WORKING-AGREEMENT.md` is the approval and QA process, `IMAGE-GUIDE.md` covers image sourcing and rights, and `DECISIONS.md` is the log. Add a line to `DECISIONS.md` whenever a decision is made.
