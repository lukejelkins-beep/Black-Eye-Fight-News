# UFC gyms and winning, 2025

Research behind `analysis-ufc-gyms-2025.html`. Data: Sherdog event pages (results) and fighter pages (gym and fight history), used with Sherdog's permission (owner, 28 Nov 2026). The raw pulls are not kept in the repo; only the result table is.

Run in an empty scratch directory, in this order (each step reads the file the one before wrote):

1. `python collect_fights.py 2025` writes `fights_2025.json` (every 2025 UFC bout and result, 48 events).
2. `python collect_gyms.py` writes `gyms.json` (each fighter's Association list).
3. `python collect_histories.py` writes `hist.json` (each fighter's dated results, for the record going into each fight).
4. `python analyse.py` prints the tables and writes `gym_table.csv`.

## Method
- 544 decided bouts (4 draws and 3 no contests are left out).
- Expected result: the log-odds gap between the two fighters' smoothed win rates going into the fight, `(W+1)/(W+L+2)`, with one slope fitted on all 544 bouts. It picks the winner in 58.5% of bouts.
- A gym's expected wins are the sum of those probabilities over its bouts. The z score is (wins - expected) / sqrt(sum of p(1-p)).
- Fights between two fighters who share a gym are left out of that gym's record.
- A fighter who lists several gyms counts for each of them.
- Overall test: gym lists were shuffled across fighters 2,000 times and the average squared z score of the 15 gyms with 12+ bouts compared. The real value was 0.88 against 1.02 for shuffled labels; shuffled labels did as well or better in 60% of runs (p = 0.60).

## Limits
Gyms are where Sherdog lists a fighter now, not at the time of the fight. Expectation uses records, not betting odds. One season of one promotion.

## The "one year in five" line on the page
City Kickboxing's z score is 2.40, a two-sided chance of about 1.6% for one gym. With 15 gyms compared, the chance that at least one reaches that by luck is 1 - (1 - 0.0164)^15, about 22%. This treats the gyms as independent, which is close enough for a plain-language line.
