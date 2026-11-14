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
