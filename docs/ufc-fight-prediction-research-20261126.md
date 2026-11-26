# UFC fight prediction research, 26 Nov 2026 (research only, nothing on the site)

Owner: "build an area of analysis that has upcoming fights on a card and uses statistical data and machine learning to analyse the fight and predict an outcome", after reading mmamodel.ai/methodology. Decision #432 (prediction never shown) was reversed behind a gate: ship only a model that beats the current rating's walk-forward Brier with a 95% interval that excludes zero.

**Result: no model beat the rating, so the gate is not met by any machine-learning model.** `python3 scripts/ufc-prediction-research.py` (needs `python3 scripts/ufc-rating-variants.py run title_no_drift` first, and `pip install lightgbm`), 1,135 decided UFC bouts from 2024-01-01, quarterly walk-forward (a model for a quarter is fitted only on earlier bouts; each bout scored as the average of both corner orderings):

| Model | Accuracy | Brier | Log loss | Calibration error | Brier gain vs rating (95% interval) |
|---|---:|---:|---:|---:|---|
| **BEFN rating, calibrated (production)** | 65.0% | **0.2211** | 0.6333 | 0.018 | |
| Results Elo difference only | 59.9% | 0.2346 | 0.6616 | 0.019 | -0.0134 (-0.0185 to -0.0083) |
| Elo + age + height | 64.2% | 0.2236 | 0.6385 | 0.043 | -0.0025 (-0.0063 to +0.0014) |
| Logistic regression, 35 features | 66.1% | 0.2216 | 0.6344 | 0.056 | -0.0005 (-0.0053 to +0.0044) |
| ... with calibration slope | 66.1% | 0.2197 | 0.6305 | 0.030 | +0.0014 (-0.0035 to +0.0064) |
| LightGBM, 35 features | 64.3% | 0.2237 | 0.6388 | 0.027 | -0.0026 (-0.0079 to +0.0028) |
| LightGBM, no round-statistic features | 63.1% | 0.2282 | 0.6482 | 0.034 | -0.0070 (-0.0121 to -0.0019) |
| Logistic + LightGBM average | 64.6% | 0.2220 | 0.6353 | 0.036 | -0.0009 (-0.0059 to +0.0041) |
| ... calibrated | 64.6% | 0.2216 | 0.6344 | 0.022 | -0.0004 (-0.0055 to +0.0045) |

Features (all from fights before the bout, 18-month half-life, shrunk toward the population by exposure): results Elo going in, striking, takedown, submission and control rates with their defensive sides, damage ratio, standing share, win / KO / submission / decision shares, finish, round-1 finish and late-round finish rates, title experience, layoff, age, height, title fight, sex. L2 strength chosen on the 2021-2023 walk-forward only (the strongest tested, 300: the extra features add little). Calibration slope fitted on earlier quarters' predictions only.

What it says:
- The rating already holds most of the signal. 35 features and a gradient-boosted model add nothing measurable on 1,135 bouts; the best gain is +0.0014 with an interval from -0.0035 to +0.0064. The untuned logistic's early +0.0035 (Brier 0.2176) disappeared once its regularisation was chosen without looking at the test years.
- LightGBM is no better than logistic regression, as expected on about 2,300 usable bouts.
- Round statistics help (LightGBM 0.2282 without them, 0.2237 with), but they are already inside the rating's skills half.
- The rating's probability is well calibrated (calibration error 0.018, within about 2 points in every band).
- mmamodel.ai reports 67.6% accuracy and log loss 0.598 on an unstated test set and reportedly with odds movements in its training data. Not comparable: ours is 65.0% and 0.633 without any odds.

What was not tried: market odds (no licensed UFC source here), method and round prediction, short-notice and weight-cut information, Elo variants beyond the rating's own, a larger archive (the usable bout table starts with the 2013 archive and both fighters must be on the current roster).

## Part 2: finish and method (`python3 scripts/ufc-method-research.py`), same walk-forward, 1,255 bouts from 2024

Unlike the winner, these clear their baselines.

**Does it end in a finish (KO/TKO or submission)?** Finish rate in the test bouts 48.8%.

| Model | Accuracy | Brier | Log loss | Brier gain vs division finish rate (95% interval) |
|---|---:|---:|---:|---|
| All-time finish rate | 47.8% | 0.2506 | 0.6944 | -0.0074 (-0.0116 to -0.0033) |
| Division finish rate | 56.1% | 0.2432 | 0.6795 | |
| **Logistic on pairing features** | 59.4% | **0.2378** | 0.6681 | **+0.0055 (+0.0010 to +0.0101)** |
| LightGBM | 57.3% | 0.2413 | 0.6756 | +0.0019 (-0.0043 to +0.0077) |

**How does the winner win, given who wins?** KO/TKO 32.0%, submission 16.9%, decision 51.2%.

| Model | Top-method accuracy | Log loss | Gain vs division rates (95% interval) |
|---|---:|---:|---|
| All-time method rates | 51.2% | 1.0104 | -0.0240 (-0.0337 to -0.0145) |
| Division method rates | 52.7% | 0.9864 | |
| **Multinomial: winner's offence against the loser's defence** | 52.5% | **0.9390** | **+0.0474 (+0.0287 to +0.0669)** |

Both gains exclude zero. The finish gain is modest (about 3 points of accuracy over the division rate); the method model's gain is in the probabilities, not the top pick (decision is the commonest outcome). The two parts are scored separately: method uses the true winner. On a card the method split is the winner probability times the method given that winner. LightGBM is again no better than logistic regression.

## Market odds (not tested: no data, and no call was made)
- No odds data is in the repository (the "Polymarket" hits are the UFC 334 title sponsor).
- UFCalendar, the provider BEFN already collects from, sells a UFC Odds API: consensus moneyline, opening and closing lines, de-vigged fair probability, and props (KO/TKO, submission, decision, total rounds, distance). Its consensus archive starts in 2012 (11,347 completed fights with a closing line across all promotions; closing props from 2021). Plans: Free 100 requests a month, Hobby $19 (30,000), Pro $49 (200,000, adds line-movement history). BEFN's own cap is the whole free 100 (`docs/ufcalendar-budget.md`), and its terms forbid redistributing a substantial raw dataset. Its page does not state public display terms.
- Other sources: The Odds API (historical MMA from June 2020, paid), SportsDataIO (paid), OpticOdds, and a one-off dataset of 4,249 UFC fights from 2018 sold on Whop. Polymarket publishes free public prices through its Gamma API for current UFC markets, but only live ones, not a history to train on.
- Needs an owner decision: a paid plan or a different budget split, a read of the provider's terms for showing market probabilities, and AGENTS.md's rule of one paid UFCalendar collector. Market odds would most likely lift the winner model (mmamodel.ai trains on them) and give a "market says" comparison, but that is untested here.
