# Archived boxing queue — reciprocal candidate audit (batch 18, 15 November 2026)

Research-only audit of the existing `research/boxing/generated/archived-bout-verification-queue.csv` (345 rows). Exact-name candidate pairing requires both boxer names to appear reciprocally as opponent names **on the same ISO date**. This is a structural crosswalk, **not independent result verification**, opponent-ID certification, or permission to merge identities.

| Date | Perspective A | Perspective B | Archived outcomes | Archived methods | Status |
|---|---|---|---|---|---|
| 2025-10-25 | Fabio Wardley | Joseph Parker | W / L | TKO R11 / TKO R11 | RECIPROCAL_CANDIDATE_UNVERIFIED |
| 2024-09-21 | Joshua Buatsi | Willy Hutchinson | W / L | SD 12 / SD 12 | RECIPROCAL_MATCH_PREVIOUSLY_CORROBORATED_BATCH_17 |
| 2025-02-24 | Jason Moloney | Tenshin Nasukawa | L / W | UD 10 / UD 10 | RECIPROCAL_CANDIDATE_UNVERIFIED |
| 2025-07-12 | David Morrell Jr. | Imam Khataev | W / L | SD 10 / SD 10 | RECIPROCAL_CANDIDATE_UNVERIFIED |

## Measured outcome

- All **345** archive rows scanned; **4 reciprocal pairs / 8 perspective rows** identified by exact-name and exact-date matching.
- **3 previously unrecorded reciprocal candidates / 6 perspective rows** surfaced beyond the already documented Buatsi–Hutchinson pair. **0 newly independently verified fights**; **0 careers certified**.
- Each pair has complementary W/L outcomes and equal archived method strings; this is only an internal consistency check.
- **337 rows** have no exact reciprocal match in this archive. This does **not** establish they are unique bouts: their opponents may be outside the queue, names may differ, or identity may be ambiguous.
- Cohort remains **509 profiles: 0 full-career certified, 509 pending**.

## Guardrails and next verification

Before canonical bout-level deduplication, independently corroborate date, participant identities, outcome and method using event/commission/promoter or reputable contemporary postfight records. Preserve original perspective rows. Treat missing reciprocal matches as unknown, not proof of unique bouts. Verify stable opponent IDs before any merge. Preserve absent CompuBox data as null/unknown, never zero. Do not fetch paid APIs or re-request cached CompuBox reports.

The audit does not change profile foundation, scouting data, main, production, Render, or UFC V4.