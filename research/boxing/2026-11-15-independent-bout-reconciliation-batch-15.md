# Boxing reconciliation — 15 November 2026, batch 15: rematch-aware reconciliation

Research only; no complete professional career certified.

## Source-backed findings

**Willy Hutchinson vs Joshua Buatsi — TWO DISTINCT bouts, not a duplicate or contradictory result.**

1. **2024-09-21, Wembley Stadium:** Joshua Buatsi defeated Willy Hutchinson by **split decision over 12 rounds**, for the interim WBO light-heavyweight title. The recovered archived queue already contains this row for `boxing-willy-hutchinson`, priority 1, with `outcome_archived=L`, `method_archived=SD 12`, `ledger_status=NEEDS_INDEPENDENT_VERIFICATION`. Contemporaneous Sky Sports postfight report (22 Sep 2024): https://www.skysports.com/boxing/news/13219408/spiteful-buatsi-drops-and-defeats-hutchinson ; independently corroborated by Bleacher Report: https://bleacherreport.com/articles/10136225-winners-and-losers-of-anthony-joshua-daniel-dubois-card . **Result corroborated; archived ledger row not silently mutated.**
2. **2026-11-07, AO Arena, Manchester:** Willy Hutchinson defeated Joshua Buatsi by **unanimous decision over 12 rounds**, taking the vacant WBC light-heavyweight title. Judges: 117–112, 115–113, 115–113. Already present in `research/boxing/verified-bout-core-20261114.json` as CompuBox report **16970**, so **do not count this as a new CompuBox discovery or request it again**. Independent postfight reports: Sky Sports (7 Nov 2026) https://www.skysports.com/boxing/news/13609599/willy-hutchinson-crowned-as-new-wbc-light-heavyweight-champion-after-beating-joshua-buatsi-in-rematch ; Reuters (8 Nov 2026) https://www.reuters.com/sports/britains-hutchinson-beats-buatsi-take-vacant-wbc-light-heavyweight-title-2026-11-08/ ; BoxingScene event result https://www.boxingscene.com/events/joshua-buatsi-willy-hutchinson-2 .

## Safe-match regression rule

The same ordered or unordered fighter pair can meet more than once. **Never deduplicate solely by fighter/opponent names or IDs.** A verified bout key must include stable identity for BOTH participants **and the event date** (and event ID if available). These two events differ by 777 days and have reversed winners. Preserve source-reported method and championship context per event. The alias William Hutchinson / Willy Hutchinson is explicitly recorded in the existing curated core; no additional identity merges were made.

## Reconciliation ledger overlay (not a career certificate)

| boxer_id | date | opponent | verified outcome | method | evidence status | source |
|---|---|---|---|---|---|---|
| boxing-willy-hutchinson | 2024-09-21 | Joshua Buatsi | L | SD 12 | INDEPENDENT_POSTFIGHT_CORROBORATED; priority-1 archived row match | Sky Sports 2024; Bleacher Report |
| boxing-willy-hutchinson | 2026-11-07 | Joshua Buatsi | W | UD 12 | INDEPENDENT_POSTFIGHT_CORROBORATED; ALREADY_IN_CURATED_CORE report 16970 | Sky Sports 2026; Reuters; BoxingScene |

The archived queue's `verified_bout_id` stays blank until stable opponent identity IDs and ledger insertion are completed. No punch statistics copied from the cache in this pass. These are **two verified bout outcomes**, not two complete histories; the 2026 result is already in the curated core and must not be added twice.

## Counts and next gate

- Foundation: **509 provisional profiles** (499 ranked + 10 additional prospects); **0 fully certified careers**, **509 pending**.
- Archived queue: **345 provisional entries / 69 fighters**, of which **1 priority-1 row now has an independently corroborated postfight outcome in this overlay**; do not interpret this as the entire queue being verified.
- Previous **20 independently corroborated bout results** from batches 1–14 remain subject to global deduplication. This pass reconciles **one additional archived priority-1 bout** and independently crosschecks **one existing cached bout**, without claiming a globally deduplicated cumulative count.
- Next: assign stable opponent IDs for the 2024 event, reconcile against any other evidence tables, then advance another priority-1 row. Preserve the Rodriguez/Rivera identity exception.

No paid APIs, new CompuBox requests, main/production/Render changes, publication, or UFC V4 modifications.
