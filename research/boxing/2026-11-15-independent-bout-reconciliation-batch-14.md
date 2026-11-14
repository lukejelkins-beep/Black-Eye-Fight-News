# Boxing reconciliation — 15 November 2026, batch 14: archived queue recovered

Research only. This batch resolves the repeated queue-location blocker and establishes the authoritative deduplication input; it does **not** certify additional bouts or careers.

## Verified repository inventory
- The 345-entry queue **exists** at [research/boxing/generated/archived-bout-verification-queue.csv](./generated/archived-bout-verification-queue.csv), not the repeatedly attempted `research/boxing/archived-bout-verification-queue.csv`. Confirmed by reading the file on the research branch and listing the branch Git tree.
- The companion [archived-bout-verification-qa.json](./generated/archived-bout-verification-qa.json) reports 345 provisional entries across 69 fighters: priority 1 = 15; priority 2 = 145; priority 3 = 150; priority 4 = 35. One unresolved date-format item. **0 records verified** and **0 CompuBox links verified to the ledger** in that QA snapshot.
- [509-profile foundation](./generated/boxing-profiles-foundation-v1.json), [16 cached CompuBox reports](./compubox/bouts/), [curated bout core](./verified-bout-core-20261114.json), and [status report](./BOXING-PROFILES-STATUS.md) all exist in this branch. The status report confirms 78 reused scouting profiles (68 ranked, 10 retained extras).
- The archived queue includes `boxer_id`, `fight_date_iso`, `opponent_candidate`, `ledger_status`, `verified_bout_id`, and source URLs. Its archived outcomes are **not** verified fight results.

## Next verification and safe matching
1. Deduplicate the 20 previously corroborated results against this recovered queue by stable boxer ID, ISO bout date, and independently resolved opponent identity; do not equate a candidate name with a verified opponent ID.
2. Work the 15 priority-one rows first, preserving source-level KO/TKO/RTD and identity discrepancies. Require an independent postfight source for row certification; a prefight listing alone does not establish outcome.
3. Keep `verified_bout_id` empty for all unresolved matches. Never interpret missing CompuBox fields as zero or infer career completeness from the five archived rows.
4. For the Rodriguez–Rivera September 2020 row, keep Janiel Rivera / Jan Paul Rivera identities separate pending original commission evidence; for Rodriguez–Juárez December 2020, retain postfight-confirmation-pending status.

## Counts
- **509 provisional profiles; 0 complete careers certified; 509 pending**.
- **20 previously corroborated bout results**, subject to deduplication against the recovered archive; **0 new independently corroborated results in this batch**.
- The archived queue is now **located**, not missing. Its 345 entries remain provisional, not 345 verified fights.
- No API calls, CompuBox re-fetches, paid services, production/main/Render writes, or UFC V4 changes.
