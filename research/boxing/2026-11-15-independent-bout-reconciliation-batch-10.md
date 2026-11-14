# Independent boxing reconciliation — 15 November 2026 (batch 10)

Research only. One **new distinct** Jesse “Bam” Rodriguez professional bout corroborated; no complete-career certification.

| Event-local date | Boxer | Opponent | Result | Achievement | Status |
|---|---|---|---|---|---|
| 2022-02-05 | Jesse Rodriguez | Carlos Cuadras | W UD12; scores 117–110, 117–110, 115–112 | Captured vacant WBC super-flyweight championship | BOUT_RESULT_CORROBORATED |

## Source reconciliation

- [WBC official postfight report, 6 February 2022](https://wbcboxing.com/en/jesse-rodriguez-is-the-new-wbc-super-flyweight-champion/) verifies date (Saturday 5 February local), participants, 12-round unanimous decision, three cards and vacant WBC title; postfight Rodriguez 15–0, Cuadras 39–5–1.
- [Bad Left Hook contemporaneous results, 5 February 2022](https://www.badlefthook.com/2022/2/5/22918976/carlos-cuadras-vs-jesse-rodriguez-live-streaming-results-round-by-how-watch-boxing-news-2022) independently verifies UD12 and identical scorecards.
- [BoxingScene contemporary photo report, 6 February 2022](https://www.boxingscene.com/articles/photos-jesse-rodriguez-stuns-carlos-cuadras-captures-wbc-title) independently corroborates the outcome and title.
- [Fightnews contemporaneous results, 5–6 February 2022](https://fightnews.com/results-from-phoenix-2/127537) independently corroborates opponent, method, scores and venue.
- [15rounds ringside result, 5 February 2022](https://www.15rounds.com/2022/02/05/early-results-from-phoenix-cuadras-rodriguez/) and [KSAT local event coverage, 6 February 2022](https://www.ksat.com/sports/2022/02/06/inside-the-ring-bam-rodriguez-becomes-san-antonios-newest-world-champion-boxer/) each report Rodriguez 258 landed / 688 thrown and Cuadras 172 landed / 944 thrown. These are **article-level aggregate punch claims only**, NOT a verified CompuBox cache report. Do not import as CompuBox fields or infer jab/power/round splits.
- **Record discrepancy:** [Boxerbook bout page](https://boxerbook.com/bouts/6376/carlos-cuadras-vs-jesse-rodriguez) gives Cuadras prefight 41–4–1, conflicting with WBC/Fightnews prefight 39–4–1 (postfight 39–5–1). Mark `PREFIGHT_RECORD_CONFLICT`; do not silently overwrite.
- **Title wording exception:** [Boxing Junkie contemporary recap](https://sports.yahoo.com/jesse-rodriguez-scores-stunning-upset-073533723.html) calls the belt a secondary WBC title, while WBC itself calls it its vacant world super-flyweight championship. Preserve `TITLE_CLASSIFICATION_SOURCE_DISAGREEMENT`; historical acquisition verified, current status not inferred.
- **Identity safeguard:** Carlos Cuadras is a separate fighter from Cristian Gonzalez Hernandez, Israel Gonzalez and Juan Francisco Estrada; avoid fuzzy opponent-name merges. The scheduled Srisaket Sor Rungvisai–Cuadras matchup was replaced, not a completed bout.

## Cumulative position and restrictions

- Previously 18 distinct corroborated bout results across batches 01–09; **+1** unique result = **19 cumulative** pending archived-queue deduplication.
- **0/509 full professional careers certified; 509/509 pending**. This bout extends Rodriguez's evidenced historical sequence, not an independently certified full career or current record.
- 345-entry archived-bout queue remains unavailable at the previously checked `research/boxing/archived-bout-verification-queue.csv`; no row-level reconciliation count asserted.
- 78 scouting profiles and validated CompuBox cache left untouched. No paid APIs, production/main/Render or UFC V4 changes.
