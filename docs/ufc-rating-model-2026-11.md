# BEFN rating model 2026-11: results + effectiveness skills (built, not on the site until "Merge N")

The owner chose, on 2026-11-23 (PR #453): blend results with skills in the headline, score the skill bars for effectiveness, and use a wider rating number. After reviewing the first build the owner also chose: title fights count more, a weaker inactivity drift (10% a year), and a 60/40 results/skills mix. This note says what was built and how well it works. The rating stays **descriptive**: prediction is only the objective test, never shown (owner decision #432).

## Update 26 Nov 2026: women and men are rated as separate pools (owner request: "separate the women in terms of their stats/ranking")
The rating is now worked out once for women (divisions starting `womens-`) and once for men (`POOLS`, `pool_of`, `rate_roster`
and `_rate_pool` in `scripts/ufc_ratings.py`). Inside each pool: skill percentiles and their shrinkage means, the headline centre
(the pool's median established fighter is 50, before the age and height adjustments), the rank (`overallRank` of `rankOf`, where
`rankOf` is the pool's size), the overall percentile and the results percentile. The results Elo itself is unchanged: it runs once
over every bout. Profiles carry `pool` and show "#8 of 127 rated UFC women"; `names.json` has `ratedByPool`.

Why: women only fight women, so the two Elo ratings are never anchored to each other. The women's median rating sat 14 points (1.8 on
the score) below the men's, and women's striking was being ranked against men's, with their knockdowns and KO finishes.

Pool for a fighter with no division (10 on 21 Nov): a women's bout label in `data/ufc-bout-weight-classes.json`, else most opponents
are women (`rating_pools` in `scripts/build-ufc-stats.py`); no evidence at all stays in the men's pool as before. That moved Lipski,
Feng Xiaocan and Lindgren Knutsson into the women's pool.

Result (`python3 scripts/ufc-rating-evaluate.py --previous origin/main`, 1,135 bouts from 2024): accuracy 65.0% to 65.0%, Brier 0.2213
to 0.2211 (+0.0002, interval -0.0000 to +0.0004: level). Official-ranking check: ranked fighters or champions in the top 100 80 to 79,
champions in the top 50 8 to 8, rank correlation inside each division 0.69 to 0.68. Women's scores rise by 1.0 on average (up to +2.4),
men's fall by 0.2 (at most 0.7), because the men's centre is now the men's median alone. Kayla Harrison 74.15 (#63 of 719) to 75.96
(#8 of 127 women); Valentina Shevchenko 87.32 to 89.57 (#1 of 127). The evaluation's own tables still rank everyone together, so its
"position" columns are the combined order, not the profile rank.

Left as it was: the rating-board page (all divisions) mixes both pools, so it is ordered by score, and the board's rank column is used
only when the rows are one pool. The `Previous` figures elsewhere in this note are the pooled model.

## 26 Nov 2026: title-winner variants tested; no idle drift after a title fight adopted (owner's choice), age waiver not
Owner, after Kayla Harrison's submission win over Amanda Nunes left her at 75.96: test "a title win over a former champion counts
without the idle decay" and "the age penalty is waived for champions". Two knobs in `scripts/ufc_ratings.py`, both off:
`TITLE_NO_DRIFT` (a fighter whose last fight was a title fight is not drifted back toward 1500 while idle, so Nunes entered at
about 1667, not 1589) and `AGE_TITLE_FACTOR` (the age penalty, never the bonus, times this for a fighter who won a title fight in
the last 24 months). `python3 scripts/ufc-rating-variants.py run ...` then `compare ...`: the same quarterly point-in-time
snapshots and walk-forward k as `ufc-rating-evaluate.py`, 1,135 bouts from 2024, on the pooled-by-sex engine.

| Variant | Accuracy | Brier | Gain vs base (95% interval) | Kayla Harrison |
|---|---:|---:|---|---|
| Base | 65.0% | 0.2211 | | 75.96, #8 of 127 |
| No idle drift after a title fight | 65.0% | 0.2211 | +0.0000 (-0.0003 to +0.0003) | 82.49, #3 |
| No age penalty for recent title winners | 65.1% | 0.2212 | -0.0000 (-0.0004 to +0.0004) | 79.60, #4 |
| Half the age penalty for recent title winners | 65.0% | 0.2212 | -0.0000 (-0.0002 to +0.0002) | |
| Both (no drift, no penalty) | 65.1% | 0.2212 | -0.0001 (-0.0006 to +0.0005) | 86.13, #2 |

Neither improves prediction: every difference is under 0.0001 Brier, far inside the interval. They change how champions
read, not how well the number predicts, so they are an owner's choice, not a fitted one.

**Adopted (owner: "Go", after the recommendation):** no idle drift after a title fight (`TITLE_NO_DRIFT = True`). The age waiver
stays off: age is the one adjustment that clearly helped prediction and champions age like everyone else. Effect on the
2026-11-21 build: Kayla Harrison 75.96 to 82.49 (#8 to #3 of 127 women; Shevchenko 89.68, Silva 82.96). Side effects, because
every fighter whose last fight was a title fight keeps their rating through a layoff, in the walk: Jon Jones 63.62 to 81.99 (#128 to
#17 of the men), Amanda Nunes 48.43 to 63.53 (#58 to #27 of the women), Stipe Miocic +10.3, Henry Cejudo +9.3, Ciryl Gane +2.3;
Holly Holm -2.0 and Pannie Kianzad -2.1 (their opponents' ratings no longer fall with a layoff). Nearly everyone moves a little
(under 0.7) as the pool median shifts. An inactive former champion therefore reads higher than before; the final rating of a
fighter still idle is aged as it was.

**Effect on Form** (decided 26 Nov 2026: Form stays on the old ratings): Form values each fight by the opponent's point-in-time
results rating, so the no-drift rule would have moved saved Form for 422 of 736 fighters (mean 0.22 points, 18 by a point or
more, 9 rank changes, 3 stage changes) for no gain in Form's own accuracy (Brier 0.2286 against 0.2287 from 2024). So
`rating_history` in `scripts/build-ufc-fighter-form.py` turns `TITLE_NO_DRIFT` off for the walk it uses: Form values are
unchanged by this rule. The no-drift rule applies to the headline rating only.

## Update 25 Nov 2026: age in the headline (owner request: "can we improve the BEFN rating as well")
Each fighter's rating now includes an age adjustment: **5.4 rating points per year away from 31** (the median fighter's
age), younger up and older down, measured on the rating's own date (`AGE_CENTRE`, `AGE_POINTS_PER_YEAR`,
`age_points` in `scripts/ufc_ratings.py`; birth dates from `data/ufc-fighter-born.json`; unknown birth date, about 4%
of the roster: no adjustment). On the score out of 100 that is about 0.68 a year. The profile file carries it as
`ageAdjustment`.

How it was chosen: the same quarterly point-in-time snapshots as `scripts/ufc-rating-evaluate.py`, fitted on bouts
from 2019 to 2023 and tested on 2024 onward. Age was the only candidate that helped. Tried and rejected: adding the
Form v4 score (no gain on top of age), separate striking / wrestling / grappling weights in place of the composite
(61.8% against 62.6%), and age curves with a peak or a threshold (no better than a straight line).

`python3 scripts/ufc-rating-evaluate.py` against the previous engine, 1,135 bouts from 2024 to 21 Nov 2026:

| | Previous | With age |
|---|---:|---:|
| Accuracy | 62.7% | **64.1%** |
| Brier (lower is better) | 0.2274 | **0.2222** (gain +0.0053, 95% interval +0.0031 to +0.0075: clearly better) |
| Log loss | 0.6467 | 0.6353 |
| 2024 / 2025 / 2026 accuracy | 63.1 / 66.9 / 58.0% | 65.3 / 68.1 / 59.0% |
| Ranked fighters or champions in the top 100 | 83 | 78 |
| Champions in the top 50 (of 11) | 10 | 8 |
| Rank correlation with the official order inside each division | 0.68 | 0.66 |

Trade-off: it predicts better but agrees slightly less with the official rankings, because older champions and
contenders lose a little (Volkanovski #4 to #9, Shevchenko #2 to #6) and younger ones gain (Joshua Van #6 to #2).
Biggest falls: veterans near the end (Arlovski, Blachowicz, Holly Holm, Cannonier, Thompson); biggest rises: young
fighters (Tereza Bleda, Francisco Prado, Cameron Saaiman).

## 25 Nov 2026: height against the division average (adopted); reach tested, not used
Owner: "difference in height, reach, difference from the average in the division ... see if that has any
predictability", then "do whatever increases the predictability most". Heights and reaches from the same free UFCStats
export as the birth dates (`heightInches` in `data/ufc-fighter-born.json`, 815 of 921 fighters).

On their own: the taller fighter wins 54.8% of 2,050 bouts (56.8% with a 3-inch gap); the longer reach 52.4% (55.0%);
the bigger ape index 51.1%. Added to the rating with age, height helped in every test period (Brier +0.0015 on
2022-23, +0.0011 on 2024-26, +0.0008 on 2019-21 fitted the other way round); reach helped in some and hurt in others,
and added nothing once height was in. Size chosen for accuracy by 10-fold cross-validation over all 2019-2026 snapshot
bouts: 0 → 64.62%, 3 points an inch 65.28%, **6 points 65.46% (the peak)**, 9 → 65.30%, 12 → 65.20%, 25 → 64.78%.

**Rule:** `HEIGHT_POINTS_PER_INCH` = 6 rating points (0.75 on the score out of 100) per inch above or below the
average height of the fighter's division on the roster being rated (`division_heights`, `height_points` in
`scripts/ufc_ratings.py`; at least 5 fighters with a height; unknown height or division: no change). Two fighters in
one division differ by exactly their height gap. Profiles carry it as `heightAdjustment`.

`python3 scripts/ufc-rating-evaluate.py --previous origin/main` (the rating with age) on 1,135 bouts from 2024:
accuracy 64.1% → **65.0%**, Brier 0.2222 → 0.2213 (gain +0.0008, interval −0.0002 to +0.0019: small, not certain on
its own, but in the same direction in every period tested); 2024 / 2025 / 2026: 65.3 / 68.1 / 59.0% → 64.4 / 69.0 /
61.3%; ranked fighters or champions in the top 100 78 → 80. Biggest moves: Chris Barnett (heavyweight, 5'9", −38
points, −4.8 on the score), Tom Nolan (lightweight, 6'3", +30, +3.8); Topuria −18, Salkilld +12.

## 25 Nov 2026: opponent credit tested on the rating, not adopted
After Form gained opponent credit in its fight margins (PR #562), the owner asked to test the same on the BEFN rating.
The results half already credits opponents (Elo); the skills half uses career rates. Opponent-credited striking,
control and takedown margins (credit 0, 0.5, 1.0 and 1.5; last 8 fights in 5 years, or whole career) were added to the
rating with age, or used in place of the skills composite, on the same quarterly snapshots (fit before 2024, test
1,238 bouts from 2024). Every version was slightly worse than the rating with age (64.2%, Brier 0.2227): added,
63.2-63.7% and Brier 0.0009 to 0.0012 worse; in place of skills, 63.5-63.7% and 0.0025 to 0.0027 worse. On their
own the credited margins pick 58.5% of winners, but they overlap the rating (correlation 0.55) and add nothing to it.
The rating is unchanged; the credit stays in Form only.

## 25 Nov 2026: amateur and Olympic/Commonwealth credentials tested, not adopted
Owner asked whether the verified amateur results (`data/ufc-amateur-credentials.json`: 128 fighters, 485 results)
should raise ratings "in a consistent way". One table for every sport and row: Olympic 10 / 9 / 8 (gold, silver,
bronze) and 6 to take part; World 6 / 5 / 4 / 2; continental or Commonwealth 4 / 3 / 3 / 1.5; national 2 / 1.5 / 1 /
0.5; other 1.5 / 1 / 1 / 0.5; times 1 senior, 0.75 under-23, 0.6 junior, 0.4 youth or cadet. A fighter's score is
their best result plus 0.3 of each other one, capped at 12, counting only years before the bout. Fitted on bouts
before 2024, tested on 2024 onward:

| Test (2024 on) | Without | With credentials |
|---|---:|---:|
| BEFN rating (with age), 1,238 bouts | 64.2% / Brier 0.2227 | 63.3% / 0.2249 |
| … the 307 bouts where either fighter has a credential | 66.8% / 0.2109 | 63.2% / 0.2192 |
| Form v4, 991 bouts | 64.1% / 0.2316 | 62.7% / 0.2319 |
| … the 249 bouts with a credential | 69.1% / 0.2240 | 63.5% / 0.2243 |

Variants (a bonus that fades as UFC fights accumulate, Olympic and senior World results only, both) were also
slightly worse. On the fitted years (before 2024) credentials looked helpful (Brier 0.2259 to 0.2237), but that did
not carry forward, which points to selection: the credentials were researched in 2026 for fighters still on the
roster, and what they show is already in the grappling and wrestling statistics. Credentials stay on the profile,
not in Form or the rating. Worth re-testing once the research covers fighters who have left the UFC.

## What the headline is now
**What readers see (owner's choice, 24 Nov):** `overall` in each `data/ufc-stats/fighters/<slug>.json` is a **score out of 100**, 50 + (rating - 1500) / 11, so 50 is the median rated UFC fighter and Islam Makhachev is 97; profiles show it with the overall rank (`overallRank` of `rankOf`). The full **BEFN rating** below is kept as `overallRating` (1500 = median; Makhachev 2019) and orders the ranks. It combines:

1. **Results (60% of the spread, owner's choice; the fit gave 68%).** An Elo-type rating over every archived UFC bout (4,646, including fighters who have left), in date order. Each fight moves both fighters by how surprising the result was, so beating a strong opponent gains a lot and losing to a weak one costs a lot. A KO/TKO or submission counts 1.25 times a unanimous decision; a split or majority decision 0.5 times; a UFC title fight 1.5 times on top (owner's choice). The first fights move a rating more. After a year without a fight a rating drifts back toward 1500 by 10% a year (owner's choice; the fit gave 20%).
2. **Skills (40%).** The four skill percentiles with their existing relative weights (striking 25, defence 25, wrestling 20, grappling 15). Recent form is no longer in the headline (results already carry it) but stays on the profile.

**Update 24 Nov (owner): each skill includes its own defence, and there is no separate Defence bar.** Striking is 60% output (strikes landed 10, differential 17, accuracy 8, knockdowns 11, KO wins 14) and 40% defence (strike defence 12, knockdowns absorbed 12, strikes absorbed 9, KO/TKO losses 7). The KO-loss weight was tested at 0, 7, 13 and 20% on 2024+ fights; more weight never tracked results better (skills-only Brier .2311, .2312, .2318, .2326), because knockdowns and strikes absorbed already carry most of it. The skills composite is striking 55, wrestling 25, grappling 20, and the /100 score divisor is 8 (top ten 88+). Skills use the whole UFC career with an 18-month half-life, not the last five fights. Against the live engine on 1,131 fights the result is level (Brier -0.0002, interval -0.0020 to +0.0016). The fight-card tiles keep the old output-only striking (`strikeOutput`), since they show Defence and Durability separately.

**Update 24 Nov (owner): wrestling and grappling are also 60% offence / 40% defence**, with control won and conceded counted separately. Wrestling: takedowns 25, accuracy 12, control won 23 / takedown defence 5, taken down per 15 min 6, control conceded 24, reversals 5 (control conceded raised from 12% at the owner's request: getting straight back up costs little, being held down costs a lot; tested 12/18/24/29%, Brier .2436/.2438/.2442/.2445, level up to 24%). Grappling: submission attempts 20, submission wins 28, control won 12 / submission losses 15, opponents' attempts 10, reversals 8, control conceded 7. Tested on 2024+ fights, each skill alone (Brier, lower is better): submission-loss weight 0 / 7 / 15 / 22% gave .2466 / .2459 / .2458 / .2458; taken-down weight 0 / 6 / 12 / 18% gave .2434 / .2436 / .2439 / .2443. Against the live formulas: striking .2457 to .2394, wrestling .2434 to .2436, grappling .2459 to .2458. The fight-card tiles keep the earlier formulas (`strikeOutput`, `wrestlingCard`, `grapplingCard`).

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
