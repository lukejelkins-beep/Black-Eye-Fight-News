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

**Form v2 (owner request, 25 Nov 2026).** v1 counted every win the same whatever the opponent, scored finishing on
wins only, ignored how a decision was won or lost, and let one knockout carry a 1-4 run (Niko Price was Form 65). v2
values each fight by who it was against and how much of it the fighter won, adds momentum from the BEFN results
rating, and weights recent fights less steeply. Backtest (each fighter scored the day before every UFC bout from
earlier fights only, P left out because it is not point-in-time; does the higher Form win?):

| Bouts | v1 accuracy / log loss | v2 accuracy / log loss | BEFN pre-bout rating (reference) |
| --- | --- | --- | --- |
| 2022 to Nov 2026 (tuned on), n ≈ 1,410 | 56.7% / 0.684 | 57.0% / 0.675 | 59.9% / 0.659 |
| 2018 to 2021 (held out), n ≈ 330 | 49.2% / 0.693 | 52.1% / 0.690 | 58.0% / 0.673 |

Form is still not a prediction (the BEFN rating predicts better, as it should); the backtest checks that the score
tracks real quality rather than noise. **How much a recent loss matters:** steeper recency (v1's 1.00 to 0.40
positions, a 12-month half-life) and a bigger streak bonus both backtested *worse*; what matters about a loss is who
it was to and how it happened, not just that it was last. So v2 keeps the newest fight heaviest but flattens the
curve, and puts the weight on the manner of the loss (below) and on the loss cap.

### 3.1 Window and recency
- Take the fighter's UFC fights with a result (W, L, D) in the last 36 months, newest first, up to 5. No contests are skipped here but still count as activity (3.6).
- Base weights by position: 1.00, 0.90, 0.80, 0.70, 0.60 (v1: 1.00, 0.85, 0.70, 0.55, 0.40).
- Multiply each weight by 0.5^(months since the fight / 24), a 24-month half-life (v1: 18). A fight 1 month old and a fight 30 months old in 5th place differ by about 2.4 times.
- Every part below is a weighted average using these weights. S is the sum of the weights.
- Fewer than 2 fights in the window: **no Form**. Show "limited data", never an estimate.
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
`Form points = 100 × (0.25 R + 0.30 D + 0.15 Q + 0.10 M + 0.10 A + 0.10 P)`. A part with no data (M or P) is left out and the rest re-weighted.

| Part | How it scores |
| --- | --- |
| **R, Results** | Weighted average of v. Then +0.02 per win in the current streak (at most +0.06), or −0.02 per loss in a losing run after the first (at most −0.06). Kept within 0 to 1. |
| **D, Dominance** | Weighted average of d over every fight, wins and losses. On its own the most predictive part (57.7% in the backtest; v1's wins-only finishing 51.9%). |
| **Q, Opposition** | Weighted average of q for wins, q/2 for draws and 0.2 q for losses (credit for facing the best, much less than beating them). |
| **M, Momentum** | How far the BEFN results rating moved across the window: 0.5 + (rating after the newest fight − rating before the oldest) / 240, kept within 0 to 1. A 120-point rise is 1.0. |
| **A, Activity** | 1.0 if their last UFC fight was within 6 months, falling evenly to 0 at 18 months. Uses the most recent fight of any kind, including no contests. While out injured, A is held at 1 (4.4). |
| **P, Performance** | The average of two within-division percentiles from the last 5 fights: strike differential per minute (`diffPm`) and control share (`ctrlShare`). |

### 3.3a Strength on the night
- From the BEFN results rating's own point-in-time history (`scripts/ufc_ratings.py` `results_walk`): each fighter's rating **before** each bout.
- An opponent's strength in a bout is the percentile p of their pre-bout rating among all pre-bout ratings in the 36 months before that bout. It maps to `clamp((p − 0.30) / 0.68, 0, 1)`, so the top 2% score about 1.0 and the median about 0.3. An unknown opponent scores 0.3.

### 3.4 Loss cap
If the last fight was a loss, the points score is capped at **85 − opponent penalty − manner penalty − losing-run penalty − repeat-stoppage penalty**. The cap lifts with the next win.

- Opponent penalty: 0 if the opponent was rated higher on the night, or it was a title fight. 10 if rated up to 100 points lower. 20 if more than 100 lower.
- Manner penalty: 0 for a split or majority decision, 5 for unanimous (or a DQ), 10 for a finish in round 3 or later, 15 for a finish in round 1 or 2.
- Losing run (v2): 5 for a second straight loss, 10 for a third or more.
- Repeat stoppage (v2): 5 if the last loss was a KO/TKO or submission and the fighter was also stopped in another loss in the 24 months before it.

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

## 9. Test cases (21 Nov data, Form v2; `tests/test_ufc_fighter_form.py`)
| Fighter | Form v1 → v2 | Parts v2 R/D/Q/M/A/P | Stage, badges |
| --- | --- | --- | --- |
| Valter Walker (HW #12) | 97 → 96 | 0.84 / 1.0 / 0.10 / 1.0 / 1.0 / 0.85 | Contender, On fire; form #1 |
| Elijah Smith (BW, unranked, 4-0) | 99 → 98 | 0.89 / 0.92 / 0.38 / 1.0 / 1.0 / 0.86 | Rising star, On fire |
| Alexandre Pantoja (FLY #1) | 62 → 55 | 0.44 / 0.42 / 0.31 / 0.33 / 1.0 / 0.73 | Contender, Cooling; loss cap 75 (title-fight decision loss, second straight loss) |
| Israel Adesanya (MW #9) | 9 → 7 | 0.06 / 0.01 / 0.19 / 0.0 / 0.85 / 0.26 | Slipping ("lost last fight and 4 of last 5"), Cooling; loss cap 55 |
| Tom Aspinall (HW #1) | none | under 2 fights in 36 months | Title contender |
| Michael Page (MW, 39) | 86 → 92 | n/a | Established (too old for Rising star and Breakout) |
| Niko Price (WW, 1-4 in last 5) | 65 → 30 | 0.32 / 0.33 / 0.06 / 0.16 / 1.0 / 0.34 | Established; v1 scored his one KO win as finishing 1.0 |

Other checks: two runs give identical output. On the 21 Nov data with v2 the hub had 11 Champion, 36 Title contender, 99 Contender, 30 Slipping, 22 Rising star, 31 Prospect, 14 Breakout, 112 Inactive and 566 Established, plus 53 On fire (v1: 35, 100, 30, 18, 32, 10, 112, 573 and 41). Median change in shown Form 7 points.

## 10. Still open
- The scale of the BEFN rating, and therefore whether Form and Overall can be compared (section 1).
- Whether your rating history should replace the internal Elo in 3.3.
- Saving weekly rankings to `data/ufc-rankings-history/` for a "moved this week" strip.
- Pre-UFC professional records (debut age is the stand-in for now).

Full reasoning, test results and earlier versions: the doc "Fighters hub: heat score and fighter categories" (https://claude.ai/artifact/RET8k9t5LaFKeuwahy23XW) and `claude/fighters-hub-plan-2026-11-24.md`.
