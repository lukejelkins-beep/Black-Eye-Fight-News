# UFC rating calibration, R4 research (23 November 2026)

**Research only. Nothing here changes a rating or the site.** R4 (V4 ratings, classification, leaderboards) is approved by the owner (confirmed 2026-11-23, tracker #171); this note tests the claim it can honestly make. This tests the rating that is live today (`scripts/ufc_ratings.py`, "ratings v2"), not the experimental `ufc-v4-shadow-0.1` from draft #109, which is not on `main`.

## What was asked and how it was tested
The R4 checklist asks for a frozen algorithm, an independent hold-out calibration, division and era fairness checks, and validation of minimum samples and no-contest handling. This is a walk-forward hold-out: for each quarter from 2024 the stats build is re-run as it stood on that day (fights from that day on left out, algorithm unchanged), and every decided fight in the following quarter is scored with a one-parameter logistic of the rating difference. The slope is fitted only on earlier quarters. Reproduce with `python3 scripts/ufc-r4-calibration.py`.

## Findings
1. **The rating predicts better than a coin flip, but not clearly better than a plain career win rate.** Brier improvement over a coin flip is +0.019 (95% interval +0.010 to +0.027). Over the career win rate it is +0.006 with an interval of -0.001 to +0.013, which includes zero. Accuracy is 61.0% against 60.7% for win rate and 57.8% for recent form alone. The rating is a good description of a fighter; it should not be sold as a prediction.
2. **Calibration is reasonable, slightly overconfident at the top.** The 70%+ calls win 70.1% against 75.2% predicted; the middle bins are within a few points.
3. **Minimum sample.** Fighters with 1 to 2 measured fights (the provisional ratings) did as well as anyone (65.8% ± 7.5 over 155 fights), so the labelled-provisional display is not contradicted, though the sample is small. Accuracy falls as both fighters have more fights (58.0% at 6 or more), which is expected: experienced fighters are more evenly matched.
4. **Fairness by division, sex and year: no group is clearly broken, and no group is clearly good.** Women's divisions 65.9% (151 fights), men's 60.0%. 2024, 2025, 2026 are 61.4%, 61.8%, 59.7%. Flyweight, light heavyweight and welterweight are 54 to 56% with ranges of about ±10 points, so they cannot be told apart from a coin flip on this sample. Every group's range overlaps the pooled figure.
5. **No-contests and draws** are not rated and not scored (9 NC, 9 draws in the test period); fights with a fighter outside the roster at the cutoff (301) are not scored.

## Limits of this test (read before using it)
- **Survivorship.** The fights come from the current 921-fighter roster (active in the last 36 months as of November 2026), so a fighter who left the UFC after a test fight is missing. The direction of the bias is not known, but it is not a clean population. See `docs/ufc-v4-r4-calibration-full-20261123.md`: the archive holds about 100% of decided UFC fights from 2024 on, so this limit mainly concerns earlier years.
- **About 1,100 decided fights, 926 scored.** Division results have 35 to 127 fights each; the ranges above are the honest read.
- **Fighter-level, not opponent-adjusted.** Opponent strength enters only through the form score.
- **No credential, ranking or market information** was used or tested. Betting or "favourite" language should not be built on this.
- **One slope, no intercept, no home or corner effect.** A richer model was not tried.

## What is still open for R4
The owner has decided what claim the rating makes: descriptive only, a percentile among rated UFC fighters, never a forecast (#432). Still open: a larger or de-biased test set (include fighters who left) and the design review in the release checklist. Neither is started.

---

## Full output

Cutoffs: 2024-01-01, 2024-04-01, 2024-07-01, 2024-10-01, 2025-01-01, 2025-04-01, 2025-07-01, 2025-10-01, 2026-01-01, 2026-04-01, 2026-07-01, 2026-10-01. Test period to 2026-11-21. Each quarter's ratings use only fights before it; the slope is fitted on earlier quarters only.

- Fights per quarter (decided, both in the roster): [103, 114, 104, 101, 101, 109, 106, 104, 89, 116, 110, 80]
- Scored (a fitted slope exists and both fighters have an overall rating): **926** of 1134 decided test fights (82% coverage)
- Not scored: {"not in the roster at the cutoff": 301, "NC": 9, "D": 9}

### Overall

| Model | Fights | Accuracy | Brier | Log loss |
|---|---:|---:|---:|---:|
| Coin flip | 926 | 0.500 | 0.250 | 0.693 |
| BEFN overall rating | 926 | 0.610 | 0.231 | 0.655 |
| Career win rate | 926 | 0.607 | 0.237 | 0.668 |
| Recent form alone | 926 | 0.578 | 0.241 | 0.675 |

Brier improvement over a coin flip (positive is better): +0.0187, 95% interval +0.0102 to +0.0271 (paired bootstrap).

Brier improvement over the career win rate (positive is better): +0.0059, 95% interval -0.0011 to +0.0134.

### Calibration (does a 70% call win about 70%?)

| Predicted | Fights | Mean predicted | Observed win rate |
|---|---:|---:|---:|
| 0.0 to 0.4 | 238 | 0.319 | 0.336 |
| 0.4 to 0.5 | 215 | 0.450 | 0.437 |
| 0.5 to 0.6 | 227 | 0.547 | 0.507 |
| 0.6 to 0.7 | 159 | 0.645 | 0.679 |
| 0.7 to 1.0 | 87 | 0.752 | 0.701 |

### By sample size of the ratings

#### Pair type

| Group | Fights | Accuracy (95% range) | Brier | Log loss |
|---|---:|---:|---:|---:|
| any provisional | 155 | 0.658 ± 0.075 | 0.214 | 0.617 |
| established | 771 | 0.600 ± 0.035 | 0.235 | 0.663 |

#### Fewer measured fights of the two fighters

| Group | Fights | Accuracy (95% range) | Brier | Log loss |
|---|---:|---:|---:|---:|
| 1-2 measured fights | 155 | 0.658 ± 0.075 | 0.214 | 0.617 |
| 3-5 | 331 | 0.627 ± 0.052 | 0.227 | 0.645 |
| 6 or more | 440 | 0.580 ± 0.046 | 0.241 | 0.676 |

### Fairness checks

#### Sex (men's / women's divisions)

| Group | Fights | Accuracy (95% range) | Brier | Log loss |
|---|---:|---:|---:|---:|
| men | 768 | 0.600 ± 0.035 | 0.234 | 0.660 |
| women | 151 | 0.659 ± 0.076 | 0.218 | 0.627 |

#### Year

| Group | Fights | Accuracy (95% range) | Brier | Log loss |
|---|---:|---:|---:|---:|
| 2024 | 258 | 0.614 ± 0.059 | 0.226 | 0.644 |
| 2025 | 344 | 0.618 ± 0.051 | 0.227 | 0.645 |
| 2026 | 324 | 0.597 ± 0.053 | 0.240 | 0.675 |

#### Division

| Group | Fights | Accuracy (95% range) | Brier | Log loss |
|---|---:|---:|---:|---:|
| (different divisions) | 115 | 0.587 ± 0.090 | 0.237 | 0.667 |
| bantamweight | 82 | 0.604 ± 0.106 | 0.237 | 0.666 |
| featherweight | 85 | 0.606 ± 0.104 | 0.227 | 0.643 |
| flyweight | 77 | 0.552 ± 0.111 | 0.250 | 0.697 |
| heavyweight | 49 | 0.663 ± 0.132 | 0.212 | 0.613 |
| light-heavyweight | 56 | 0.536 ± 0.131 | 0.244 | 0.681 |
| lightweight | 127 | 0.642 ± 0.083 | 0.231 | 0.654 |
| middleweight | 99 | 0.646 ± 0.094 | 0.229 | 0.655 |
| welterweight | 95 | 0.558 ± 0.100 | 0.232 | 0.654 |
| womens-bantamweight | 35 | 0.686 ± 0.154 | 0.205 | 0.597 |
| womens-flyweight | 39 | 0.641 ± 0.151 | 0.243 | 0.682 |
| womens-strawweight | 67 | 0.649 ± 0.114 | 0.213 | 0.617 |
