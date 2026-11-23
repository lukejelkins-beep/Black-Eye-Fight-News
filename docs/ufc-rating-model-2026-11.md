# BEFN rating model 2026-11: results + effectiveness skills (built, not on the site until "Merge N")

The owner chose, on 2026-11-23 (PR #453): blend results with skills in the headline, score the skill bars for effectiveness, and use a wider rating number. This note says what was built and how well it works. The rating stays **descriptive**: prediction is only the objective test, never shown (owner decision #432).

## What the headline is now
`overall` in each `data/ufc-stats/fighters/<slug>.json` is the **BEFN rating**: 1500 is the median rated UFC fighter; Islam Makhachev is 2013, the lowest rated fighter about 1180. It combines:

1. **Results (about 70% of the spread).** An Elo-type rating over every archived UFC bout (4,646, including fighters who have left), in date order. Each fight moves both fighters by how surprising the result was, so beating a strong opponent gains a lot and losing to a weak one costs a lot. A KO/TKO or submission counts 1.25 times a unanimous decision; a split or majority decision 0.5 times. The first fights move a rating more. After a year without a fight a rating drifts back toward 1500 by 20% a year.
2. **Skills (about 30%).** The four skill percentiles with their existing relative weights (striking 25, defence 25, wrestling 20, grappling 15). Recent form is no longer in the headline (results already carry it) but stays on the profile.

The skill bars now score **effectiveness, not volume**:
- Wrestling: takedowns landed 20%, takedown accuracy 10%, **takedown defence 30%**, **control won minus control conceded 35%**, reversals 5%. (Was 83% takedowns, accuracy and control won; defence 12%.)
- Grappling: submission attempts 20%, submission wins 30%, **submission losses 20%**, **opponents' submission attempts 10%**, reversals 10%, net control 10%. (Was 80% attempts and wins.)
- Striking and defence are unchanged.

Every constant was chosen on fights **before 2024** only (`scripts/ufc-rating-fit.py`) and frozen in `scripts/ufc_ratings.py`; the test below is on 2024 onward. Profiles show the number with "rating", a bar and colour from its percentile, a new **Results** percentile bar above the skills, and the line "UFC results weighted by opponent strength, plus measured skills. 1500 is the median rated UFC fighter." The stats page gains a Results rating board. 717 established and 203 provisional ratings, the same counts as before.

## How well it works (summary of `scripts/ufc-rating-evaluate.py`)
- **Rankings:** of the top 100, 86 are ranked fighters or champions (was 48). Median position of a champion: 16th of 717 (was 143rd). Rank correlation with the official order inside each division: 0.71 (was 0.19).
- **Next-fight test, 926 fights from 2024:** accuracy 63.2% (previous rating 61.0%, career win rate 61.4%), Brier 0.2260 (previous 0.2313). Better than the career win rate with a clear margin (interval +0.0050 to +0.0173); better than the previous rating, but the interval just includes zero (-0.0012 to +0.0117), so that part is likely, not proven. Calibration is within about two points in every band.
- **Skill bars alone:** the effectiveness versions do slightly better than the old ones (62.7% against 60.3%; not clearly different on 926 fights). They mainly fix the description: a striker who stops takedowns is no longer bottom of wrestling.
- **By year:** 2024 64.3% (prev 61.6%), 2025 66.9% (61.6%), 2026 58.3% (59.9%). 2026 is slightly worse; it is one year of 324 fights and inside the noise, but worth watching.

## Limits
- The archive is thin before 2019, so a veteran's early UFC career is partly missing from their results.
- UFC fights only. A debut is 1500 whatever the fighter's record elsewhere.
- Kayla Harrison (champion) is 89th percentile: six UFC fights is not much evidence for a results rating. Jon Jones is 87th after two years out.
- Strickland's wrestling is still 8th percentile: his takedown defence really is 44%. Effectiveness changed the formula, not the facts.
- The headline is centred on each build's median, so a fighter's number can move a few points when the roster changes, as percentiles did.
- The fit and the test share one archive; a de-biased test set (R4 open item) is still not done.

Reproduce: `python3 scripts/ufc-rating-fit.py` (about 1 min) and `python3 scripts/ufc-rating-evaluate.py` (about 2 min).

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
| **New BEFN rating (results + skills)** | 926 | 63.2% | 0.2260 | 0.6432 |

- New rating vs previous rating: Brier improvement +0.0052 (95% interval -0.0012 to +0.0117), not clearly different.
- New rating vs career win rate: Brier improvement +0.0112 (95% interval +0.0050 to +0.0173), clearly better.
- New skill scores vs previous skill scores: Brier improvement +0.0016 (95% interval -0.0017 to +0.0050), not clearly different.

Calibration of the new rating (each fight counted from both sides):

| Predicted | Fighter-fights | Mean predicted | Won |
|---|---:|---:|---:|
| 0.0 to 0.3 | 197 | 0.240 | 0.259 |
| 0.3 to 0.4 | 307 | 0.351 | 0.332 |
| 0.4 to 0.5 | 414 | 0.451 | 0.440 |
| 0.5 to 0.6 | 430 | 0.548 | 0.558 |
| 0.6 to 0.7 | 307 | 0.649 | 0.668 |
| 0.7 to 1.0 | 197 | 0.760 | 0.741 |

By year (accuracy, new / previous): 2024 64.3% / 61.6% (258), 2025 66.9% / 61.6% (344), 2026 58.3% / 59.9% (324)

## 2. Agreement with the official UFC rankings (as of 2026-11-21)

| Check | Previous | New |
|---|---:|---:|
| Ranked fighters or champions in the top 50 | 28 | 48 |
| Ranked fighters or champions in the top 100 | 48 | 86 |
| Champions in the top 50 (of 11) | 2 | 8 |
| Median position of a champion among 717 rated fighters | 143 | 16 |
| Rank correlation with official order inside each division (mean of 11) | 0.19 | 0.71 |

The official rankings are a panel's opinion, not ground truth; this shows whether the number now looks like a fighter's standing, which was the owner's complaint.

## 3. Examples

| Fighter | Status | Previous (0-100) | New rating | New percentile | Results part | Previous wrestling / grappling | New wrestling / grappling | Position (previous to new) |
|---|---|---:|---:|---:|---:|---|---|---|
| Sean Strickland | Champion | 40 | 1726 | 92 | 1789 (96th) | 1 / 2 | 8 / 41 | 499 to 54 |
| Khamzat Chimaev | #1 | 72 | 1837 | 99 | 1847 (99th) | 99 / 87 | 99 / 91 | 70 to 6 |
| Anthony Hernandez | #8 | 55 | 1681 | 87 | 1716 (89th) | 95 / 91 | 96 / 95 | 281 to 93 |
| Dricus Du Plessis | #2 | 63 | 1822 | 99 | 1861 (99th) | 51 / 76 | 30 / 82 | 168 to 9 |
| Carlos Ulberg | Champion | 61 | 1809 | 98 | 1830 (98th) | 1 / 47 | 29 / 73 | 201 to 15 |
| Alex Pereira | #3 | 53 | 1795 | 97 | 1810 (97th) | 12 / 3 | 61 / 36 | 312 to 21 |
| Magomed Ankalaev | #1 | 65 | 1821 | 99 | 1828 (98th) | 35 / 43 | 62 / 71 | 136 to 11 |
| Ciryl Gane | Champion | 65 | 1806 | 98 | 1818 (98th) | 15 / 29 | 57 / 34 | 143 to 16 |
| Islam Makhachev | Champion | 84 | 2013 | 99 | 2008 (99th) | 97 / 94 | 98 / 97 | 13 to 1 |
| Ilia Topuria | #1 | 78 | 1868 | 99 | 1855 (99th) | 78 / 55 | 90 / 72 | 35 to 2 |
| Arman Tsarukyan | #2 | 92 | 1821 | 99 | 1795 (97th) | 92 / 84 | 94 / 85 | 4 to 12 |
| Justin Gaethje | Champion | 47 | 1786 | 96 | 1837 (98th) | 34 / 8 | 63 / 28 | 396 to 26 |
| Alexander Volkanovski | Champion | 63 | 1853 | 99 | 1870 (99th) | 42 / 13 | 51 / 58 | 173 to 4 |
| Merab Dvalishvili | #1 | 62 | 1793 | 97 | 1815 (98th) | 90 / 74 | 93 / 83 | 181 to 23 |
| Petr Yan | Champion | 67 | 1863 | 99 | 1876 (99th) | 70 / 11 | 86 / 45 | 113 to 3 |
| Joshua Van | Champion | 65 | 1817 | 98 | 1843 (99th) | 71 / 12 | 59 / 54 | 137 to 13 |
| Kayla Harrison | Champion | 79 | 1704 | 89 | 1704 (88th) | 88 / 95 | 88 / 96 | 28 to 77 |
| Valentina Shevchenko | #1 | 72 | 1837 | 99 | 1852 (99th) | 92 / 37 | 93 / 34 | 65 to 5 |
| Jon Jones | unranked | 76 | 1687 | 87 | 1691 (86th) | 60 / 76 | 66 / 77 | 48 to 91 |
| Quillan Salkilld | #7 | 95 | 1821 | 99 | 1791 (96th) | 96 / 98 | 93 / 95 | 1 to 10 |
| Jacobe Smith | unranked | 92 | 1752 | 94 | 1721 (90th) | 99 / 78 | 99 / 87 | 3 to 41 |

Top 20 by the new rating (717 rated fighters):

| # | Fighter | Division | Status | New rating | Previous |
|---:|---|---|---|---:|---:|
| 1 | Islam Makhachev | Welterweight | Champion | 2013 | 84 |
| 2 | Ilia Topuria | Lightweight | #1 | 1868 | 78 |
| 3 | Petr Yan | Bantamweight | Champion | 1863 | 67 |
| 4 | Alexander Volkanovski | Featherweight | Champion | 1853 | 63 |
| 5 | Valentina Shevchenko | Women's Flyweight | #1 | 1837 | 72 |
| 6 | Khamzat Chimaev | Middleweight | #1 | 1837 | 72 |
| 7 | Charles Oliveira | Lightweight | #3 | 1832 | 63 |
| 8 | Michael Morales | Welterweight | #3 | 1826 | 72 |
| 9 | Dricus Du Plessis | Middleweight | #2 | 1822 | 63 |
| 10 | Quillan Salkilld | Lightweight | #7 | 1821 | 95 |
| 11 | Magomed Ankalaev | Light Heavyweight | #1 | 1821 | 65 |
| 12 | Arman Tsarukyan | Lightweight | #2 | 1821 | 92 |
| 13 | Joshua Van | Flyweight | Champion | 1817 | 65 |
| 14 | Carlos Prates | Welterweight | #2 | 1814 | 55 |
| 15 | Carlos Ulberg | Light Heavyweight | Champion | 1809 | 61 |
| 16 | Ciryl Gane | Heavyweight | Champion | 1806 | 65 |
| 17 | Natalia Silva | Women's Flyweight | Champion | 1804 | 71 |
| 18 | Nassourdine Imavov | Middleweight | #3 | 1803 | 70 |
| 19 | Mike Malott | Welterweight | #9 | 1798 | 86 |
| 20 | Sean Brady | Welterweight | #6 | 1795 | 82 |

Biggest moves by percentile (previous headline percentile to new):

- Shayilan Nuerdanbieke (Featherweight, unranked): -48 points; record 3-3, results 1461, skills composite 61.8
- Felipe Franco (Light Heavyweight, unranked): -46 points; record 1-2, results 1451, skills composite 65.9
- Louie Sutherland (Heavyweight, unranked): -46 points; record 1-3, results 1411, skills composite 52.1
- Malcolm Gordon (Flyweight, unranked): -45 points; record 2-5, results 1408, skills composite 47.3
- Makhmud Muradov (Middleweight, unranked): -44 points; record 1-2, results 1479, skills composite 64.6
- Thomas Petersen (Heavyweight, unranked): -42 points; record 4-4, results 1501, skills composite 73.8
- Garrett Armfield (Bantamweight, unranked): -42 points; record 2-3, results 1469, skills composite 56.4
- Molly McCann (Women's Strawweight, unranked): -42 points; record 3-5, results 1427, skills composite 42.4
- Israel Adesanya (Middleweight, #9): +50 points; record 13-6, results 1658, skills composite 47.6
- Justin Gaethje (Lightweight, Champion): +51 points; record 11-5, results 1837, skills composite 50.9
- Max Holloway (Lightweight, #4): +51 points; record 24-9, results 1833, skills composite 50.1
- Belal Muhammad (Welterweight, #7): +51 points; record 15-6, results 1733, skills composite 57.8
- Dustin Poirier (Lightweight, unranked): +53 points; record 22-9, results 1715, skills composite 32.8
- Jiri Prochazka (Light Heavyweight, #2): +54 points; record 6-4, results 1672, skills composite 46.9
- Jack Della Maddalena (Welterweight, #4): +61 points; record 8-2, results 1743, skills composite 39.0
- Sean Strickland (Middleweight, Champion): +62 points; record 18-7, results 1789, skills composite 43.2
