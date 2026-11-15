# BEFN Sumo — 190-profile API-trusted preview handover

**Date:** 15 November 2026  
**Branch:** `feat/sumo-section-test-20261114` (draft PR #196; no merge to main)  
**Companion source branch:** `research/sumo-190-career-cache-20261114` (draft PR #200)

## Change authorised

The source-complete Sumo API is accepted as the **development baseline** for all 190 profiles. Independent JSA/SumoDB corroboration is no longer a prerequisite for a complete **non-production** profile. This is not a downgrade or revocation of previously collected evidence: the 182 strict independently corroborated career-result histories remain intact in the separate research register, and the eight remaining strict source exceptions remain recorded.

The new `data/sumo/api-trusted-status.json` drives visible status on every wrestler's test profile. A `sumo-verification.mjs` module checks identity, cohort size and mutually consistent counts. The UI labels `API-TRUSTED` and distinguishes `Career results: independently corroborated` from `Career results: independent corroboration incomplete`. Neither label means that the full profile, every kimarite, all historical weight snapshots or public distribution is certified.

## Verified test source coverage

- All 190 banzuke roster members and API career data fields populated.
- Career history, dated weight and rank history, full H2H match history, opponent index and H2H summary already match the research branch **by Git blob SHA**. They were not needlessly re-collected or duplicated.
- 182/190 strict career-result crosschecks saved on the research branch at the methodology switch; eight unresolved strict cases still visible without blocking development.
- Two older JSA spot-check cutoff discrepancies (Fujiseiun and Nishikigi) visibly flagged as targeted reviews, not represented as current source faults.
- 8 licensed local portrait files are approved in the isolated preview manifest; remaining profile cards use permitted placeholders. Photographs are not implied to be included with the API.

## Non-production CI evidence

- **Full 190-profile data audit:** [GitHub Actions #43702907005](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/actions/runs/43702907005) — passed. Exercises API-trusted source status, 190 source IDs, date-labelled graphs, all-opponent H2H, photo restrictions, unchanged certification rules and failure on integrity regressions.
- **Subsequent section integrity and UI syntax:** [GitHub Actions #43703048337](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/actions/runs/43703048337) — passed.
- **Complete desktop and mobile browser test:** [GitHub Actions #43703082442](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/actions/runs/43703082442) — passed. Opens **all 190 profiles** on each viewport, checks name, source status and both career graphs, checks mobile overflow, plus original home, directory, tournament, matchup and techniques journeys.

## Remaining tasks / explicit boundaries

1. Confirm the Render **test** service is actually serving this GitHub preview commit. Repository CI success alone does not prove the test deployment has refreshed; do not deploy to main or production.
2. Keep newly collected basho/day results current with independently dated snapshots; a cached current-basho page is not a live result feed.
3. Resolve public display/caching and rate-limit guidance with Sumo API operator. The API guide states it is free but requests responsible use and lists webmaster@sumo-api.com.
4. Pursue additional clearly licensed photo sources; continue placeholders without rights.
5. Resolve the two old JSA date-cutoff discrepancies only where material to the displayed latest numbers, preserve all source records.
6. Explicitly approve release only after the preview is reviewed, source-permission conditions are understood and no other BEFN production workflows are altered.

**Not performed:** No main merge, no production deployment, no paid API calls, no modification of the 190-member cohort, and no claim of 190 full-profile certifications.
