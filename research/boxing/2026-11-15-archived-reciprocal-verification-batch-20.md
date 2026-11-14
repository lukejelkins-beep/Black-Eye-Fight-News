# Boxing archived reciprocal verification — batch 20 (15 November 2026)

Research-only corroboration of the final previously unverified exact reciprocal candidate identified in batch 18. The two boxer-perspective archive rows represent **one** fight, not two. Preserve the source CSV unchanged until stable identity mapping and atomic ledger integration.

## David Morrell Jr. vs Imam Khataev — 12 July 2025

- **Event / division:** Louis Armstrong Stadium, Queens, New York; light heavyweight, scheduled ten rounds.
- **Independent result:** David Morrell Jr. defeated Imam Khataev by **split decision after ten rounds**. Judge Allen Nace scored 95–94 Morrell; John McKaie 96–93 Morrell; Tony Lundy 95–94 Khataev.
- **Additional event detail:** Khataev scored a fifth-round knockdown. This does not change the official outcome.
- **Contemporary evidence:** [The Ring postfight report, 12 July 2025](https://www.ringmagazine.com/news/david-morrell-jr-overcomes-5th-round-knockdown-edges-imam-khataev-by-split-decision-7nMsh3crvP1MjffVTXHhIJ); [BoxingScene bout result](https://www.boxingscene.com/fights/david-morrell-vs-imam-khataev); [BoxingScene follow-up, 14 July 2025](https://www.boxingscene.com/articles/imam-khataevs-promoter-derides-christmas-gift-loss-to-david-morrell); [Bad Left Hook postfight, 12 July 2025](https://www.badlefthook.com/2025/7/12/24466633/matias-takes-wbc-title-puello-morrell-edges-past-khataev-boxing-news-2025).
- **Classification:** `INDEPENDENT_RESULT_CORROBORATED`; `RECIPROCAL_ARCHIVE_PAIR`; `OPPONENT_STABLE_ID_PENDING`; `CAREER_INCOMPLETE`.
- **Scope:** confirms bout participants/date/result/method and scorecards, **not** a complete five-/ten-fight or career history, a current professional record, or an independently certified stable fighter identifier.
- **CompuBox:** some published articles quote punch totals, but no report-cache identity and round-level provenance was reconciled in this batch. Do **not** import or default missing fields to zero.

## Cumulative reconciliation

- The original 345 archived perspective rows contain **four exact reciprocal pairs / eight rows** found in batch 18. With this result, **4/4 reciprocal candidate fights** now have independent result corroboration (Buatsi–Hutchinson, Wardley–Parker, Nasukawa–Moloney, Morrell–Khataev). This is **four distinct bouts**, not eight.
- This does **not** establish that the remaining 337 rows are unique or verified. The previously reported 20 corroborated results have not been globally deduplicated; do not blindly increment that total.
- **509 foundation profiles; 0 fully certified careers; 509 pending**. The original 345-row CSV, 78 scouting profiles and existing CompuBox cache remain untouched.
- No paid APIs, new CompuBox requests, main/production/Render changes, or UFC V4 work.

## Next blockers

1. Assign independently grounded stable fighter/opponent IDs to reciprocal pairs before canonical bout merging.
2. Crosswalk evidence against the 345 archive rows and existing corroborated-bout reports without duplicate counting.
3. Independently enumerate full professional careers and check last-five/last-ten slices against complete dated fight lists; flag uncertain opponents and records as exceptions.
