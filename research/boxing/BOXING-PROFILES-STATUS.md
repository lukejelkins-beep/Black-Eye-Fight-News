# BEFN Boxing fighter profiles — work-in-progress status

**Snapshot:** 14 November 2026 · **Branch:** `research/boxing-2026-11-cohort` · **Production:** unchanged

## Completed this session

| Deliverable | Result |
|---|---:|
| Provisional five-source ranking cohort | 499 unique fighters, bantamweight through heavyweight |
| Existing BEFN boxing scouting profiles reused | 78 |
| Existing scouts that match ranked cohort | 68 |
| Additional scouting profiles preserved (not in ranked cohort) | 10 |
| Total provisional research profile records generated | **509** |
| Archived recent bout entries preserved and queued for verification | **345** |
| Validated CompuBox single-bout reports in research cache | **16** |
| Ranked candidates with valid punch-performance data | **7** |
| Curated, individually verified bout outcomes | **5** |
| Fully certified professional careers | **0** |
| Draft profiles published to live website | **0** |

These numbers are supported by generated QA logs in `research/boxing/generated/profile-foundation-qa.md` and `archived-bout-verification-qa.json`.

## Research files

- [509 generated fighter profiles](./generated/boxing-profiles-foundation-v1.json) — each carries dated rankings and championship positions; status labels and optional scouting history; CompuBox punches only for available verified bouts; null for unknown professional records or career metrics
- [509-profile searchable preview](../../boxing-fighter-profiles-preview.html) — research-branch only, not linked on live site
- [345-entry fight verification queue](./generated/archived-bout-verification-queue.csv) — prioritises known titleholders, Ring-ranked boxers, sanctioning-body ranked boxers and extra scouts
- [Result-only curated bout evidence](./verified-bout-core-20261114.json) — outcomes drawn from exact CompuBox report headings; not treated as complete career history
- [CompuBox report cache](./compubox/bouts/) — per-round punch data, attempts to reconcile per-round and final totals
- [Build script](../../scripts/boxing/build-profile-foundation.js) and [research-only workflow](../../.github/workflows/boxing-profile-foundation.yml) — regeneration with strict checks; no production writes

## Data policy

1. Ranking snapshots may be stale or internally conflicting and do **not** imply final cohort approval.
2. Archived boxing fight-history and scouting content from the current website is **not independently certified**, even when source links exist. Preserve it, mark it, and systematically review it against primary records.
3. The CompuBox single-fight report collector has validated 16 distinct reports (32 athlete performances). The fighter-to-roster match currently covers 7 unique candidates. Some opponents are not in the top-ranked cohort and some names need manual alias resolution.
4. Detailed CompuBox punches *thrown, landed, jabs, power, body landed and individual rounds* may be shown for verified individual fights; **never infer five-/ten-/career averages until the corresponding complete ranked fighter bout ledger is certified**.
5. Photographs from external sources are not copied into new profiles until rights are cleared.
6. Profile design remains separate from UFC V4; no backend assumptions from UFC round structure are imposed on boxing.

## Next verified work

- Reconcile the priority-one 15 archived bouts with official professional results, including the existing roster's champion entries and changed titles.
- Review fighter name variations, including aliases and the 15 cross-division athletes; avoid merging Muhammad Yaqubov and Muhammadkhuja Yaqubov without evidence.
- Establish complete professional bout histories from available reliable sources, then refresh ranks and confirm current pro records.
- Continue public CompuBox report retrieval when accessible, reusing cached 16 reports and respecting agreed permissions; the historical archive still redirects for a number of known older URLs in the GitHub runner.
- Build five-/ten-/career statistical windows only from verified bout sets; report coverage percentages rather than treating missing punch data as zero.
- Verify a small preview batch for design and record accuracy before proposing any production rollout.

**Automation:** A separate recurring ChatGPT research task, *Advance BEFN boxing profiles*, has been created. It is distinct from the active UFC V4 hourly worker. The research work itself does not alter the live production website.
