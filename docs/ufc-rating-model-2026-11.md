# BEFN rating model 2026-11: results + effectiveness skills (built, not on the site until "Merge N")

The owner chose, on 2026-11-23 (PR #453): blend results with skills in the headline, score the skill bars for effectiveness, and use a wider rating number. After reviewing the first build the owner also chose: title fights count more, a weaker inactivity drift (10% a year), and a 60/40 results/skills mix. This note says what was built and how well it works. The rating stays **descriptive**: prediction is only the objective test, never shown (owner decision #432).

## What the headline is now
`overall` in each `data/ufc-stats/fighters/<slug>.json` is the **BEFN rating**: 1500 is the median rated UFC fighter; Islam Makhachev is 2019. It combines:

1. **Results (60% of the spread, owner's choice; the fit gave 68%).** An Elo-type rating over every archived UFC bout (4,646, including fighters who have left), in date order. Each fight moves both fighters by how surprising the result was, so beating a strong opponent gains a lot and losing to a weak one costs a lot. A KO/TKO or submission counts 1.25 times a unanimous decision; a split or majority decision 0.5 times; a UFC title fight 1.5 times on top (owner's choice). The first fights move a rating more. After a year without a fight a rating drifts back toward 1500 by 10% a year (owner's choice; the fit gave 20%).
2. **Skills (40%).** The four skill percentiles with their existing relative weights (striking 25, defence 25, wrestling 20, grappling 15). Recent form is no longer in the headline (results already carry it) but stays on the profile.

The skill bars now score **effectiveness, not volume**:
- Wrestling: takedowns landed 20%, takedown accuracy 10%, **takedown defence 30%**, **control won minus control conceded 35%**, reversals 5%. (Was 83% takedowns, accuracy and control won; defence 12%.)
- Grappling: submission attempts 20%, submission wins 30%, **submission losses 20%**, **opponents' submission attempts 10%**, reversals 10%, net control 10%. (Was 80% attempts and wins.)
- Striking and defence are unchanged.

The title weight, drift and mix are the owner's; every other constant was fitted on fights **before 2024** only (`scripts/ufc-rating-fit.py --fix idle=0.1 --fix title=1.5 --mix 0.6`) and frozen in `scripts/ufc_ratings.py`; the test below is on 2024 onward. On the pre-2024 fit data the owner's choices cost almost nothing (log loss 0.6415 against 0.6399 fully fitted). Profiles show the number with "rating", a bar and colour from its percentile, a new **Results** percentile bar above the skills, and the line "UFC results weighted by opponent strength, plus measured skills. 1500 is the median rated UFC fighter." The stats page gains a Results rating board. 717 established and 203 provisional ratings, the same counts as before.

## How well it works (summary of `scripts/ufc-rating-evaluate.py`)
- **Rankings:** of the top 100, 86 are ranked fighters or champions (was 48); 9 of 11 champions are in the top 50 (was 2). Median position of a champion: 15th of 717 (was 143rd). Rank correlation with the official order inside each division: 0.70 (was 0.19).
- **Next-fight test, 926 fights from 2024:** accuracy 63.1% (previous rating 61.0%, career win rate 61.4%), Brier 0.2257 (previous 0.2313). Clearly better than the career win rate (interval +0.0053 to +0.0176); better than the previous rating, but the interval just includes zero (-0.0002 to +0.0113), so that part is likely, not proven. Calibration is within about two points in every band.
- **Owner's tweaks against the first build (fitted 70/30, 20% drift, no title weight):** no measurable difference in the test (Brier +0.0007, interval -0.0006 to +0.0020, 1,134 fights). 2026 moves from 58.3% to 60.5% (previous rating 59.9%).
- **Skill bars alone:** the effectiveness versions do slightly better than the old ones (62.7% against 60.3%; not clearly different on 926 fights). They mainly fix the description: a striker who stops takedowns is no longer bottom of wrestling.
- **By year:** 2024 64.0% (prev 61.6%), 2025 64.8% (61.6%), 2026 60.5% (59.9%).

## Limits
- The archive is thin before 2019, so a veteran's early UFC career is partly missing from their results.
- UFC fights only. A debut is 1500 whatever the fighter's record elsewhere.
- Kayla Harrison (champion) rises to the 95th percentile (#35) with the title weight; six UFC fights is still little evidence. Jon Jones is #11 after two years out with the 10% drift.
- Results-only rows (cards the free importer adds before the round archive has them) carry no title flag, so a very recent title fight counts as a normal fight until the archive catches up.
- Strickland is #70 (90th percentile; #54 under 70/30): with skills at 40% his low wrestling and defence count more. His wrestling is still 8th percentile: his takedown defence really is 44%. Effectiveness changed the formula, not the facts.
- The headline is centred on each build's median, so a fighter's number can move a few points when the roster changes, as percentiles did.
- The fit and the test share one archive; a de-biased test set (R4 open item) is still not done.

Reproduce: `python3 scripts/ufc-rating-fit.py --fix idle=0.1 --fix title=1.5 --mix 0.6` (about 1 min) and `python3 scripts/ufc-rating-evaluate.py` (about 2 min).

---

## Full evaluation output: BEFN rating model 2026-11: effectiveness test

Research output, offline. Reproduce: `python3 scripts/ufc-rating-evaluate.py` (about 3 minutes).

Previous engine read from `origin/main`. Test fights: every decided UFC bout from 2024-01-01 to 2026-11-21 where both fighters had a rating under both engines, scored walk-forward (926 fights).

## 1. Predicting the next fight (the objective test)

| Model | Fights | Accuracy | Brier (lower is better) | Log loss |
|---|---:|---:|---:|---:|
| Coin flip | 926 | 50.0% | 0.2500 | 0.6931 |
| Career win rate | 926 | 61.4% | 0.2373 | 0.6675 |
| Previous BEFN rating (skills + form, 0-100) | 926 | 61.0% | 0.2313 | 0.6549 |
| Previous skill scores only | 926 | 60.3% | 0.2324 | 0.6573 |
| New effectiveness skill scores only | 926 | 62.7% | 0.2308 | 0.6538 |
| **New BEFN rating (results + skills)** | 926 | 63.1% | 0.2257 | 0.6426 |

- New rating vs previous rating: Brier improvement +0.0056 (95% interval -0.0002 to +0.0113), not clearly different.
- New rating vs career win rate: Brier improvement +0.0116 (95% interval +0.0053 to +0.0176), clearly better.
- New skill scores vs previous skill scores: Brier improvement +0.0016 (95% interval -0.0017 to +0.0050), not clearly different.

Calibration of the new rating (each fight counted from both sides):

| Predicted | Fighter-fights | Mean predicted | Won |
|---|---:|---:|---:|
| 0.0 to 0.3 | 192 | 0.240 | 0.234 |
| 0.3 to 0.4 | 321 | 0.353 | 0.333 |
| 0.4 to 0.5 | 409 | 0.450 | 0.460 |
| 0.5 to 0.6 | 417 | 0.549 | 0.540 |
| 0.6 to 0.7 | 321 | 0.647 | 0.667 |
| 0.7 to 1.0 | 192 | 0.760 | 0.766 |

By year (accuracy, new / previous): 2024 64.0% / 61.6% (258), 2025 64.8% / 61.6% (344), 2026 60.5% / 59.9% (324)

## 2. Agreement with the official UFC rankings (as of 2026-11-21)

| Check | Previous | New |
|---|---:|---:|
| Ranked fighters or champions in the top 50 | 28 | 47 |
| Ranked fighters or champions in the top 100 | 48 | 86 |
| Champions in the top 50 (of 11) | 2 | 9 |
| Median position of a champion among 717 rated fighters | 143 | 15 |
| Rank correlation with official order inside each division (mean of 11) | 0.19 | 0.70 |

The official rankings are a panel's opinion, not ground truth; this shows whether the number now looks like a fighter's standing, which was the owner's complaint.

## 3. Examples

| Fighter | Status | Previous (0-100) | New rating | New percentile | Results part | Previous wrestling / grappling | New wrestling / grappling | Position (previous to new) |
|---|---|---:|---:|---:|---:|---|---|---|
| Sean Strickland | Champion | 40 | 1697 | 90 | 1811 (97th) | 1 / 2 | 8 / 41 | 499 to 70 |
| Khamzat Chimaev | #1 | 72 | 1811 | 99 | 1865 (99th) | 99 / 87 | 99 / 91 | 70 to 9 |
| Anthony Hernandez | #8 | 55 | 1657 | 85 | 1718 (89th) | 95 / 91 | 96 / 95 | 281 to 107 |
| Dricus Du Plessis | #2 | 63 | 1788 | 98 | 1881 (99th) | 51 / 76 | 30 / 82 | 168 to 14 |
| Carlos Ulberg | Champion | 61 | 1785 | 98 | 1851 (98th) | 1 / 47 | 29 / 73 | 201 to 16 |
| Alex Pereira | #3 | 53 | 1780 | 97 | 1835 (98th) | 12 / 3 | 61 / 36 | 312 to 20 |
| Magomed Ankalaev | #1 | 65 | 1793 | 98 | 1838 (98th) | 35 / 43 | 62 / 71 | 136 to 13 |
| Ciryl Gane | Champion | 65 | 1818 | 99 | 1878 (99th) | 15 / 29 | 57 / 34 | 143 to 7 |
| Islam Makhachev | Champion | 84 | 2019 | 99 | 2094 (99th) | 97 / 94 | 98 / 97 | 13 to 1 |
| Ilia Topuria | #1 | 78 | 1856 | 99 | 1883 (99th) | 78 / 55 | 90 / 72 | 35 to 3 |
| Arman Tsarukyan | #2 | 92 | 1814 | 99 | 1811 (97th) | 92 / 84 | 94 / 85 | 4 to 8 |
| Justin Gaethje | Champion | 47 | 1786 | 98 | 1899 (99th) | 34 / 8 | 63 / 28 | 396 to 15 |
| Alexander Volkanovski | Champion | 63 | 1845 | 99 | 1918 (99th) | 42 / 13 | 51 / 58 | 173 to 5 |
| Merab Dvalishvili | #1 | 62 | 1768 | 96 | 1831 (98th) | 90 / 74 | 93 / 83 | 181 to 27 |
| Petr Yan | Champion | 67 | 1856 | 99 | 1925 (99th) | 70 / 11 | 86 / 45 | 113 to 2 |
| Joshua Van | Champion | 65 | 1822 | 99 | 1904 (99th) | 71 / 12 | 59 / 54 | 137 to 6 |
| Kayla Harrison | Champion | 79 | 1751 | 95 | 1779 (94th) | 88 / 95 | 88 / 96 | 28 to 35 |
| Valentina Shevchenko | #1 | 72 | 1852 | 99 | 1924 (99th) | 92 / 37 | 93 / 34 | 65 to 4 |
| Jon Jones | unranked | 76 | 1799 | 99 | 1846 (98th) | 60 / 76 | 66 / 77 | 48 to 11 |
| Quillan Salkilld | #7 | 95 | 1806 | 99 | 1796 (96th) | 96 / 98 | 93 / 95 | 1 to 10 |
| Jacobe Smith | unranked | 92 | 1746 | 95 | 1721 (90th) | 99 / 78 | 99 / 87 | 3 to 36 |

Top 20 by the new rating (717 rated fighters):

| # | Fighter | Division | Status | New rating | Previous |
|---:|---|---|---|---:|---:|
| 1 | Islam Makhachev | Welterweight | Champion | 2019 | 84 |
| 2 | Petr Yan | Bantamweight | Champion | 1856 | 67 |
| 3 | Ilia Topuria | Lightweight | #1 | 1856 | 78 |
| 4 | Valentina Shevchenko | Women's Flyweight | #1 | 1852 | 72 |
| 5 | Alexander Volkanovski | Featherweight | Champion | 1845 | 63 |
| 6 | Joshua Van | Flyweight | Champion | 1822 | 65 |
| 7 | Ciryl Gane | Heavyweight | Champion | 1818 | 65 |
| 8 | Arman Tsarukyan | Lightweight | #2 | 1814 | 92 |
| 9 | Khamzat Chimaev | Middleweight | #1 | 1811 | 72 |
| 10 | Quillan Salkilld | Lightweight | #7 | 1806 | 95 |
| 11 | Jon Jones | Heavyweight | unranked | 1799 | 76 |
| 12 | Michael Morales | Welterweight | #3 | 1795 | 72 |
| 13 | Magomed Ankalaev | Light Heavyweight | #1 | 1793 | 65 |
| 14 | Dricus Du Plessis | Middleweight | #2 | 1788 | 63 |
| 15 | Justin Gaethje | Lightweight | Champion | 1786 | 47 |
| 16 | Carlos Ulberg | Light Heavyweight | Champion | 1785 | 61 |
| 17 | Natalia Silva | Women's Flyweight | Champion | 1784 | 71 |
| 18 | Mike Malott | Welterweight | #9 | 1783 | 86 |
| 19 | Carlos Prates | Welterweight | #2 | 1780 | 55 |
| 20 | Alex Pereira | Light Heavyweight | #3 | 1780 | 53 |

Biggest moves by percentile (previous headline percentile to new):

- Shayilan Nuerdanbieke (Featherweight, unranked): -46 points; record 3-3, results 1453, skills composite 61.8
- Malcolm Gordon (Flyweight, unranked): -45 points; record 2-5, results 1386, skills composite 47.3
- Makhmud Muradov (Middleweight, unranked): -42 points; record 1-2, results 1472, skills composite 64.6
- Louie Sutherland (Heavyweight, unranked): -42 points; record 1-3, results 1411, skills composite 52.1
- Garrett Armfield (Bantamweight, unranked): -41 points; record 2-3, results 1459, skills composite 56.4
- Felipe Franco (Light Heavyweight, unranked): -40 points; record 1-2, results 1451, skills composite 65.9
- Molly McCann (Women's Strawweight, unranked): -40 points; record 3-5, results 1420, skills composite 42.4
- Denys Bondar (Flyweight, unranked): -39 points; record 0-3, results 1361, skills composite 49.7
- Israel Adesanya (Middleweight, #9): +46 points; record 13-6, results 1654, skills composite 47.6
- Dustin Poirier (Lightweight, unranked): +47 points; record 22-9, results 1718, skills composite 32.8
- Max Holloway (Lightweight, #4): +48 points; record 24-9, results 1820, skills composite 50.1
- Jiri Prochazka (Light Heavyweight, #2): +49 points; record 6-4, results 1659, skills composite 46.9
- Belal Muhammad (Welterweight, #7): +51 points; record 15-6, results 1743, skills composite 57.8
- Justin Gaethje (Lightweight, Champion): +53 points; record 11-5, results 1899, skills composite 50.9
- Jack Della Maddalena (Welterweight, #4): +59 points; record 8-2, results 1769, skills composite 39.0
- Sean Strickland (Middleweight, Champion): +60 points; record 18-7, results 1811, skills composite 43.2
