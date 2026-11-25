# Handover: Fighters hub design and the one Form score (24 Nov 2026)

**For:** the chat that owns the BEFN rating and the fighter profile.
**From:** the Fighters hub design chat.
**Goal:** one consistent Form score and one look across the profile and the new Fighters hub, with both built in the repo.

Repo: `lukejelkins-beep/Black-Eye-Fight-News`. Standing rules still apply: read `AGENTS.md` first and `docs/design/README.md` before visual work. Nothing merges until the owner says "Merge N". Check at 390 px and 1280 px in a real browser. Record decisions in `docs/design/DECISIONS.md`.

## 1. Who owns what

| Item | Owner | Notes |
| --- | --- | --- |
| **BEFN rating (shown as "Overall")** | **Your chat (ratings)** | Formula, weights and scale (Elo-style or 0 to 100) are yours. The hub shows exactly what the profile shows, from the same field. |
| **Form score** | Agreed here; **implement once** and use on both pages | Defined in section 3. The profile's existing Form meter (`ratings.form.score` in the stats build) is replaced by this score, so the two pages can never disagree. If your rating work already has a better recent-form measure, raise it with the owner before building, so there is still only one. |
| Stages, badges, form rank, hub layout | Hub (this handover) | Sections 4 to 6. Badges should also appear on the profile (section 7). |

**Open question for you and the owner:** if the BEFN rating is not on a 0 to 100 percentile scale, the hub must not invite readers to compare Form with Overall ("Form above Overall means rising"). It then just shows them side by side. If it is 0 to 100, that comparison becomes a feature.

## 2. Data used (all offline, deterministic, already in the repo unless noted)

- `data/ufc-stats/fighters/<slug>.json`: fight history (date, opponent, opponentSlug, outcome, method, methodDetail, endRound, titleFight, boutId) and last-5 rates (`windows.last5.rates.diffPm`, `ctrlShare`).
- `data/ufc-stats/index.json` `asOf`: the run date.
- `data/ufc-divisions.json`: official ranks and champions (rank 0 = champion). Interim champions count as Title contenders when the file marks them.
- `data/ufc-independent-full-career-verification.json`: certified fighters. **Only certified fighters appear on the hub.**
- **New** `data/ufc-fighter-born.json`: birth dates from the UFCStats fighter export (Greco1899 `ufc_fighter_tott.csv`, the source `scripts/build-ufc-fighter-tape.py` already uses). Match on folded name; leave out names that appear twice. 889 of 921 matched.
- **New** `data/ufc-fighter-status.json`: a hand-kept injury list, each entry with a source link (schema in section 4.4). Starting file: `claude/ufc-fighter-status-2026-11-24.json` in the Fight website project.
- `data/news-live.json`: scanned only to *suggest* injuries for the owner to confirm, never applied automatically.

A working prototype of everything below is in the project: `claude/fighters-heat-prototype-2026-11-24.py` (version 2). It runs in about one second on the 21 Nov data and has been checked against real fighters (section 9). Port it rather than starting from scratch. In the code, the Form points score is called "heat".

## 3. Form score: the exact calculation

**Form v4 (owner, 25 Nov 2026: "Yes, add age" and "keep trying to get it higher").** v3 plus the fighter's **age**,
and Results reported but no longer weighted. New candidate signals were also tested and left out because they added
nothing once v3's parts were in: opponent-weighted strike margin, strikes absorbed per minute, strike accuracy and
defence, takedown defence, experience, and age × damage absorbed. Weights were built up one step at a time, each step
kept only if it raised 5-fold cross-validation on 2014-2024 by at least 0.2 points over four different fold splits.
The 2025-26 bouts had already been looked at once (for v3), so the v4 figure on them is a **second look**.

| Bouts (both fighters scored) | v3 | **v4** (loss cap from 70) | v4 with cap from 75 | BEFN pre-bout rating |
| --- | --- | --- | --- | --- |
| 2025 to Nov 2026, n ≈ 650 | 59.1% / 0.658 | **61.4% / 0.652** | 62.6% / 0.650 | 60.5% / 0.655 |
| 2014 to 2024 (searched on), n ≈ 1,170 | 59.3% | 60.6% | 60.8% | 58.4% |
| 2022 to Nov 2026, n ≈ 1,400 | 59.6% / 0.664 | 61.9% / 0.660 | 62.6% / 0.658 | 59.9% / 0.659 |
| 2018 to 2021, n ≈ 330 | 58.5% / 0.674 | 58.3% / 0.675 | 58.7% / 0.674 | 58.0% / 0.673 |

The loss cap starts at 70 so that, straight after a loss, a fighter stays at or below the top 10% (with 75, Pantoja
after two straight losses read Form 83, Title contender). That costs about a point of accuracy; the owner decides.
Age: 1 at 22 or younger, falling evenly to 0 at 38. Unknown age leaves the part out.

v3 notes (kept for the record):

**Form v3 (owner request, 25 Nov 2026: "try different combinations of weights and stats to get the highest possible
percentage").** A search over thousands of settings (window size and age limit, recency curve, how each fight is
valued, the part weights, the loss cap, and new fight-by-fight statistics) was scored on UFC bouts from 2014 to 2024
with 5-fold cross-validation. The chosen design was then scored **once** on 2025 to Nov 2026 bouts that the search
never saw. Each fighter is scored the day before the bout from earlier fights only.

| Bouts (both fighters scored) | v2 (live until v3) | **v3** | BEFN pre-bout rating (reference) |
| --- | --- | --- | --- |
| 2014 to 2024 (searched on), n ≈ 1,170 | 55.1% | 59.3% | 58.4% |
| 2025 to Nov 2026 (never searched), n = 651 | 58.1% / log loss 0.668 | **59.1% / 0.658** | 60.5% / 0.655 |
| 2022 to Nov 2026 (v2's table), n ≈ 1,410 | 57.9% / 0.673 | 59.6% / 0.664 | 59.9% / 0.659 |
| 2018 to 2021 (v2's held-out table), n ≈ 330 | 50.5% / 0.690 | 58.5% / 0.674 | 58.0% / 0.673 |

What the search found: the fight-by-fight statistics (strike, control and takedown margins) carry the most signal;
looking back up to 8 fights over 5 years beats 5 fights over 3; with the statistics in, results and dominance need
less weight. The best raw settings reached about 61.6% on the searched bouts but only 59 to 61.6% on the unseen ones,
so a simple design built on the signals that kept recurring was chosen instead of the single top scorer. A fitted
statistical model on the same parts reaches about 60.7% on the unseen bouts: v3 is close to that ceiling. Adding the
fighter's age would reach about 61.6% (63.6% for the fitted model), and adding the BEFN rating about 66%; neither is
in Form, because age is not form and the rating is shown beside it (owner's decision on age pending).

v2 notes (kept for the record):

**Form v2 (owner request, 25 Nov 2026).** v1 counted every win the same whatever the opponent, scored finishing on
wins only, ignored how a decision was won or lost, and let one knockout carry a 1-4 run (Niko Price was Form 65). v2
values each fight by who it was against and how much of it the fighter won, adds momentum from the BEFN results
rating, and weights recent fights less steeply. Backtest (each fighter scored the day before every UFC bout from
earlier fights only, P left out because it is not point-in-time; does the higher Form win?):

| Bouts | v1 accuracy / log loss | v2 accuracy / log loss | BEFN pre-bout rating (reference) |
| --- | --- | --- | --- |
| 2022 to Nov 2026 (tuned on), n ≈ 1,410 | 56.7% / 0.684 | 57.9% / 0.673 | 59.9% / 0.659 |
| 2018 to 2021 (held out), n ≈ 330 | 49.2% / 0.693 | 50.5% / 0.690 | 58.0% / 0.673 |

Form is still not a prediction (the BEFN rating predicts better, as it should); the backtest checks that the score
tracks real quality rather than noise. **How much a recent loss matters:** steeper recency (v1's 1.00 to 0.40
positions, a 12-month half-life) and a bigger streak bonus both backtested *worse*; what matters about a loss is who
it was to and how it happened, not just that it was last. The owner chose flat positions (selector, 25 Nov): the five
fights count the same apart from their age, and the weight sits on the manner of the loss (below) and the loss cap.
(The middle option, positions 1.00 to 0.60 with a +0.02 streak step, scored 57.0% / 0.675 and 52.1% / 0.690.)

### 3.1 Window and recency
- Take the fighter's UFC fights with a result (W, L, D) in the last **60 months, newest first, up to 8** (v3; v2: 36 months, up to 5). No contests are skipped here but still count as activity (3.6).
- Base weights by position: all 1.00 (v1: 1.00, 0.85, 0.70, 0.55, 0.40). Only age separates them.
- Multiply each weight by 0.5^(months since the fight / 36), a **36-month half-life** (v3; v2: 24, v1: 18). A fight 1 month old counts about 1.8 times one 30 months old.
- Every part below is a weighted average using these weights. S is the sum of the weights.
- Fewer than 2 fights in the **last 36 months**: **no Form**. Show "limited data", never an estimate.
- The output lists each fight behind the score with its share of the weight (`fights`, columns in `fightFields`).

### 3.2 Each fight
For every fight in the window:
- **q, opponent strength on the night** (3.3), 0 to 1.
- **d, dominance**: how much of the fight the fighter won, 0 to 1, for losses as well as wins.
  - Finish win: round 1 = 1.00, round 2 = 0.92, round 3 = 0.85, rounds 4-5 = 0.80. DQ win 0.60.
  - Decision: 0.15 + 0.70 × the share of the judges' rounds the fighter won (all three judges; a 10-8 round counts double, an even round half), plus 0.04 per knockdown scored and minus 0.04 per knockdown absorbed, kept within 0.05 to 0.95. A 30-27 ×3 win is 0.85, a split about 0.5, being swept 0.15. Without scorecards: unanimous win 0.75, split or majority win 0.55, split loss 0.45, unanimous loss 0.25.
  - Draw 0.50. Finished in rounds 1-2: 0. Finished in round 3 or later: 0.05. DQ loss 0.30.
- **v, value of the result**:
  - Win: 0.55 + 0.25 q + 0.20 d. A first-round finish of an elite opponent is 1.0; a split decision over a weak one about 0.65.
  - Draw: 0.25 + 0.20 q.
  - Loss: (0.12 + 0.56 × min(d, 0.5)) × (0.4 + 0.6 q). A close loss to an elite opponent keeps 0.40; a first-round stoppage by a weak one about 0.05.
  - An upset bonus (1 − the fighter's win probability) was tried and backtested worse: it rewards a fighter for having been rated low.

### 3.3 Points score (0 to 100)
`Form points = 100 × (0.10 D + 0.10 Q + 0.10 M + 0.05 A + 0.25 S + 0.15 C + 0.10 T + 0.15 Age)` (v4; R is still reported, weight 0. v3 was 0.10 R + 0.10 D + 0.10 Q + 0.15 M + 0.05 A + 0.25 S + 0.15 C + 0.10 T; v2 was 0.25 R + 0.30 D + 0.15 Q + 0.10 M + 0.10 A + 0.10 P). A part with no data (M, or S/C/T when no fight has round statistics) is left out and the rest re-weighted.

| Part | How it scores |
| --- | --- |
| **R, Results** (reported, not weighted since v4) | Weighted average of v. No streak bonus in v2 (v1 added 0.05 a win; it backtested worse). A losing run is handled by the loss cap. |
| **D, Dominance** | Weighted average of d over every fight, wins and losses. On its own the most predictive part (57.7% in the backtest; v1's wins-only finishing 51.9%). |
| **Q, Opposition** | Weighted average of q for wins, q/2 for draws and 0.2 q for losses (credit for facing the best, much less than beating them). |
| **M, Momentum** | How far the BEFN results rating moved across the window: 0.5 + (rating after the newest fight − rating before the oldest) / 240, kept within 0 to 1. A 120-point rise is 1.0. |
| **A, Activity** | 1.0 if their last UFC fight was within 6 months, falling evenly to 0 at 18 months. Uses the most recent fight of any kind, including no contests. While out injured, A is held at 1 (4.4). |
| **S, Striking** (v3) | Per fight: significant strikes landed minus absorbed, per minute, from the round statistics. Weighted average m, scored 0.5 + 0.5 tanh(m / 1.5): +1.5 a minute is 0.88, level is 0.5. On its own 56.3% in the search. |
| **C, Control** (v3) | Per fight: control time minus control time against, as a share of fight time. 0.5 + 0.5 tanh(m / 0.2). |
| **T, Takedowns** (v3) | Per fight: takedowns landed minus conceded, per 15 minutes. 0.5 + 0.5 tanh(m / 1.5). |

| **Age** (v4) | clamp((38 − age) / 16): 1 at 22, 0.5 at 30, 0 at 38 or older. On its own 57.5% in the search. Left out when the birth date is unknown. |

v3 drops v2's **P, Performance** (within-division percentiles of the last-5 averages): S and C measure the same things fight by fight, so they can be weighted by age with the rest and checked without looking ahead.

### 3.3a Strength on the night
- From the BEFN results rating's own point-in-time history (`scripts/ufc_ratings.py` `results_walk`): each fighter's rating **before** each bout.
- An opponent's strength in a bout is the percentile p of their pre-bout rating among all pre-bout ratings in the 36 months before that bout. It maps to `clamp((p − 0.30) / 0.68, 0, 1)`, so the top 2% score about 1.0 and the median about 0.3. An unknown opponent scores 0.3.

### 3.4 Loss cap
If the last fight was a loss, the points score is capped at **70 (v4; v3: 75; v1/v2: 85) − opponent penalty − manner penalty − losing-run penalty − repeat-stoppage penalty**. The cap lifts with the next win.

- Opponent penalty: 0 if the opponent was rated higher on the night, or it was a title fight. 10 if rated up to 100 points lower. 20 if more than 100 lower.
- Manner penalty: 0 for a split or majority decision, 5 for unanimous (or a DQ), 10 for a finish in round 3 or later, 15 for a finish in round 1 or 2.
- Losing run (v2): 5 for a second straight loss, 10 for a third or more.
- Repeat stoppage (v2): 5 if the last loss was a KO/TKO or submission and the fighter was also stopped in another loss in the 24 months before it.
- Why 75 in v3: the statistics parts bunch the points (the 90th percentile is about 75 points), so 85 let a fighter coming off a loss read as top 10% (Pantoja, two straight losses, read Form 89). Starting at 75 made no measurable difference in the backtest (59.3% / 59.1% against 59.2% / 59.4%); starting at 70 or lower cost accuracy.
- Why 70 in v4: age bunches the points again (90th percentile about 70). The cap start is meant to sit at the 90th percentile of the points pool; `tests/test_ufc_fighter_form.py` now fails if a reweight moves it outside the 86th to 94th.

### 3.5 Displayed Form (what readers see)
- **Form = the percentile of the points score among fighters with a UFC fight in the last 24 months, rounded and capped at 99.** On 21 Nov that pool was 672 fighters.
- Wording everywhere: "Form 90 means going better right now than 90% of active UFC fighters." Always add that it describes recent results and is not a prediction.
- The profile's Form meter shows this same number.

### 3.6 Activity and no contests
A no contest counts as a fight for activity and inactivity. This was found in testing: Aspinall's no contest against Gane had been ignored, which made him look inactive.

## 4. Stages, badges and statuses

### 4.1 Stages (checked in this order; the first match wins)

Since Form v2 every threshold is on the displayed Form (a percentile), not the points, so re-weighting the points cannot shift the stage counts. The v1 points thresholds map to these Form values.

1. **Champion**: rank 0 and not interim.
2. **Slipping**: ranked #1 to #15 (not interim) and fails the form check (4.2). The UFC number stays on the page, along with the reason.
3. **Title contender**: interim champion, or ranked #1 to #5, who won their last fight or has Form 82+.
4. **Contender**: ranked #1 to #15. With no Form, add "limited data".
5. **Inactive**: unranked, no UFC fight in 24 months (time out injured doesn't count).
6. **Rising star**: unranked, 3 to 6 UFC fights, debut within 36 months, at most 1 loss, won last fight, Form 74+, age 32 or under, UFC debut before age 30.
7. **Prospect**: unranked, 1 to 3 UFC fights, unbeaten in the UFC, age 30 or under, UFC debut before age 30.
8. **Breakout**: unranked, Form 79+, won last fight and 3 of last 4, a fight within 18 months, 10 or fewer UFC fights, age 33 or under.
9. **Established**: everyone else.

Unknown age doesn't block Rising star or Prospect, but they show "age unknown". Debut age of 30 or over is the stand-in for a long pre-UFC career, because no free source of full professional records was found.

### 4.2 Form check (for ranked fighters)
A ranked fighter fails if any of these is true:
- no UFC fight in 18 months (unless injured)
- lost their last fight and 3 or more of their last 5
- 2 of their last 3 fights were losses to clearly lower-rated opponents (opponent penalty 20, not title fights)
- Form under 20, or Form under 30 with 2 losses in the last 3

### 4.3 Badges (any stage can carry them)
- **On fire**: **Form 90+**, won the last 3 UFC fights, 3+ UFC fights, a fight within 12 months. To avoid flicker, drop it only below Form 79.
- **Cooling**: ranked, lost the last fight and 2 of the last 3, a fight within 24 months.
- **Inactive risk**: 18 to 24 months since the last fight, and not injured.
- **Out injured**: an active entry in the injury file (4.4).

### 4.4 Injury file (`data/ufc-fighter-status.json`)
```json
{"schema": 1, "fighters": {"tom-aspinall": {"status": "injured", "since": "2025-10-25",
  "detail": "Eye injuries from UFC 321; vacated the title Sept 2026",
  "source": "https://...", "checked": "2026-11-24"}}}
```
- An entry stops applying when the fighter fights after `since`, or 24 months after `since`.
- While it applies: no Inactive, Inactive risk or 18-month Slipping trigger; A = 1; the Out injured badge shows.
- Results still count. An injured fighter can't be On fire.
- The news scan writes suggestions only. The owner confirms each one.

### 4.5 Form rank and Division pulse
- **Form rank**: within each division, rank the scored and uninjured fighters ranked #1 to #15 by Form. Show "UFC #12 → form #1".
- **Division pulse**: the average displayed Form of the division's ranked #1 to #5. The hub also shows on fire, rising-star and slipping counts, and the division's hottest non-champion with their own Form.

### 4.6 Who appears
- Only certified fighters. Uncertified fighters who would otherwise qualify go to a **certification queue** in the output (54 on 21 Nov).
- Divisions: use the roster division, otherwise the most common division of their last 3 opponents (10 fighters needed this).

## 5. Suggested output file
`data/ufc-fighter-form.json`, written by a new `scripts/build-ufc-fighter-form.py`:
- Run it after results are imported and after the Wednesday rankings refresh.
- Like the tape builder, refuse to overwrite if the fighter count falls 30% or more.
- Make sure `scripts/build-site.mjs` ships the file.

```json
{"asOf": "2026-11-21", "weights": {...}, "formPool": 672,
 "fighters": {"valter-walker": {"form": 97, "points": 82,
   "parts": {"results": 1.0, "finishing": 1.0, "opposition": 0.15, "activity": 1.0, "performance": 0.87},
   "stage": "Contender", "why": [], "badges": ["On fire"], "rank": 12, "formRank": 1,
   "division": "heavyweight", "women": false, "certified": true, "age": 30, "debutAge": 28,
   "lossCap": null, "injured": null, "limited": false}},
 "certificationQueue": [...], "injurySuggestions": {...}}
```
The profile and the hub should both read this one file for Form, stage and badges.

## 6. Hub design (agreed with the owner)
- **Canvas:** https://claude.ai/artifact/WhzNZwsNUAaRNXxcphZYEz. Phone: "B v4" (`B4-Hub.dc.html`, 390 px). Desktop: "Desktop · Fighters hub" (`Desktop-Hub.dc.html`, 1280 px, responsive).
- **Look:** site tokens (cream #f8f4ed, ink #111013, red #cf1824, gold #f3c332), Unbounded headings, DM Sans body, dark top bar. Nothing under 12 px, and tap targets of 44 px.
- **Headshots:** seamless and borderless. The cutout fades out at the shoulders with a CSS mask (`linear-gradient(to bottom, #000 60%, transparent 97%)`), with no disc or frame. Slipping fighters are greyscale. With no cutout, show a soft silhouette.
- **Tap a fighter** (face or name): open `#fighter/ufc--<slug>`. Tapping a division name opens that division.
- **Every fighter shows two numbers:** Form (red, main) and Overall (the BEFN rating, smaller, from your field).
- **Last-five results:** green W, red L, grey D boxes, as elsewhere on the site.
- **Division bar**, then the **Overall** tab, with a Men / Women toggle (women's divisions have their own lists) and no champions:
  1. "Hottest right now" podium: the top 3 by Form, with the #1 in the middle and larger.
  2. On fire: a rail of cards (phone) or a grid (desktop).
  3. Rank vs form: a dark panel. Each row has a cutout, a track from #1 to #15, a ring for the UFC rank, a gold dot for the form rank and a bar between them. Green is "fighting above their rank" (top 4), blue is "ranked above their form" (top 4, scored and uninjured only).
  4. Rising stars (cards with W/L boxes), then Breakout (list rows).
  5. Slipping: greyscale cards with the first reason.
  6. Division pulse: tiles shaded from dark to red by top-5 Form. The hottest takes a double-width tile. Each tile has its big number labelled "Top-5 form", the on fire, rising and slipping counts as a short list, and the hottest fighter's cutout (linked) with their own Form.
- **Division tab** (Flyweight in the mockup): the champion hero (Form and Overall). Then the top 15: the UFC rank with a ▲/▼ arrow when the form rank differs by 3 or more, cutout, name with W/L boxes, stage chip, Form bar and number, Overall, form rank. Then "Coming through" (Rising star, Prospect and Breakout in the division).
- **Footer on every page:** the data date, the rankings date, one line on Form, and "not a prediction".

## 7. What the profile should change, for uniformity
1. The Form meter shows the Form in section 3.5 (same number as the hub).
2. Show the stage chip and badges (On fire, Cooling, Inactive risk, Out injured) near the rating, in the same colours as the hub. Stage chip colours: Champion gold on ink, Title contender white on ink, Contender ink on #efe9de, Slipping white on #3b5b9a, Rising star gold-brown, On fire red.
3. Show "UFC #n · form #m" for ranked fighters.
4. Use the same last-five W/L boxes and the same "not a prediction" wording.
5. Overall stays yours. The hub reads the same field and shows it in the same way.

## 8. Headshots (status)
- 676 new cutouts were made with the repo's own `scripts/build-ufc-cutouts.py`. The script gained `--all` and a second framing check, `check_framed`, which rejects missing shoulders, lopsided figures and soft halos. That makes 729 in total.
- They were delivered to the owner as `befn-ufc-cutouts-2026-11-24.zip` and are not yet in the repo. A separate Claude Code prompt covers committing them.
- 151 portraits under 300 px still need bigger originals.

## 9. Test cases (21 Nov data, Form v4; `tests/test_ufc_fighter_form.py`)
| Fighter | Form v1 → v2 → v3 → v4 | Parts v4 D/Q/M/A/S/C/T/Age | Stage, badges |
| --- | --- | --- | --- |
| Valter Walker (HW #12, 28) | 97 → 96 → 95 → 96 | 0.92 / 0.10 / 1.0 / 1.0 / 0.78 / 0.97 / 1.0 / 0.62 | Contender, On fire; form #1 |
| Elijah Smith (BW, unranked, 4-0, 24) | 99 → 97 → 92 → 96 | 0.90 / 0.33 / 1.0 / 1.0 / 0.99 / 0.84 / 0.01 / 0.88 | Rising star, On fire |
| Alexandre Pantoja (FLY #1, 36) | 62 → 60 → 79 → 78 | 0.56 / 0.46 / 0.77 / 1.0 / 0.86 / 0.97 / 0.99 / 0.12 | Contender, Cooling; loss cap 60 (title-fight decision loss, second straight loss) |
| Israel Adesanya (MW #9, 37) | 9 → 8 → 29 → 28 | 0.26 / 0.40 / 0.0 / 0.85 / 0.62 / 0.25 / 0.14 / 0.06 | Slipping ("lost last fight and 4 of last 5"), Cooling; loss cap 40 |
| Tom Aspinall (HW #1) | none | under 2 fights in 36 months | Title contender |
| Michael Page (MW, 39) | 86 → 91 → 73 → 58 | 0.62 / 0.73 / 1.0 / 1.0 / 0.67 / 0.07 / 0.15 / 0.0 | Established (too old for Rising star and Breakout) |
| Niko Price (WW, 1-4 in last 5, 37) | 65 → 24 → 43 → 44 | 0.26 / 0.13 / 0.0 / 1.0 / 0.93 / 0.42 / 0.23 / 0.06 | Established; below the median despite strong striking numbers |

Other checks: two runs give identical output. On the 21 Nov data with v4 the hub had 11 Champion, 38 Title contender, 94 Contender, 33 Slipping, 22 Rising star, 31 Prospect, 16 Breakout, 112 Inactive and 564 Established, plus 46 On fire (v3: 38, 95, 32, 21, 32, 17, 112, 563 and 49).

## 10. Still open
- The scale of the BEFN rating, and therefore whether Form and Overall can be compared (section 1).
- Whether your rating history should replace the internal Elo in 3.3.
- Saving weekly rankings to `data/ufc-rankings-history/` for a "moved this week" strip.
- Pre-UFC professional records (debut age is the stand-in for now).

Full reasoning, test results and earlier versions: the doc "Fighters hub: heat score and fighter categories" (https://claude.ai/artifact/RET8k9t5LaFKeuwahy23XW) and `claude/fighters-hub-plan-2026-11-24.md`.
