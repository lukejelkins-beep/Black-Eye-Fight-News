# Sumo bout predictor

Added 28 Nov 2026. Code: `assets/sumo-predict.mjs` (model, shared by the browser and the build), `scripts/sumo-build-predictor.mjs` (fit and backtest), output `data/sumo/predictor.json` (37 KB). Tests: `tests/test-sumo-predict.mjs`, `tests/test-sumo-analysis.mjs`.

## What it uses
For each bout, side a is the higher-ranked man. The chance is `sigmoid(rank·Δrank + rating·Δrating + form·Δform)`:
- **Δrank:** difference of `-ln(1 + position/8)`, where position is the place down the whole banzuke (0 = Yokozuna 1 East). A log scale, so Y1 v O1 is a bigger gap than M14 v M15.
- **Δrating:** an Elo-style residual ("better or worse than his rank"), starting at 0 for everyone, updated after every fought bout in Makuuchi, Juryo and Makushita in the saved archive. Expected score for the update uses rank too (`rankWeight`). K and rankWeight are grid-searched on the training basho.
- **Δform:** wins minus losses so far in this basho, through the day before, divided by 5.
- Fusen and absences are never rated. Bouts against a man outside the three saved divisions are skipped (his rank is not in the file).

Not used: age, weight, stable. Head-to-head (meetings in the saved archive before the bout, shrunk) was tested on 28 Nov: test Brier 0.24215 v 0.24235 over all bouts, 0.23627 v 0.23561 in Makuuchi (worse). No clear gain, so left out.

## How it was scored (walk-forward)
- Archive: 13 basho, Nov 2024 to Nov 2026. Nov 2024 only warms the ratings up.
- Train: Jan 2025 to Mar 2026 (8 basho). Test: May, Jul, Sep, Nov 2026 (4 basho, 3,535 bouts, 1,151 in Makuuchi). Every bout predicted the morning of its day.
- Result on test (weights fitted on train only), Elo K 16, rankWeight 0.25:

| | Brier | Accuracy |
|---|---|---|
| Model, all bouts | 0.2424 | 57.5% |
| Rank only (logistic), all | 0.2472 | 52.5% |
| Model, Makuuchi | 0.2356 | 59.8% |
| "Higher rank wins", Makuuchi | | 56.8% |

Brier gain over rank only: 0.0049, 95% interval 0.0026 to 0.0073 (bootstrap by basho day). Form adds little (0.2426 without it) but is kept because it helps in Makuuchi (0.2372 without).

Calibration on test: 50-60% → favourite won 55.6%; 60-70% → 65.0%; 70-80% → 69.5% (118 bouts); 80-90% → 73.3% (15 bouts). It is slightly over-confident above 70%; there are few such bouts. The page shows this table.

The weights shipped for live use are refitted on all 12 scored basho with the same Elo settings (rank 0.639, rating 0.553, form 0.218).

## Where it shows
- `sumo.html#predict`: pick two men (Makuuchi or Juryo), "What decides it", power table, track record.
- Basho review and live basho (`#review`): each day's Makuuchi results with the winner's morning chance, the day's score, "Beat the odds / Fell short" (wins minus expected wins), the basho's running score; in a live basho, the next day's picks once the torikumi is out.
- Stories: "The <month> basho" row (beat the odds, biggest shock, fell short, hot streak, underrated).
- Insights: "Underrated and overrated" (banzuke place v power place, gaps of 5+).

## Upkeep
`.github/workflows/sumo-banzuke-release-watch.yml` rebuilds `predictor.json` after it saves a new basho (offline, no requests) and runs the two test files. The rating file covers wrestlers seen in the archive; a newcomer starts at 0 (his rank does the work).
