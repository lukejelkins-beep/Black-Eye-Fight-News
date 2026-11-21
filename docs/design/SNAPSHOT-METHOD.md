# Fighter snapshot method (UFC / MMA)

Status: **proposal for the owner's approval, 21 Nov 2026.** Describes what the existing V3 engine (`assets/fighter-power-index.js`) already does, plus two additions (Power and Durability) that are new. Nothing here is a prediction: these are descriptive scores of what a fighter has done, not win probabilities or betting advice.

## What a score means
Each attribute is a **percentile: 1 to 99 against the other UFC fighters** in the data (about 613 rated today). 80 means "better than about 80% of the roster at this". Today the profile ranks against the **whole roster only**. Ranking against the fighter's **own weight division** (what the agreed method asks for) exists only in the Python copy, and applies when the division has at least 8 rated peers. **Proposal:** the snapshot shows the division percentile when there are 8 or more peers, otherwise the roster percentile, and the label always says which. This means porting the division step into the browser engine.

## The calculation, in four steps
1. **Raw composite.** Several measured numbers per attribute are each scaled to 0-100 between a floor and a ceiling, then combined with fixed weights (below).
2. **Shrink small samples.** A fighter with few fights is pulled toward the roster average by `fights / (fights + 4)`. With 5 fights the score keeps 56% of its distance from average; with 12 fights, 75%. No thin record can look like an extreme.
3. **Rank.** Percentile of the shrunk score against the roster (ties share the midpoint).
4. **Gate.** No score at all when the evidence is too thin: at least 3 fights with full round stats, and each attribute needs a minimum share of its components measured. Missing is shown as a dash, never zero. Out-of-range values (for example 8 knockdowns per 15 minutes from a tiny sample) are treated as missing.

## Attributes and weights (existing, except Power and Durability)
| Attribute | Made from (weight) |
|---|---|
| **Striking** | strikes landed per min (18%), strike differential per min (22%), accuracy (15%), knockdowns per 15 min (20%), KO/TKO wins per fight (25%) |
| **Wrestling** | takedowns per 15 (34%), takedown accuracy (21%), control-time share (28%), takedown defence (12%), reversals (5%) |
| **Grappling** | submission attempts per 15 (30%), submission wins per fight (50%), reversals (15%), control share (5%) |
| **Defence** | strikes absorbed per min, lower is better (31%), strike defence (29%), takedown defence (22%), knockdowns absorbed per 15, lower is better (12%), opponent control share, lower is better (6%) |
| **Recent form** | last five decided fights, newest counts most (5,4,3,2,1), starting from a neutral prior; each result is nudged up or down by the opponent's strength (at most plus or minus 25% of a win) |
| **Power (new)** | knockdowns per 15 min (50%), KO/TKO wins per fight (50%). Finishing damage, not volume: Striking rewards how much you land, Power rewards what it does. Both components must be measured. |
| **Durability (new)** | knockdowns absorbed per 15 min, lower is better (40%); share of recorded fights lost by KO/TKO, lower is better (40%); strikes absorbed per min, lower is better (20%). Ability to take punishment and still be there at the end. Both of the first two must be measured. |

Weights for the first five rows are the ones in the code today. Power and Durability weights are my proposal; floors and ceilings (for example knockdowns 0 to 1.0 per 15 min) follow the existing ones and are confirmed against the roster's spread in Step 1.

**Known overlap:** Power shares two inputs with Striking, and Durability shares two with Defence. They are different questions but will correlate; the snapshot never adds them together.

## What the card shows
Power, Defence, Wrestling and Durability bars first (Striking and Grappling one tap deeper), each with "based on N fights" and a coloured band: below 35 red, 35 to 54 orange, 55 to 74 gold, 75 and over green (the bands the profile uses now). No overall number on the card.

## Differences between the two copies of the engine, to settle
- The **profile** (browser) uses the last five fights. A Python copy (`scripts/ufc_ratings.py`) uses a career window weighted toward recent fights (18-month half-life). **Proposal:** the snapshot uses the profile's version, so card and profile always agree. The career-weighted version stays research only.
- The browser can print a percentile of 100; the Python copy caps at 1 to 99. **Proposal:** cap at 1 to 99 everywhere ("a percentile describes standing among others, not certainty").
- The profile can add fixed "credential" points (NCAA, Olympic judo, BJJ belts and so on) on top. **Proposal:** the snapshot shows the statistical score only; credentials stay on the profile where they are explained.

## How it is checked before anything is shown
Held-out test: scores computed from fights before a cutoff are compared with what happened in later fights (for example, do higher Durability fighters get stopped less?). Report by division. Tiny divisions and fighters under the sample gate stay blank. Method and results go in the PR; nothing is switched on until the owner approves the screenshots.

## Test results, 21 Nov 2026 (prototype on `data/ufc-stats`, not yet in the repo)
**Real fighters.** Bars were compared for the main events on announced UFC cards and for well-known fighters. They mostly match reputation: Makhachev reads Defence 98, Wrestling 91, Grappling 98 but Striking 29; Chandler reads Durability 4 and Defence 7; Holloway Durability 76 but Wrestling 10; Kape and Lopes read Power 98 and 92. Odd-looking results were small samples (7 to 13 fights) or percentiles set by a thin division.

**Backtest.** Scores built from each fighter's last five fights before a cutoff, compared with what happened in their later fights (347 fighters at a 21 May 2025 cutoff, 377 at 21 Nov 2024; results agree).
- **Power:** the top quarter scored KO wins in 25 to 28% of later fights, the bottom quarter 11%. Rank correlation 0.28 to 0.33, a little better than just using past KO-win rate (0.26 to 0.30).
- **Durability:** the top quarter was KO'd in 12 to 13% of later fights, the bottom quarter 22 to 24%. Correlation 0.20 to 0.24 (in the right direction), better than past KO-loss rate alone (0.16 to 0.20) and better than strikes absorbed alone (0.11 to 0.12).
- Other weightings were tried (for example 20/60/20 for Durability and 30/70 for Power); none beat the proposed weights, so they stay as proposed.
- **Honest read:** both carry real but modest signal, as expected from five fights of data. They describe a fighter's recent record; they do not predict a fight.

## Two findings that change the proposal
1. **Data source.** The profile's data file (`ufc-fighter-v3.json`) has no knockdowns absorbed, strike defence or takedown accuracy, so Durability cannot be built from it. `data/ufc-stats` (rebuilt hourly from saved round data) has all of them and already has division percentiles. **Revised proposal:** the snapshot reads `data/ufc-stats`. The profile's numbers differ for the same fighter (for example Joshua Van: Wrestling 19 and Grappling 52 on the profile engine, 62 and 23 in `ufc-stats`), so the profile should move onto the same data so card and profile agree.
2. **Cross-division bouts.** A bout between fighters from different divisions (for example Oliveira, Lightweight, vs Lopes, Featherweight) would compare percentiles on different bases. **Rule:** use the division percentile only when both fighters are in the same division with 8 or more peers; otherwise show roster percentiles for both and say so.

## Division versus roster: staged plan (21 Nov)
Division-relative scores are the better end state (a roster percentile mixes weight classes, so "Power 90" means different things at heavyweight and flyweight), but they cannot lead yet: only 33 of 57 fighters on announced UFC cards have a listed division, and only 11 of 30 bouts have both fighters in the same listed division. The data has no weight class per past fight.
1. **Steps 1 and 2:** roster percentile for everyone, plus a division rank line when both fighters share a listed division with 8 or more peers. Every bar names its comparison pool.
2. **Step 1b:** add a weight class to each past fight (done: the free UFCStats export the site already uses for results is the source, confirmed 21 Nov; 93.2% of our bouts labelled, 54 of 60 fighters on announced cards have a division) and derive each fighter's division from recent fights, so coverage is near-complete.
3. **Then:** division becomes the main view once coverage on announced cards is high (target 90% of fighters); roster percentile stays as the fallback.
Moving up or down: stats use all UFC fights regardless of weight class; ranking uses the current division, and step 1b also lets the snapshot flag a fighter who is new to a division.

## Can an opponent-adjusted model do better? (21 Nov, offline prototype)
Asked for "the best possible model", two tests were run on `data/ufc-stats` (4,799 decided bouts, mostly 2019 to 2026). Trained on older fights, tested on bouts from July 2024 where both fighters had earlier UFC fights.
- **Win prediction.** A plain opponent-adjusted rating (Elo style, finishes weighted more) reached about 58.6% accuracy and log loss 0.661. A simple win/loss-record baseline reached 58.5% and 0.667; a coin flip is 0.693. The edge is tiny, and the best setting was picked on the same test fights, so it is flattered. About 58 to 60% looks like the ceiling for a model built only on these results. Win probabilities stay off the cards.
- **Opponent-adjusted stats.** Predicting a fighter's next-fight stats: scaling recent strikes landed by what the opponent normally allows cut the error about 10% versus the raw last five (4.41 against 4.89; league average 5.07). Adjusting the whole history added nothing more. Knockdown and takedown rates were no better than the league average for any method, because five fights hold too few events.
- **Consequence for v1.** Keep the simple percentile bars, labelled as a snapshot of the last 5 fights, and shrink rare-event stats (knockdowns, takedowns) harder toward average. A strikes-landed opponent adjustment is an optional later add-on. Caveats: one time split, shrinkage not tuned, league averages taken from the full sample for every method.

## Step 3: attribute scores, built and switched off (21 Nov)
Code: `scripts/ufc_snapshot_scores.py` (formulas), `scripts/build-ufc-card-scores.py` (writes `data/ufc-card-scores.json`), display in `assets/snapshot-tiles.js`. Four attributes reuse the existing engine formulas on the **last five fights**; Power and Durability are the new ones above. Six scores per fighter: Striking, Power, Defence, Wrestling, Grappling, Durability. The card shows Power, Defence, Wrestling and Durability first and the other two under "More scores". No overall number.
- **Population:** 763 fighters with at least 3 of their last 5 fights measured in full (Power 758, Wrestling 762). Fighters below that get no score, only the tiles and "Limited data".
- **Ranking basis, per bout:** against the division when both fighters are in the same division and have a division score (8 or more rated peers), otherwise against all UFC fighters, for both. On the 5 announced cards today that is 17 of 30 bouts by division and 13 by roster. The panel says which one it used. A fighter new to a division gets a one-line note ("new to Welterweight, was Lightweight").
- **Why division matters (fairness check).** Mean roster percentile by division: Power is about 32 to 36 for the women's divisions against 54 to 59 for Featherweight to Heavyweight; Durability is 64 to 71 for the women's divisions against 39 for Light Heavyweight. Ranking within a division makes every division average 50 by construction, so a flyweight is not judged against heavyweights. The roster fallback (cross-division bouts) carries those gaps and is labelled as such.
- **Held-out test of the shrink strength (K).** Scores from the 5 fights before a cutoff against the next fights, three cutoffs (Nov 2024, May 2025, Nov 2025; 254 to 377 fighters each). Power rank correlation with later KO wins +0.28 to +0.33; Durability with later KO losses -0.17 to -0.24. Changing K from 0 to 16 moved those by 0.02 or less, in no consistent direction. So **K=8 for Power and Durability is not shown to rank better than K=4; it is kept only because five fights hold too few knockdowns to trust an extreme** (the earlier test showed knockdown and takedown rates no better than the league average). It is a humility choice, not a validated improvement.
- **What the scores are not.** They are descriptive. The Elo-style and stat-adjustment tests found no strong predictive edge, so no win probability is shown.
- **Switch:** the scores file is not requested and nothing is drawn unless the page sets `BEFN_FEATURES.snapshotScores = true`, or the address has `?snapshotScores=preview` (for the owner's review only). Releasing scores to readers is the owner's separate approval (tracker #171, R4).

