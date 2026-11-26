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
