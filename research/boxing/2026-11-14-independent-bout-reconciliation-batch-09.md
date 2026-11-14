# Independent boxing reconciliation — 14 November 2026 (batch 09)

Research-only; two new distinct historical Jesse “Bam” Rodriguez bouts, not previously counted in batches 01–08. No assertion of complete career verification.

| Event-local date | Boxer | Opponent | Result | Evidence status |
|---|---|---|---|---|
| 2022-09-17 | Jesse Rodriguez | Israel Gonzalez | W UD12, scores 118–109, 117–110, 114–113 | BOUT_RESULT_CORROBORATED |
| 2022-06-25 | Jesse Rodriguez | Srisaket Sor Rungvisai | W TKO8, referee stoppage 1:50 of round eight | BOUT_RESULT_CORROBORATED; KO_TKO_SOURCE_LABEL_EXCEPTION |

## Independent source reconciliation

- **Gonzalez:** [WBC report dated 18 September 2022](https://wbcboxing.com/rodriguez-defendio-su-titulo-wbc-en-una-gran-pelea/) and [BoxingScene ringside report dated 17 September 2022](https://www.boxingscene.com/articles/bam-rodriguez-decisions-israel-gonzalez-retains-title-tougher-expected-fight) agree on opponent, event-local date, unanimous decision, all three scorecards and WBC super-flyweight title defense. [Fightnews ringside report](https://fightnews.com/bam-rodriguez-vence-a-rodriguez-y-retiene-titulo-wbc-115-libras-en-las-vegas/137884) independently agrees. Gonzalez is Israel “Jiga” Gonzalez, **not** Cristian Gonzalez Hernandez of the April 2023 bout. Do not merge identities based on surname.
- **Sor Rungvisai:** [WBC report dated 27 June 2022](https://wbcboxing.com/en/jesse-rodriguez-proves-hes-a-legitimate-super-flyweight/) and [Bad Left Hook live result dated 25 June 2022](https://www.badlefthook.com/2022/6/25/23182319/rodriguez-vs-rungvisai-live-streaming-results-round-by-how-watch-start-time-dazn-boxing-news-2022) agree on TKO8 at 1:50; [BoxingScene ringside report dated 25 June 2022](https://www.boxingscene.com/articles/jesse-bam-rodriguez-beats-down-drops-stops-srisaket-sor-rungvisai-eight) describes referee intervention at 1:50 but calls it an eighth-round knockout in its headline. Preserve canonical referee-stoppage detail and both source labels; **do not turn TKO into KO**. Historical achievement: defense of WBC super-flyweight title.
- Boxerbook [Gonzalez](https://boxerbook.com/bouts/6374/israel-gonzalez-vs-jesse-rodriguez) supports identity and bout ordering, but is not counted as a substitute for contemporary reports.

## Data integrity and next work

- Prior **16** distinct event-corroborated bouts + **2** new = **18** cumulative bout-result corroborations; archive-queue deduplication remains pending.
- **0/509 complete professional careers certified; 509/509 pending**. Rodriguez 2022 event results do not establish his full professional bout sequence, nor current 2026 record.
- No CompuBox values imported. An article describing percentage statistics is not an authenticated cache row or sufficient evidence for thrown/landed/round-by-round breakdown. Missing values remain missing, not zero.
- 345-entry archived verification queue still not found at `research/boxing/archived-bout-verification-queue.csv`; find canonical location before claiming queue progress. 78 scouting profiles and existing validated CompuBox cache untouched.
- Research branch only; no paid APIs, production/Render/main changes, or UFC V4 modifications.
