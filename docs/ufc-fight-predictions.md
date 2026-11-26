# UFC fight predictions (26 Nov 2026)

What the site shows: for each bout on an announced UFC card, a **model estimate** of who wins, whether the fight ends in a finish, and how (KO/TKO, submission, decision). It lives on the Fight predictions page (`#predictions`, linked from MMA Analysis) with a one-line reference on the fight card. It is not betting advice, and the BEFN rating itself stays descriptive (`docs/design/DECISIONS.md`).

## The three parts
| Part | Model | Measured against | Result (walk-forward, from 2024) |
|---|---|---|---|
| Winner | `logistic(k_pool x BEFN rating difference)`; k fitted per pool | coin flip | men 64.5% of 1,039, Brier 0.2242; women 68.3% of 145, Brier 0.2087 (small sample) |
| Finish or distance | logistic regression on 23 pairing features (point-in-time, 18-month half-life, exposure-shrunk rates), L2 chosen on 2021-2023 | the division's finish rate | Brier gain men +0.0037 (range -0.0015 to +0.0089: not clear), women +0.0144 (+0.0059 to +0.0227) |
| Method given the winner | multinomial on the winner's offence against the loser's defence | the division's method rates | log-loss gain men +0.043 (+0.023 to +0.064), women +0.069 (+0.026 to +0.115) |

Why the winner is the rating and not a machine-learning model: logistic regression and LightGBM on 35 point-in-time features did not beat the calibrated rating (`docs/ufc-fight-prediction-research-20261126.md`). Models fitted inside one pool did worse than the joint model for finish and method (women have too few bouts), so those two keep a women flag and are only *reported* per pool.

## Women and men
They are separate rating pools, so each has its own slope `k` and its own track record, and a bout is only estimated when both fighters are in the same pool.

## Putting the parts together
The finish and method models are scored separately, so their product does not add up to the finish probability. The page shows the finish model's probability for "ends in a finish" and rescales the six (who, how) outcomes to it: finish cells x F/R, decision cells x (1-F)/(1-R), where R is the raw finish total. Winner probabilities are not changed by the model parts.

## Confidence and gaps
- `low` confidence when a fighter has under 3 UFC fights, a provisional rating or no birth date.
- No estimate when a fighter has no UFC record here yet, or the two are in different pools.
- Market odds are not used. UFCalendar sells a UFC odds API (closing and opening lines, props, history from 2012); using it needs a paid plan, because BEFN's free 100 requests a month are already allocated (`docs/ufcalendar-budget.md`), and a check of the provider's terms for showing market probabilities.

## Live record (prediction history)
`scripts/update-ufc-prediction-log.py` runs hourly in the stats workflow after the generator. It writes each predicted bout on a not-yet-held card once, frozen, to `data/ufc-prediction-log.json` (never changed or removed, and only for cards dated after today), then scores an entry when `data/results.json` has the same event and the same two fighters: winner (as an index into the logged fighters) and how it ended. Draws and no contests are kept but not scored. The Predictions page shows the record per pool ("N of M winners picked", finish call, latest 20 results) and says "too few fights to judge yet" under 30 fights. The log started 26 Nov 2026, with the 17 bouts on the four announced cards.

## Files and how to refresh
- `scripts/ufc-prediction-calibrate.py` (slow, by hand when the rating engine or fight data change materially) writes `data/ufc-prediction-model.json`: slopes, track record, reliability tables, finish and method gains. Refresh the rating rows with `python3 scripts/ufc-rating-variants.py run current` first, or let it run them.
- `scripts/build-ufc-fight-predictions.py` (fast, in the stats workflow after the Form build) writes `data/ufc-fight-predictions.json` for the announced cards.
- `assets/fight-predictions.js` draws the page and fills the `.fp-ref` placeholder that `assets/upcoming-cards.js` leaves on each UFC bout.
- `data/ufc-prediction-log.json`: the live record (see above).
- Tests: `tests/test_ufc_fight_predictions.py`, `tests/test-fight-predictions.cjs`.
- A bug found while building (so keep the note): the finish model uses each fighter's results rating as a feature. Feeding it zeros instead of the real rating moved Adesanya vs Magomedov from 42% to 58% finish. The generator passes the fighters' real results ratings.
