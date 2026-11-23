# UFC rating calibration with a larger test set, R4 research (23 November 2026)

**Research only. Nothing here changes a rating or the site.** This follows `docs/ufc-v4-r4-calibration-20261123.md`, which listed survivorship and a small sample as the limits of the first test. It re-runs the same walk-forward test (`scripts/ufc-r4-calibration.py`, algorithm unchanged) with a longer period and checks whether survivorship is a real problem in our data. The script gains an optional `--truth full` flag; the default is unchanged and still reproduces the 23 Nov numbers exactly (926 of 1,134 fights scored, accuracy 0.610, Brier 0.231).

## Finding 1: the archive is nearly complete from 2024 on, and thin before that
`--truth full` builds the test fights from every archived fighter, including those who have since left the UFC (1,732 fighter files against 921). It made **no difference**: the same 4,621 fights, none added. The reason is the data, not the script: the research archive only holds fights that involve at least one fighter from the roster it was collected for, so a fight between two fighters who have both since left is not in it at all.

Decided UFC fights per year, the free UFCStats export (all UFC events, Road to UFC and Contender Series left out) against the archive:

| Year | UFCStats | Archive | Share |
|---|---:|---:|---:|
| 2014 | 494 | 119 | 24% |
| 2016 | 483 | 186 | 39% |
| 2018 | 469 | 250 | 53% |
| 2019 | 506 | 319 | 63% |
| 2020 | 444 | 319 | 72% |
| 2021 | 497 | 395 | 79% |
| 2022 | 506 | 437 | 86% |
| 2023 | 513 | 476 | 93% |
| 2024 | 513 | 513 | 100% |
| 2025 | 526 | 514 | 98% |
| 2026 | 513 | 511 | 100% |

So the 2024 to 2026 test is close to every decided fight. The survivorship worry in the first note applies mainly to earlier years. A test that reaches back to 2019 includes years where up to 37% of fights are missing, and the missing ones are exactly those between fighters who later left.

## Finding 2: a longer test (2019 to 2026) gives the same answer with tighter ranges
Test period starts 2019-01-01 (32 quarterly cutoffs; 2,432 decided fights, 1,900 scored, 78%). Not scored: 909 had a fighter not in the roster at the cutoff (no earlier fights, or inactive 36 months), 31 draws, 20 no-contests.

| Model | Fights | Accuracy | Brier | Log loss |
|---|---:|---:|---:|---:|
| Coin flip | 1,900 | 0.500 | 0.250 | 0.693 |
| BEFN overall rating | 1,900 | 0.614 | 0.231 | 0.654 |
| Career win rate | 1,900 | 0.617 | 0.234 | 0.660 |
| Recent form alone | 1,900 | 0.591 | 0.238 | 0.669 |

- Brier improvement over a coin flip: +0.0191, 95% interval +0.0131 to +0.0247 (2024 test: +0.0187, +0.0102 to +0.0271).
- Brier improvement over the career win rate: +0.0029, interval -0.0018 to +0.0078. It still includes zero, so the rating is **not clearly better than a plain win record**, as before.
- Calibration is closer than in the first test: 70%+ calls win 73.5% against 75.3% predicted (first test: 70.1% against 75.2%). The 0.5 to 0.6 band is the weakest (54.7% predicted, 52.1% observed).
- Accuracy by year, 2020 to 2026: 59.7%, 64.5%, 59.3%, 62.6%, 61.5%, 61.8%, 59.7%, each with a range of about ±5 to 8 points. There is no trend as archive coverage rises from 72% to 100%, so there is no sign that the thinner early years are distorting the result, though this cannot prove it.
- Pairs where either fighter has a provisional rating: 63.8% (378 fights), against 60.8% for two established ratings (1,522 fights). The provisional label is still not contradicted.

## What this means
- The claim stays what the owner decided (#432): **descriptive, never a forecast**. A larger sample did not change the conclusion; it narrowed it.
- The survivorship limit in the first note is mostly closed for 2024 on, and open for earlier years.
- Removing it for earlier years would need results and round-by-round statistics for fighters outside the archive. The free UFCStats export has the results for all of them; the round-by-round work for those fighters (and the ratings that depend on it) was not attempted here and is a separate piece of work.

## Not done
- A test starting before 2019: coverage is 53% in 2018 and 24% in 2014, so the sample would be mostly the fights the archive happens to hold. A run from 2014 failed in this session (the script was swapped by a branch switch mid-run) and was not repeated.
- Fights with a debut fighter (no earlier fights) cannot be rated and stay unscored.
- No opponent adjustment, no model other than one slope on the rating difference.

Reproduce: `python3 scripts/ufc-r4-calibration.py --first 2019-01-01 --out out.md` (add `--truth full` for the all-fighters variant, which gives the same fights).
