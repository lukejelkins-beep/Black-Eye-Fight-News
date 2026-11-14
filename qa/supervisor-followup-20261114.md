# QA follow-up — 14 November 2026

User direction: leave the ONE backfill task alone. QA-002 is deferred; no further ONE investigation, code or data changes.

## Delivered on the isolated QA branch

- Replaced the two stale UI harnesses with deterministic synthetic fixtures, independent of live collector datasets and wall-clock date.
- Results checks preserve coverage of completed/pending bouts and unknown records; add live/idle request cadence, hidden/inactive tab suppression, cached results during outages, malformed payload rejection and protection from older published data.
- Upcoming checks cover sport filters, provisional labels, main/prelim/early sections, unknown time/records and date exclusion. A new regression demonstrated explicit completed cards were still rendered as scheduled.
- Added a two-line frontend guard excluding explicitly completed/cancelled events. Recent unconfirmed cards remain visible; date alone never establishes completion. No stored data or collector changed.
- Added both restored suites to the existing release-preflight job so they no longer sit outside CI.

## Validation

Results UI, upcoming cards, existing upcoming UI, merge/cancellation protection, local-time tests (Melbourne/Los Angeles/London), poster fallback checks and JavaScript syntax all passed locally. The full release preflight is also rerun before the PR update.

The earlier baseline is a historical snapshot. QA-010 is now fixed locally; QA-011 records the new schedule defect. Findings remain pending review/integration, not production-resolved. No merge, deploy, research data change or automation interruption.

## Measured efficiency and accessibility follow-up

Nine scheduled main runs were sampled, three per workflow. Exact run links and step durations are saved in `ci-measurements-20261114.json`. Durations are elapsed job/step seconds, not billed minutes; second-resolution zero does not mean no work.

| Workflow | Sample job durations | Main observed work | Decision |
| --- | --- | --- | --- |
| News refresh | 83, 33, 72 seconds | Collection/publishing 67, 21, 61 seconds; Python tests 1, 0, 1 seconds | Retain tests; downgrade QA-004 to P3 |
| Results refresh | 14, 16, 9 seconds | Source checking 5, 8, 3 seconds | No consolidation justified by this sample |
| Live profile QA | 151, 142, 113 seconds | Browser install 34, 30, 21 seconds; actual verification 96, 98, 81 seconds | Preserve desktop/mobile verification; caching benefit remains unproven |

These jobs have different responsibilities and privileges. Moving them together risks coupling collector writes with read-only browser QA. No collection was duplicated for measurement; only existing GitHub run metadata was read. No API-consumption or financial saving is claimed. A browser dependency cache would require a separately measured restore-vs-install comparison before adoption; none is introduced here.

Results section selection was reproduced losing keyboard focus in a synthetic DOM contract regression. The small frontend fix restores the same event/section button after replacement, without scrolling or taking focus from an outside control. Existing results tests cover this automatically; no extra scheduled workflow or dependency was added. The test failed before the fix and passed after.

Live homepage inspection succeeded, but Fights navigation and one subsequent state read timed out in the cloud browser. This is a browser inspection limitation, not evidence of a production outage. No fresh mobile layout or screen-reader pass is claimed. QA-012 requires real keyboard verification on an approved preview before rollout; broader mobile and accessibility review remains open.

## Upcoming section accessibility

The prior focus-fix commit passed GitHub release readiness (run 43570350522). Continued inspection found the upcoming All control referenced only the first panel despite displaying every section. QA-013 corrects the space-separated `aria-controls` relationship and checks that every referenced panel exists. Individual section controls retain their single target. The regression failed before the change and passed afterward, alongside existing upcoming UI and cancellation/merge checks. No visual layout, data, collection or scheduling change. Browser/screen-reader validation remains outstanding; this does not imply a complete accessibility pass.
