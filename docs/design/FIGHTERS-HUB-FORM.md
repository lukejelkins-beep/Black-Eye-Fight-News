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

### 3.1 Window and recency
- Take the fighter's UFC fights with a result (W, L, D) in the last 36 months, newest first, up to 5. No contests are skipped here but still count as activity (3.6).
- Base weights by position: 1.00, 0.85, 0.70, 0.55, 0.40.
- Multiply each weight by 0.5^(months since the fight / 18), an 18-month half-life.
- Every part below is a weighted average using these weights. S is the sum of the weights.
- Fewer than 2 fights in the window: **no Form**. Show "limited data", never an estimate.

### 3.2 Points score (0 to 100)
`Form points = 100 × (0.30 R + 0.30 F + 0.20 Q + 0.10 A + 0.10 P)`. Finishing was raised to 30% at the owner's request.

| Part | How each fight scores |
| --- | --- |
| **R, Results** | Win 1. Draw 0.5. A loss to a fighter rated higher on the night, or any title-fight loss, scores 0.4 by decision or 0.2 if finished. Any other loss scores 0. Then add 0.05 per win in the current streak (at most +0.15) and cap at 1. |
| **F, Finishing** (wins only, weighted over wins) | KO, TKO, submission or DQ: round 1 = 1.00, round 2 = 0.85, round 3+ = 0.70. Unanimous decision 0.40. Split or majority decision 0.15. No wins gives 0. |
| **Q, Opposition** (losses score 0) | The opponent's strength **on the night** (3.3). |
| **A, Activity** | 1.0 if their last UFC fight was within 6 months, falling evenly to 0 at 18 months. Uses the most recent fight of any kind, including no contests. While out injured, A is held at 1 (4.4). |
| **P, Performance** | The average of two within-division percentiles from the last 5 fights: strike differential per minute (`diffPm`) and control share (`ctrlShare`). |

### 3.3 Strength on the night (replaces "today's rank")
- Replay every UFC bout in the stats build in date order with a simple Elo (start 1500, K = 32; dedupe bouts by `boutId`). Record each fighter's rating **before** each bout.
- An opponent's strength in a bout is the percentile p of their pre-bout rating among all pre-bout ratings in the 36 months before that bout. It maps to `clamp((p − 0.30) / 0.68, 0, 1)`, so the top 2% score about 1.0 and the median about 0.3.
- **If your BEFN rating has its own point-in-time history, use that instead of this internal Elo.** This Elo exists only because no rating history existed. One rating engine is better than two.

### 3.4 Loss cap
If the last fight was a loss, the points score is capped at **85 − opponent penalty − manner penalty**. The cap lifts with the next win.

- Opponent penalty: 0 if the opponent was rated higher on the night, or it was a title fight. 10 if rated up to 100 Elo points lower. 20 if more than 100 lower.
- Manner penalty: 0 for a split or majority decision, 5 for unanimous, 10 for a finish in round 3 or later, 15 for a finish in round 1 or 2.

### 3.5 Displayed Form (what readers see)
- **Form = the percentile of the points score among fighters with a UFC fight in the last 24 months, rounded and capped at 99.** On 21 Nov that pool was 672 fighters.
- Wording everywhere: "Form 90 means going better right now than 90% of active UFC fighters." Always add that it describes recent results and is not a prediction.
- The profile's Form meter shows this same number.

### 3.6 Activity and no contests
A no contest counts as a fight for activity and inactivity. This was found in testing: Aspinall's no contest against Gane had been ignored, which made him look inactive.

## 4. Stages, badges and statuses

### 4.1 Stages (checked in this order; the first match wins)
1. **Champion**: rank 0 and not interim.
2. **Slipping**: ranked #1 to #15 (not interim) and fails the form check (4.2). The UFC number stays on the page, along with the reason.
3. **Title contender**: interim champion, or ranked #1 to #5, who won their last fight or has points 70+ (shown Form 82+).
4. **Contender**: ranked #1 to #15. With no Form, add "limited data".
5. **Inactive**: unranked, no UFC fight in 24 months (time out injured doesn't count).
6. **Rising star**: unranked, 3 to 6 UFC fights, debut within 36 months, at most 1 loss, won last fight, points 65+ (shown 74+), age 32 or under, UFC debut before age 30.
7. **Prospect**: unranked, 1 to 3 UFC fights, unbeaten in the UFC, age 30 or under, UFC debut before age 30.
8. **Breakout**: unranked, points 68+ (shown 79+), won last fight and 3 of last 4, a fight within 18 months, 10 or fewer UFC fights, age 33 or under.
9. **Established**: everyone else.

Unknown age doesn't block Rising star or Prospect, but they show "age unknown". Debut age of 30 or over is the stand-in for a long pre-UFC career, because no free source of full professional records was found.

### 4.2 Form check (for ranked fighters)
A ranked fighter fails if any of these is true:
- no UFC fight in 18 months (unless injured)
- lost their last fight and 3 or more of their last 5
- 2 of their last 3 fights were losses to clearly lower-rated opponents (opponent penalty 20, not title fights)
- points under 30 (shown Form under 20), or points under 40 (shown under 30) with 2 losses in the last 3

### 4.3 Badges (any stage can carry them)
- **On fire**: points 75+ (shown **Form 90+**), won the last 3 UFC fights, 3+ UFC fights, a fight within 12 months. To avoid flicker, drop it only below points 68.
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

## 9. Test cases (21 Nov data; use as fixed tests)
| Fighter | Points | Form shown | Parts R/F/Q/A/P | Stage, badges |
| --- | --- | --- | --- | --- |
| Valter Walker (HW #12) | 82 | 97 | 1.0 / 1.0 / 0.15 / 1.0 / 0.87 | Contender, On fire; form #1 |
| Elijah Smith (BW, unranked, 4-0) | 84 | 99 | 1.0 / 0.89 / 0.40 / 1.0 / 0.86 | Rising star, On fire |
| Alexandre Pantoja (FLY #1) | 58 | 61 | 0.55 / 0.70 / 0.16 / 1.0 / 0.74 | Contender, Cooling; loss cap 80 (title-fight decision loss to Van) |
| Israel Adesanya (MW #9) | 12 | 4 | 0.04 / 0.0 / 0.0 / 0.85 / 0.25 | Slipping ("lost last fight and 4 of last 5"), Cooling; loss cap 60 |
| Tom Aspinall (HW #1) | none | none | under 2 fights in 36 months | Title contender, Out injured |
| Michael Page (MW, 39) | 70 | 82 | n/a | Established (too old for Rising star and Breakout) |

Other checks: two runs give identical output. On the 21 Nov data the certified hub had 11 Champion, 35 Title contender, 99 Contender, 29 Slipping, 20 Rising star, 41 Prospect, 8 Breakout, 61 Inactive and 470 Established, plus 40 On fire.

## 10. Still open
- The scale of the BEFN rating, and therefore whether Form and Overall can be compared (section 1).
- Whether your rating history should replace the internal Elo in 3.3.
- Saving weekly rankings to `data/ufc-rankings-history/` for a "moved this week" strip.
- Pre-UFC professional records (debut age is the stand-in for now).

Full reasoning, test results and earlier versions: the doc "Fighters hub: heat score and fighter categories" (https://claude.ai/artifact/RET8k9t5LaFKeuwahy23XW) and `claude/fighters-hub-plan-2026-11-24.md`.
