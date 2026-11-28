# UFC gyms and winning, 2025 and 2026

Research behind `analysis-ufc-gyms.html`. Data: Sherdog event pages (results) and fighter pages (gym and fight history), used with Sherdog's permission (owner, 28 Nov 2026). The raw pulls are not kept in the repo; only the result tables (`gym_table_*.csv`) are.

Run in an empty scratch directory, in this order:

1. `python collect_fights.py 2025` and `python collect_fights.py 2026` write `fights_2025.json` and `fights_2026.json` (every UFC bout and result; 2026 runs to 21 Nov).
2. `python collect_fighters.py fights_2025.json fights_2026.json` writes `gyms.json` (each fighter's Association list) and `hist.json` (each fighter's dated results, for the record going into each fight).
3. `python analyse.py fights_2025.json`, `python analyse.py fights_2026.json` and `python analyse.py fights_2025.json fights_2026.json` print the tables and write `gym_table_<years>.csv`.
4. `python make_summary.py` builds `data/ufc-gym-analysis.json`, which `scripts/build-ufc-gym-article.py` turns into the page.

## Method
- 1,084 decided bouts (544 in 2025, 540 in 2026 to 21 Nov); draws and no contests are left out.
- Expected result: the log-odds gap between the two fighters' smoothed win rates going into the fight, `(W+1)/(W+L+2)`, with one slope fitted on all bouts in the run. It picks the winner in 59.6% of the pooled bouts.
- A gym's expected wins are the sum of those probabilities over its bouts. The z score is (wins - expected) / sqrt(sum of p(1-p)).
- Fights between two fighters who share a gym are left out of that gym's record.
- A fighter who lists several gyms counts for each of them.
- Overall test: gym lists were shuffled across fighters 2,000 times and the average squared z score of the 33 gyms with 12+ bouts compared. Pooled: 1.36 observed against 1.05 for shuffled labels; shuffled labels did as well or better in 14% of runs (p = 0.14). 2025 alone: p = 0.60. 2026 alone: p = 0.68.
- Each season in the per-season columns is analysed on its own (its own fitted slope), so the two seasons add up to the pooled figure to within a few tenths of a win.

## The "once in 14" line on the page
City Kickboxing's pooled z score is 3.07, a two-sided chance of about 0.2% for one gym. With 33 gyms compared, the chance that at least one reaches that by luck is 1 - (1 - 0.0021)^33, about 7%, or once in 14. This treats the gyms as independent, which is close enough for a plain-language line.

## Limits
Gyms are where Sherdog lists a fighter now, not at the time of the fight, and fighters who win may move to better-known gyms. Expectation uses records, not betting odds. Two seasons of one promotion.
