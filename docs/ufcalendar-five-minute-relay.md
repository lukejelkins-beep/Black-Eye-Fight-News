# UFC/PFL paid-data collection – reliable five-minute relay

## Why the change?

The Nov 2026 GitHub Actions cron expression ran only about once per 45–80 minutes
even though every five-minute slot was configured. This is a documented best-effort
GitHub Actions limitation; scheduled triggers can be delayed or dropped.

## New system

- A **bounded**, explicitly dispatched collection chain uses
  `workflow_dispatch` with GitHub's built-in `GITHUB_TOKEN`. No personal
  access token or paid Render scheduler is needed.
- Following a successful collection run, the workflow targets the next
  dispatch at least five minutes after that run started. Actual starts can
  still be delayed by GitHub queueing or longer collection operations.
- Each chain has a **hard 72-run/approximately six-hour limit**.
  A separate lightweight GitHub watchdog checks whether collection has been
  stale for 20+ minutes; it restarts a chain only if no backfill job is
  active or queued. It has no UFCALENDAR_API_KEY and makes zero paid calls.
- `concurrency` keeps a single active backfill job, with overlapping requests
  queued rather than running in parallel.
- In months outside November, the existing 4 daily scheduled maintenance
  windows remain, and no relay is allowed. Manual runs default to one-time.
- Changing the code or this workflow triggers a `push` run that seeds a
  bounded relay automatically in Nov 2026.

## Budget and safeguards

Existing `scripts/ufcalendar-rich-backfill.py` and its quota guards are
unchanged: Hobby 30,000/month, at most 27,000 for research (3,000 reserved for
the live website), 500 maximum calls per collection run, provider-rpm-aware
throttling, resumable file progress and no raw API secrets in output. Both the
relay and watchdog verify the stored research ceiling before dispatching.

If GitHub dispatch is unavailable, the job prints a warning rather than
failing the collected data. The watchdog can recover when its best-effort
GitHub schedule next fires.

## Verify

Inspect `.github/workflows/ufcalendar-rich-backfill.yml` run list and
`data/ufcalendar-rich-progress.json`:
- Confirm multiple successful `workflow_dispatch` runs in Nov 2026 with
  timestamps near five-minute gaps.
- Confirm `lastRun`, `indexedBouts`, `fighterProfilesDone` and budget usage
  advance. A successful workflow only proves it executed; it does not prove
  new data was returned on every call.
- Confirm watchdog runs report either "recent collected data" or restart only
  when no collector is active.
