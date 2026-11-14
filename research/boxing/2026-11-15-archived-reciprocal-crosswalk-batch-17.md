# Boxing archived queue crosswalk — batch 17 (15 November 2026)

Research-only, non-publishing reconciliation. Source queue: `research/boxing/generated/archived-bout-verification-queue.csv`. This crosswalk does not change provisional source rows, assign opponent IDs, or certify careers.

## Exact archived row matches

| Boxer ID | Date ISO | Archived opponent | Archived outcome/method | Independent corroboration | State |
|---|---|---|---|---|---|
| boxing-willy-hutchinson | 2024-09-21 | Joshua Buatsi | L / SD 12 | [Sky Sports postfight](https://www.skysports.com/boxing/news/13219408/spiteful-buatsi-drops-and-defeats-hutchinson), [Bleacher Report](https://bleacherreport.com/articles/10136225-winners-and-losers-of-anthony-joshua-daniel-dubois-card) | ARCHIVE_MATCHED; OPPONENT_ID_PENDING |
| boxing-joshua-buatsi | 2024-09-21 | Willy Hutchinson | W / SD 12 | Same event and evidence as preceding row | RECIPROCAL_ARCHIVE_MATCH; SAME_BOUT_NOT_NEW |
| boxing-willy-hutchinson | 2024-06-01 | Craig Richards | W / UD 12 | [BoxingScene](https://www.boxingscene.com/articles/compubox-punch-stats-willy-hutchinson-craig-richards), [The Ring](https://www.ringmagazine.com/news/willy-hutchinson-outpoints-craig-richards-queensberry-takes-early-lead-in-5-vs-5-2ss6azR3oOHiYb7wSQ1YVa), [BoxRec fight 3151966](https://boxrec.com/wiki/index.php?title=Fight%3A3151966) | ARCHIVE_MATCHED; OPPONENT_ID_PENDING |

## Quality finding

**Three archived boxer-perspective rows represent only two distinct professional bouts.** The recovered queue contains both perspectives of Hutchinson–Buatsi on 2024-09-21. Counting each archived row as a separate verified bout would inflate totals. Crosswalk keys must include boxer ID, ISO date, opponent identity, and outcome; deduplication across perspectives must also use a canonical unordered participant pair plus event date, with a collision/ambiguity exception for same-day repeat fights. Do not merge name-only identities.

The separate Hutchinson–Buatsi rematch on 2026-11-07 is NOT the archived 2024 bout. Its existing curated CompuBox report ID 16970 must not be fetched or counted again. No CompuBox figures imported.

## Measured progress

- Archived queue: 345 provisional rows; **3 exact archived perspective rows now crosswalked to 2 distinct independently corroborated bouts**, including one reciprocal row newly identified in this batch.
- New independent fight results this batch: **0**; new deduplication finding: **1 reciprocal perspective**.
- Foundation: **509 profiles; 0 complete careers certified; 509 pending**.
- Previous 20 corroborated outcomes remain pending global crosswalk and should not be added to these totals without a canonical bout-level ledger.

Next: apply reciprocal-row detection to all 345 rows; independently resolve opponent IDs; validate records and full histories before career certification. No paid APIs, production/Render/main changes, or UFC V4 modifications.
