# Paul Craig — Wave96 native career identity audit (research-only)

Date: 2026-11-17. Existing draft PR #207; **not** a Stage 3 certificate.

## New validation

Read the committed native cache blob `21b3b4c4b7528f19c35e3354806ad224bd002a6b` from `data/ufcalendar-rich-progress.json` and enumerated all UFC bouts with original numeric fighter ID `256`, including non-winner outcomes. **21 distinct numeric UFC bout IDs**, **19 winner-decided bouts**, **one draw** (`62065` vs Mauricio Rua), and **one no-contest** (`60289` vs Rodolfo Bellato). Both non-winner rows must remain included. All 21 have positive `roundDone` retrieval markers, which are **not** proof of positive archived measured round metrics.

The cache's `ufcFullCareerHistoryChecks['paul-craig']` independently records `ufcHistoryRowsAfter:20`, `explicitFullProviderTimeline:false`, `newUfcBoutsRecovered:0` (checked 2026-11-14). `ufcApprovedFullFightSearchChecks['paul-craig']` records only `scannedRows:19` and `status:'checked'`. These are three **different counters** (21 event-index native identities; 20 history rows; 19 search scan rows). None supplies per-row membership of the other set, so **the exact missing history row cannot be identified from these aggregate counters alone**. Do not arbitrarily name a missing bout or drop draw/NC.

## Native identity inventory

| Event date | Native bout ID | Opponent | Method | Native winner ID | Round retrieval marker |
|---|---|---|---|---|---|
| 2016-12-17 | 62488 | Henrique da Silva | submission | 256 | 2 |
| 2017-03-05 | 58703 | Tyson Pedro | ko_tko | 978 | 1 |
| 2017-07-16 | 62571 | Khalil Rountree Jr. | ko_tko | 197 | 1 |
| 2018-03-17 | 62469 | Magomed Ankalaev | submission | 256 | 3 |
| 2018-12-02 | 62324 | Jimmy Crute | submission | 214 | 3 |
| 2019-03-30 | 59095 | Kennedy Nzechukwu | submission | 256 | 3 |
| 2019-06-29 | 62126 | Alonzo Menifield | ko_tko | 54 | 1 |
| 2019-09-21 | 65608 | Vinicius Moreira | submission | 256 | 1 |
| 2019-11-16 | 62065 | Mauricio Rua | draw | none | 3 |
| 2020-07-26 | 65640 | Gadzhimurad Antigulov | submission | 256 | 1 |
| 2020-11-21 | 61833 | Mauricio Rua | ko_tko | 256 | 2 |
| 2021-06-12 | 61732 | Jamahal Hill | ko_tko | 256 | 1 |
| 2022-03-19 | 61428 | Nikita Krylov | submission | 256 | 1 |
| 2022-07-23 | 59562 | Volkan Oezdemir | decision_unanimous | 381 | 3 |
| 2023-01-21 | 59719 | Johnny Walker | ko_tko | 7170 | 1 |
| 2023-07-22 | 60103 | Andre Muniz | ko_tko | 256 | 2 |
| 2023-11-18 | 59973 | Brendan Allen | submission | 79 | 3 |
| 2024-05-04 | 60920 | Caio Borralho | ko_tko | 253 | 2 |
| 2024-11-16 | 60383 | Bo Nickal | decision_unanimous | 109 | 3 |
| 2025-06-15 | 60289 | Rodolfo Bellato | no_contest | none | 1 |
| 2025-09-06 | 60473 | Modestas Bukauskas | ko_tko | 33 | 1 |

## Remaining strict gates

1. Retrieve the underlying 20 history entries with their **individual original native bout IDs**, then set-diff against the 21 above to identify the actual missing row.
2. Independently corroborate every original bout with UFCStats/Greco/UFC.com fight-level evidence, date, both corners and final result; resolve contradictions without guessing.
3. Read archived round-stat **values** and prove positive measured metrics per required bout (not `roundDone` flags).
4. Only after all gates pass, update canonical evidence in place and run exact-commit full-cohort strict Stage 3 audit; until then keep Paul Craig uncertified and retain the latest audited 651/783 checkpoint.

No production or roster changes are authorised by this research note.

## Independent official chronology reconciliation (2026-11-17)

The official UFC Paul Craig athlete profile lists **all 21** opponent/result/date entries, including the 2019 Mauricio Rua draw and 2025 Rodolfo Bellato no-contest. This independently corroborates the complete 21-bout **opponent chronology** against the 21 native event-index identities above. Source: https://www.ufc.com/athlete/paul-craig . Additional independent 21-row chronology corroboration: https://fighterapi.com/fighters/paul-craig-3946951 and https://www.fightindex.io/fighters/paul-craig .

**Newly resolved:** the 21st native bout is **not an extra invalid UFC bout**: the official UFC source confirms 21 real UFC contests (9 wins, 10 losses, 1 draw, 1 NC). Therefore the 20-row provider history is incomplete as a *count*, and should not be used to drop a native record. **Not resolved:** which specific individual ID is missing from those 20 history rows, because the cached summary stores only the count, not the row IDs. Do not assume the draw or NC is missing merely because they are non-winner results.

**Further certification gates remain:** official original per-fight URL/ID crosswalk, measured archived native round statistics (rather than retrieval markers), and successful strict full-cohort audit. Official fighter biography confirms opponents and results, not native round-stat evidence. No new certification is claimed.

## Independent round-stat coverage corroboration (2026-11-17)

Public source https://www.ufcalendar.com/fighters/paul-craig/stats reports **21 tracked UFC bouts** and career aggregates (421 significant strikes landed, 928 attempted; 2.50 landed per minute). Independently https://edgeup.gg/mma/fighters/mma-eabf206b162b3b83 reports **21 fights**, 421/928 significant strikes, 511/903 absorbed, 16/85 takedowns, 15 submission attempts, 168:14 fight time, and explicitly counts the no-contest in statistical minutes. Official UFC https://www.ufc.com/athlete/paul-craig corroborates the 21 opponent/result chronology.

These independent sources **support** measured career-wide statistics, including NC coverage, but do **not** establish the strict gate requiring *original saved positive per-round measured rows for every numeric native bout ID*, or the exact one-to-one original UFCStats fight URL crosswalk. Thus remain fail-closed; do not promote to certified or write unsupported canonical proofs. The 20 history-row mismatch still lacks per-row IDs.

## 2026-11-17 full opponent-by-opponent independent round-stat coverage check

Crosschecked the 21 native opponent/date identities above against the independently published **21-row fight log with individual positive measured fight statistics** at https://cagesidedata.com/fighters/2134-paul-craig and the 21-fight detailed log at https://www.fightingstats.com/fighters/paul-craig . All 21 opponent names occur, including the Rua draw and Bellato NC. Cageside's log provides per-bout significant strikes, takedowns, control, round and method; Fighting Stats provides a separate per-fight round section. The official UFC source https://www.ufc.com/athlete/paul-craig independently verifies result chronology. This clears the **external fight-level measured-stat existence** concern, but **does not** clear the stricter repository gate requiring the *original saved archived round-row values* joined to each native bout ID, nor the required pinned original UFCStats/Greco fight-detail URLs and both corners.

**Data-quality exception identified:** Cageside displays `17/0` significant strikes for the 2017 Khalil Rountree Jr. fight, an impossible landed/attempted relationship. Do not ingest that cell as valid or use it as proof of clean original per-round measurements. Original archived round records must resolve the discrepancy.

**Status:** still uncertified. 21 UFC contests independently matched by opponent, date, outcome, and external bout-level measured-stat coverage; strict archived original-round/source-ID crosswalk and full-cohort audit outstanding. Never claim an audit ran without a successful exact-commit workflow.

## Owner-approved round-stat evidence policy — 2026-11-17

**Superseding owner decision:** Accept **UFCalendar as authoritative for UFC per-round statistical values**. Do not require independent UFCStats/Greco/third-party numerical corroboration of round-stat figures. This supersedes earlier research-note language demanding independently verified round measurements, including the external 2017 Rountree discrepancy as a blocker. Such external disagreement is no longer a certification blocker for round values.

**Still required:** verify that the actual UFCalendar round-stat records exist, are correctly linked to each original numeric UFC bout ID and fighter corner, and contain the relevant values; `roundDone` alone is a retrieval-status marker, not the round record itself. Preserve complete original UFC fight identity, chronology, opponent, result, NC/draw, excluded feeder/cancelled entries, and exact-commit strict audit. Do not fabricate missing rows or relax those non-statistic gates.

**Implementation follow-up:** The strict Stage 3 validator and tests should be updated to use this policy on the existing research branch before certification is claimed. This note alone does not modify validator logic or certify Paul Craig.

## Owner-approved original bout-ID relaxation — 2026-11-17

**Superseding owner decision:** Original numeric bout identity crosswalks are **not required** for BEFN UFC Stage 3 certification. Do not block a career solely because original provider bout IDs, UFCStats/Greco IDs, or original numeric corner IDs cannot be reconciled. Fight records may be matched using fighter identity, opponent, official event/date (allow documented timezone offsets), and final result, with safeguards against duplicate opponents/rematches and mistaken events.

Together with the preceding owner decision, **UFCalendar per-round figures are accepted as authoritative**, without independent numerical verification. The practical remaining checks are complete official UFC career chronology, correct fighter/opponent/outcome/date matching, appropriate exclusion of cancelled/non-UFC qualifiers, and presence of usable UFCalendar statistical data for the represented fights. Missing original IDs or disagreement with external numerical statistics alone must not prevent certification.

For Paul Craig, the independently corroborated 21-bout official chronology is the source-of-truth count. A 20-row provider-history summary is not automatically disqualifying, but the actual profile dataset must represent the 21 UFC bouts (or explicitly account for any unavailable data without inventing a result). A count mismatch must not be silently relabelled complete.

**Important:** This note records the revised standard; existing executable validator/tests and the strict audit still need updating before claiming any new certified fighter. No certification count increase on this note.
