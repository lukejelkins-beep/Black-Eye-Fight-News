# BEFN UFC research archive

The archive is active, incrementally updated and version-controlled.

## Files
- data/ufc-research-archive.json — selected per-fight, per-round strike and grappling evidence, source snapshots and source-level disagreements.
- data/ufc-research-ledger.json — safe operational metadata, provider usage headers and run status; no API keys.
- data/ufcalendar-intelligence.json — separate existing 100-call/month UFCalendar scouting source.
- scripts/refresh-ufc-research-archive.py — Cito + existing UFCalendar source merge.
- scripts/crosscheck-ufc-stats-api.py — optional independent check of disputed / incomplete bouts.
- .github/workflows/archive-ufc-research.yml — scheduled collector with offline tests.
- assets/ufcalendar-evidence.js — existing Fighter Scout round evidence design, now reads the combined archive with UFCalendar fallback.

## Provider rules

**Cito** uses only the GitHub Actions secret UFC_STATS_API_CITO. BEFN reserves a *self-imposed* 120 requests per rolling 30 days and a maximum of nine per run, independent of Cito's free 500 requests per 30 days and any calls made elsewhere. It also watches provider remaining-count headers, and refuses to continue after 401/403/429. The collector requests recent events, then fetches selected completed-card statistics by exact returned slug. It does not request older data outside the free 30-day in-depth access window.

**UFCalendar** retains its separate weekly 100-request quota policy and existing cache. The UFC research archive imports its already-curated per-round intelligence without additional UFCalendar API calls. This avoids paying for the same statistics twice.

**UFC Stats API (malichetty/ufc-stats-api)** is an optional independently accessed personal/noncommercial source. It is probed at most once per UTC week, up to seven requests in a run, and only for existing fights with conflicts or missing round evidence. It must match both fighter names AND the event date before contributing any metrics. If unavailable, archive collection from the other providers continues. Availability and the number of verified crosschecks are recorded honestly in the ledger. This source currently may be unavailable and should never be assumed connected.

**BEFN results and editorial records** remain authoritative for page presentation and verified outcomes. This archive deliberately does not automatically overwrite results, W-L-D records, rankings, judging decisions, previous champion labels or prospect/contender classifications.

## Merge and retention

Each bout has a stable key containing the fight date plus two normalized full fighter names (order-independent). For each source, BEFN keeps its selected per-round metrics as separate observations. Observations are aligned to the canonical two fighters even if red/blue corners are reversed. Resolution prefers verified UFC Stats API observations, then Cito, then UFCalendar, choosing each populated metric independently and retaining disagreements as explicit conflicts. It never treats a missing metric as zero and never infers official round winners from strike totals.

Existing past fights are not purged just because the source's historical access window has elapsed. GitHub commits provide further recovery history, though repository retention, third-party source access and network availability must still be managed. Source data should be used only as permitted by each provider and relevant underlying rightsholders; this collection stores selected metrics for BEFN analysis, not downloadable copies of entire API responses or provider photos.

## Schedule

GitHub Actions: Sunday, Monday, and Wednesday at 08:10 UTC (19:10 AEDT / 18:10 AEST). Can be launched manually under "Archive UFC round-by-round research". All source credentials remain GitHub Secrets and never appear in the static site.

The workflow runs offline merge/identity/quota/retention tests, retrieves recent fights when permitted, crosschecks independently if available, and commits both archive and usage metadata. It retries GitHub pushes if other BEFN workflows commit concurrently.

## Use by the fighter algorithm

Only use fights where both fighter identity and date are verified. The recent-18-month activity filter applies to scouting eligibility, not which older fights may be used as performance evidence. Combine per-round pace, accuracy, defense, control, significant strikes absorbed, takedown efficacy, stoppage result and opponent strength as *separate evidence dimensions*. Source conflicts must be reviewed rather than smoothed away.

A permanent archive of previously captured stats is not the same as a complete historical dataset. Events not captured before a provider's 30-day access window closes may require other sources or a higher-tier historical feed.
