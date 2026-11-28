# Sumo bout predictor (v2)

Updated 28 Nov 2026 (v1 shipped earlier the same day, in the same PR). Code:
- `assets/sumo-model-features.mjs`: the feature engine. A day-by-day replay that gives every bout what was known that morning, then updates with the day's results. The build, the browser and the tests share it.
- `assets/sumo-predict.mjs`: inputs, the model, explanations, live replay, power table.
- `scripts/sumo-collect-model-data.mjs`: paced Sumo API collection of 2000-2026 Makuuchi, Juryo and Makushita banzuke, with every bout, and the wrestler list, into a local cache (not committed, not published). 486 banzuke requests and 10 list requests at one per second, 28 Nov 2026, under the owner's permission of 24 Nov.
- `scripts/sumo-build-model.mjs`: full refit (`--cache <dir>`), or a daily roll-forward (`--update`, no cache and no network).
- `scripts/sumo-model-export.mjs`: CSV export for research.
- Output: `data/sumo/predictor.json` (published, 165 KB: weights, test results, saved chances for the archive basho, state for current wrestlers) and `data/sumo/predictor-state.json` (not published: the full state for `--update`).

## Inputs (side a is the higher-ranked man; all known the morning of the bout)
| Group | Inputs |
|---|---|
| Rank | log-scale banzuke position of both men, difference; cross-division bout |
| Rating | Elo starting at 175 x rank score, K = 12 + 80 x exp(-bouts/20) (fast for newcomers), tuned on 2003-2024; v1's rating against rank (K 8 and 16); log bouts rated |
| This basho | wins minus losses so far; absences; kachi-koshi pressure (needs every remaining win while the opponent is decided, record decided, share of remaining bouts needed); day |
| Age and career | age and (age - 28)^2; years since debut; basho in Makuuchi since 2000 |
| Head-to-head | shrunk record (wins - losses) / (meetings + 4) since 2000; who won the last meeting |
| Last basho | had one in the top three divisions; net wins; absences; rank change |
| Style and background | share of wins by pushing, belt and pull-down techniques, push x belt matchup; born abroad or in Japan |

Missing values count as level (0). Fusen bouts and absences are never rated.

## Method
- Data: 125,791 fought bouts in Makuuchi, Juryo and Makushita from 2003 to Nov 2026. 2000-2002 only warm the ratings up.
- Train 2003-2022; choose penalty (L2, C = 3) and calibration on 2023-2024; test 2025-2026 (10,629 bouts, 3,527 in Makuuchi). The calibration slope may soften but never sharpen the chances. On 2023-2024 it chose 1.0 (no change).
- v1 baseline: rank, rating against rank and form, fitted on the same bouts.
- The site's weights are refitted on all bouts from 2003. Chances saved for the archive basho come from the 2003-2024 fit, so the review's "called X of Y" for 2025-2026 is out of sample.

## Results on 2025-2026 (never seen in fitting)
| | Brier, all | Brier, Makuuchi | Makuuchi called |
|---|---|---|---|
| v2 | 0.2377 | 0.2355 | 60.1% |
| v1 method | 0.2417 | 0.2377 | 59.6% |
| Higher rank wins | | | 56.1% |

Brier gain over v1: 0.0040 over all bouts (95% interval 0.0031 to 0.0052); 0.0022 in Makuuchi (0.0004 to 0.0036), resampling whole basho days.

By year, Makuuchi bouts called: 2025 60.8% v 61.0% (v1 slightly ahead); 2026 59.2% v 58.3%.

Calibration on test: 50-60% → favourite won 55%; 60-70% → 66%; 70-80% → 69% (644 bouts); 80-90% → 76% (94 bouts). It is over-confident above 70%; there are few such bouts.

## Tested and left out
- **Height and weight.** Dated measurements are sparse in the API (about 6 changes logged per basho). Even a probe using today's listed size, which leaks the future, added nothing. Not used.
- **LightGBM** (tuned on 2023-2024, calibrated). Test Brier 0.2375 all, 0.2360 Makuuchi, against 0.2377 and 0.2355 for the logistic model. No better, much bigger, and not explainable on the page.
- **Sharpening the chances.** The 2023-2024 fit asked for a little, but the test shows over-confidence already, so it is capped at 1.0.
- **Dropping style and birthplace** costs 0.0003 Brier overall and 0.0002 in Makuuchi, so both are kept. Birthplace is a single born-abroad or born-in-Japan flag, shown under "Style and background". The owner can drop it at that small cost.

## Upkeep
- After the daily release watch saves a new basho, `--update` rolls the ratings and state forward and saves that basho's chances with the current weights. It makes no requests and does not refit.
- Refit by hand once or twice a year: collect with `scripts/sumo-collect-model-data.mjs --cache <dir>` (cached files are not fetched again), then `scripts/sumo-build-model.mjs --cache <dir>`. Check that the test results above still hold before committing.
- A new wrestler with no saved attributes gets level age and career inputs until the next refit.
