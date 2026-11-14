# Jean Silva (Lord): exhaustive eight-UFC-fight career source attestation

Reviewed 14 November 2026. **Candidate only until offline V4 numeric fighter identity, UFC event eligibility, result and complete metric gates independently pass.** No collector/production writes.

- Official athlete biography: https://www.ufc.com/athlete/jean-silva (Octagon debut 13 January 2024; eight fight descriptions through 12 September 2026)
- Sept 2026 official result: https://www.ufc.com/event/ufc-fight-night-september-12-2026
- UFCStats-derived independent Greco source at immutable commit: https://github.com/Greco1899/scrape_ufc_stats/commit/c742842f29466758fedc3906dbad28d6d320a8da
- Fighter identity **Jean Silva “Lord”** UFCStats id `52ef95b5860fb28c`; reject distinct **Jean Silva “White Bear”** id `9211aae062b799d6`.
- Numeric native fighter id `236`; expected eight UFC career fight IDs below. DWCS 5 Sep 2023 vs Kevin Vallejos, native `88269`, is separately UFC-sourced feeder evidence, not an official UFC career bout.

| Official date | Opponent | Outcome | Cached native fight | UFCStats fight ID |
|---|---|---|---|---|
| 2024-01-13 | Westin Wilson | Win | 59922 | 0494ebcee93e717b |
| 2024-06-29 | Charles Jourdain | Win | 61048 | 2b7883b304b3df1c |
| 2024-07-13 | Drew Dober | Win | 61067 | 54de03e04f571735 |
| 2025-02-22 | Melsik Baghdasaryan | Win | 38531 | 8ef7723b6a8b45e1 |
| 2025-04-12 | Bryce Mitchell | Win | 60969 | 8c540eb4afe8c43e |
| 2025-09-13 | Diego Lopes | Loss | 38221 | de1a3734be60e6a1 |
| 2026-01-24 | Arnold Allen | Win | 60640 | 836a188a90e479a5 |
| 2026-09-12 | Jose Miguel Delgado (source: Jose Delgado) | Win | 83816 | 034c04e480d87b8f |

Official UFC bio text identifies Diego Lopes as the winner in Sept 2025, despite an inaccurate “Win” graphic near the athlete record. Narrative/Greco/native outcomes reconcile this as Jean Silva LOSS. The official 12 September 2026 event presents the main-event opponent as Jose Miguel Delgado, while saved UFCStats/source data abbreviates Jose Delgado. No assertion of direct UFCStats website access; direct links are retained from independently indexed Greco UFCStats-derived records.

Strict approval gate: all eight source fights must be saved with exactly one numeric native fighter/corner identity and exact outcome, complete measured core metrics and chronological coverage, with the DWCS record excluded by recorded event evidence. The existing five-minute collector owns all cache/API writes.
