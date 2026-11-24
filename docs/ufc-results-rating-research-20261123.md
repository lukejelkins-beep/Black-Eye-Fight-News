# Why champions score low on the BEFN rating, and a results-based fix (research, 23 November 2026)

**Research only. Nothing here changes a rating or the site.** The owner asked why champions rate low (Sean Strickland 40, Carlos Ulberg 61, Ciryl Gane 65) and whether a data-driven rating could better show how strong a fighter actually is. Reproduce: `python3 scripts/ufc-results-rating-research.py` (offline, about 45 seconds).

## Why the live rating does this
The headline (`overall()` in `scripts/ufc_ratings.py`) is 85% four skill percentiles and 15% recent form. The skill scores measure **how much of something a fighter does**, not how well it works against good opponents:

- **Wrestling** is mostly takedowns landed per 15 min, takedown accuracy and control time (83% of its weight). Takedown defence is 12%. Sean Strickland lands 0.16 takedowns per 15 min, so he is in the 1st percentile, although he has just beaten Khamzat Chimaev, the strongest wrestler in the division. Ulberg is 1st, Alex Pereira 12th.
- **Grappling** is 80% submission attempts and submission wins. A striker who never goes for a submission scores near zero, however well they avoid being submitted.
- Control time is counted in grappling, wrestling and (against) defence, so a control wrestler collects it three times and a striker loses it three times.
- **Whom a fighter beat** enters only through recent form (15%, last five fights). Beating the champion and beating a debutant move the headline by about the same amount.

So the number describes style and output. A striker who wins is penalised for not wrestling; that is why the champions in the question score 40 to 65 while Islam Makhachev (a wrestler-grappler) scores 84. This is a design limit, not a data error: the figures behind it are correct.

## What was tested
An Elo-type **results rating** built on every archived UFC bout (4,621, fighters who left included). Each fight moves both fighters by how surprising the result was given their ratings, so beating a strong opponent gains a lot and losing to a weak one costs a lot. A finish counts 1.25 times a unanimous decision and a split or majority decision 0.5 times. A fighter's first fights move the rating more. Parameters were chosen on 1,717 fights from 2016 to 2023 only, then frozen. It was then scored on the same 926 fights from 2024 that the R4 study used, with the same walk-forward method, and compared with the live rating.

## Findings
1. **It ranks fighters the way the division rankings do.** Of the top 100 by results rating, 89 are ranked or champions; of the top 100 by the live rating, 49 are. Every current champion is in the 90th to 99th percentile (Strickland 96th, Ulberg 98th, Gane 99th, Makhachev 99th).
2. **On its own it predicts about as well as the live rating, not better.** Brier 0.2339 against 0.2313; the difference is inside the noise (interval -0.0106 to +0.0056). Calibration is good (70%+ calls won 80% against 74% predicted).
3. **The two together are better than either alone.** A blend fitted only on earlier quarters scored 62.1% accuracy and Brier 0.2273 on 757 fights, against 61.0% and 0.2323 for the live rating on the same fights (improvement +0.0050, interval +0.0000 to +0.0094) and 59.8% and 0.2341 for the results rating (+0.0067, interval +0.0002 to +0.0141). This is the first change tested here whose interval does not include zero, though only just. Results and measured skills carry different information.
4. **Fitted weights** put roughly 60% of the spread on results and 40% on the live (skills) rating. With those weights Strickland goes from 40 to the 83rd percentile, Ulberg 61 to 95th, Gane 65 to 98th, Pereira 53 to 91st, Makhachev stays at 99th. Of the top 100 by the blend, 80 are ranked or champions.

## Limits
- The archive is thin before 2019 (24% of UFC fights in 2014, 63% in 2019; see `docs/ufc-v4-r4-calibration-full-20261123.md`), so a veteran's early UFC wins may be missing and their results rating may start too low.
- UFC fights only: no regional or other-promotion record, so a debut is a blank slate.
- No inactivity decay yet: Jon Jones is second on results with no fight since 2024.
- A percentile on a 0 to 100 scale bunches the elite: ten fighters share 99 in the blend. A headline would need a scale with room at the top, or a rank inside the division.
- 926 test fights. The blend's advantage is small and only just clear of zero; it should be confirmed on more fights before any release.
- The owner's decision (#432) that the rating is descriptive, never a forecast, is unaffected: prediction is used here only as an objective test of whether a number reflects strength.

## Decisions for the owner
1. Should the headline BEFN rating include results against opponent strength (the blend), or stay skills and form only?
2. Should the skill bars be reworked so they score effectiveness (for example wrestling = takedowns landed and takedowns stopped, control won and control conceded) rather than mostly volume?
3. What scale: a 0 to 100 percentile (bunched at the top), a wider rating number, or a division rank?

## Full output
### Results-based strength rating: research (23 November 2026)

**Research only. Nothing here changes a rating or the site.** Reproduce: `python3 scripts/ufc-results-rating-research.py`.

Archived UFC bouts: 4621 (all fighters, including those who have left). Parameters chosen on 1717 decided fights from 2016 to 2023 only (log loss 0.6518): `{"start": 1500, "k": 64, "boost": 1, "finish": 1.25, "split": 0.5}`. Then frozen.

## Same test fights as the R4 study (from 2024-01-01, walk-forward)

| Model | Fights | Accuracy | Brier | Log loss |
|---|---:|---:|---:|---:|
| Coin flip | 926 | 0.505 | 0.2500 | 0.6931 |
| Career win rate | 926 | 0.609 | 0.2373 | 0.6676 |
| Live BEFN overall rating | 926 | 0.611 | 0.2313 | 0.6551 |
| Results rating (Elo scale, no fitting) | 926 | 0.599 | 0.2340 | 0.6599 |
| Results rating (slope fitted walk-forward) | 926 | 0.599 | 0.2339 | 0.6598 |
| Blend: results + live rating (fitted walk-forward; 757 fights) | 757 | 0.621 | 0.2273 | 0.6468 |
| Results rating on those same 757 fights | 757 | 0.598 | 0.2341 | 0.6601 |
| Live BEFN rating on those same 757 fights | 757 | 0.610 | 0.2323 | 0.6572 |

- Brier improvement of the results rating over the live rating: -0.0026 (95% interval -0.0106 to +0.0056).
- Over the career win rate: +0.0033 (95% interval -0.0020 to +0.0089).

- Does adding the live (skills) rating to the results rating help? Brier change +0.0067 (95% interval +0.0002 to +0.0141).
- Does adding the results rating to the live rating help? Brier change +0.0050 (95% interval +0.0000 to +0.0094).
- Blend weights fitted on all 926 test fights (for design only, not used to score): 1.630 per 400 results points, 1.996 per 100 live-rating points.

### Calibration of the results rating

| Predicted | Fights | Mean predicted | Observed |
|---|---:|---:|---:|
| 0.0 to 0.4 | 185 | 0.334 | 0.330 |
| 0.4 to 0.5 | 282 | 0.453 | 0.440 |
| 0.5 to 0.6 | 267 | 0.547 | 0.536 |
| 0.6 to 0.7 | 141 | 0.646 | 0.631 |
| 0.7 to 1.0 | 51 | 0.740 | 0.804 |

## Current results rating, active roster (719 fighters with 3+ archived UFC fights)

### Champions

| Fighter | Division | Results rating | Percentile | Live BEFN |
|---|---|---:|---:|---:|
| Islam Makhachev | welterweight | 2022 | 99 | 84 |
| Alexander Volkanovski | featherweight | 1898 | 99 | 63 |
| Petr Yan | bantamweight | 1884 | 99 | 67 |
| Ciryl Gane | heavyweight | 1872 | 99 | 65 |
| Justin Gaethje | lightweight | 1850 | 98 | 47 |
| Joshua Van | flyweight | 1844 | 98 | 65 |
| Carlos Ulberg | light-heavyweight | 1838 | 98 | 61 |
| Natalia Silva | womens-flyweight | 1810 | 96 | 71 |
| Sean Strickland | middleweight | 1796 | 96 | 40 |
| Kayla Harrison | womens-bantamweight | 1746 | 91 | 79 |
| Mackenzie Dern | womens-strawweight | 1732 | 90 | 55 |

### Top 25

| # | Fighter | Division | Results rating | Live BEFN | UFC rank |
|---:|---|---|---:|---:|---|
| 1 | Islam Makhachev | welterweight | 2022 | 84 | C |
| 2 | Jon Jones | heavyweight | 1942 | 76 |  |
| 3 | Alexander Volkanovski | featherweight | 1898 | 63 | C |
| 4 | Petr Yan | bantamweight | 1884 | 67 | C |
| 5 | Charles Oliveira | lightweight | 1879 | 63 | 3 |
| 6 | Dricus Du Plessis | middleweight | 1873 | 63 | 2 |
| 7 | Ciryl Gane | heavyweight | 1872 | 65 | C |
| 8 | Ilia Topuria | lightweight | 1865 | 78 | 1 |
| 9 | Khamzat Chimaev | middleweight | 1859 | 72 | 1 |
| 10 | Max Holloway | lightweight | 1857 | 47 | 4 |
| 11 | Valentina Shevchenko | womens-flyweight | 1857 | 72 | 1 |
| 12 | Justin Gaethje | lightweight | 1850 | 47 | C |
| 13 | Carlos Prates | welterweight | 1848 | 55 | 2 |
| 14 | Joshua Van | flyweight | 1844 | 65 | C |
| 15 | Brendan Allen | middleweight | 1841 | 61 | 4 |
| 16 | Magomed Ankalaev | light-heavyweight | 1840 | 65 | 1 |
| 17 | Shavkat Rakhmonov | welterweight | 1839 | 74 |  |
| 18 | Carlos Ulberg | light-heavyweight | 1838 | 61 | C |
| 19 | Michael Morales | welterweight | 1831 | 72 | 3 |
| 20 | Arman Tsarukyan | lightweight | 1827 | 92 | 2 |
| 21 | Alex Pereira | light-heavyweight | 1826 | 53 | 3 |
| 22 | Nassourdine Imavov | middleweight | 1825 | 70 | 3 |
| 23 | Merab Dvalishvili | bantamweight | 1824 | 62 | 1 |
| 24 | Tatiana Suarez | womens-strawweight | 1823 | 65 | 2 |
| 25 | Kamaru Usman | welterweight | 1812 | 49 | 10 |

Ranked or champion fighters in the top 100 by results rating: 89 of 100 (live rating top 100: 49 of 100).

