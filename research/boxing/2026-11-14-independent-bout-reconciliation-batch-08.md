# Independent boxing reconciliation — 14 November 2026 (batch 08)

Research-only. Two **new distinct event-corroborated bouts** for Jesse “Bam” Rodriguez, not previously counted in batches 01–07. Neither constitutes a complete professional history.

| Event-local date | Fighter | Opponent | Outcome | Verified event-level result | Evidence status |
|---|---|---|---|---|---|
| 2023-12-16 | Jesse Rodriguez | Sunny Edwards | Win | Stoppage after round 9; Matchroom labels TKO9, detailed register labels RTD9 | BOUT_RESULT_CORROBORATED; METHOD_SUBTYPE_EXCEPTION |
| 2023-04-08 | Jesse Rodriguez | Cristian Gonzalez Hernandez | Win | UD12; scores 118–110, 117–111, 116–112 | BOUT_RESULT_CORROBORATED |

## Evidence and method reconciliation
- **Edwards:** [Matchroom's event page](https://www.matchroomboxing.com/events/rodriguez-vs-edwards/) identifies Saturday 16 December 2023, Rodriguez victory and TKO in round 9. [Guardian's contemporaneous report](https://www.theguardian.com/sport/2023/dec/17/jesse-bam-rodriguez-sunny-edwards-fight-report) independently confirms that Edwards completed round 9 but his corner stopped the contest before round 10. [Boxerbook's detailed result](https://boxerbook.com/bouts/6372/sunny-edwards-vs-jesse-rodriguez) classifies it RTD9. **Do not coerce TKO into KO or assert an in-round stoppage; preserve TKO/RTD source labels and reason as corner retirement after round 9.** Historical achievement: WBO/IBF flyweight unification, corroborated by the Guardian.
- **Gonzalez:** [WBO's contemporaneous account, 9 April 2023](https://wboboxing.com/boxing-news/bam-rodriguez-wins-wbo-flyweight-world-title-now-a-two-division-champion/) and [BoxingScene's contemporaneous report](https://www.boxingscene.com/articles/jesse-bam-rodriguez-outpoints-elusive-cristian-gonzalez-wins-vacant-wbo-flyweight-title) corroborate 8 April event-local date, UD12, three scores, and vacant WBO flyweight title. [15rounds event report](https://www.15rounds.com/2023/04/08/early-results-from-san-antonio-rodriguez-gonzalez/) independently agrees. Historical achievement: WBO flyweight championship; **not** evidence of present title status. Preserve name variant Cristian Gonzalez / Cristian Gonzalez Hernandez for identity review; do not automatically merge on name.
- **Source quality exception:** [Boxing247 live result](https://www.boxing247.com/boxing-news/tonight-rodriguez-vs-gonzalez-live-results) gives middle score **117–110**, conflicting with WBO, BoxingScene, and 15rounds **117–111**. Prefer the convergent three-source score but retain disagreement in evidence; do not silently treat every source as matching.
- No new CompuBox report retrieved. BoxingScene's aggregate punch counts are not independently validated CompuBox cache and must **not** populate CompuBox-specific fields. No round-level punch statistics inferred.

## Integrity and progress
- Prior 14 distinct corroborated results + **2 new distinct results = 16 event-corroborated bout results**, subject to future exact-key deduplication against the archived queue.
- **0/509 complete professional careers certified; 509/509 pending**. Current records, five/ten/full bout-history completeness not established by these results.
- The 345-row archived queue path is still unresolved; do not claim row-level queue completion. Existing 78 scouting profiles and CompuBox cache unchanged.
- No paid APIs, changes to main/production/Render, or UFC V4 work.
