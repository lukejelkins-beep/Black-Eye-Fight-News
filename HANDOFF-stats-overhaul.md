# Handoff: BEFN ratings & statistics overhaul (2026-11-22)

Paste this into a new chat to continue. Repo: `lukejelkins-beep/Black-Eye-Fight-News`, local checkout `~/Documents/ChatGPT/fight website/befn-qa`. Live site: https://black-eye-fight-news.onrender.com (Render deploys `main` once checks pass, about 4–8 min).

## Rules that apply to every change
- Read `AGENTS.md`, `CLAUDE.md` and `docs/design/README.md` (+ DIRECTION.md, WORKING-AGREEMENT.md, DECISIONS.md) first.
- **Nothing merges to `main` until the owner says "Merge N".** Open a PR, say what was and was not verified, then wait.
- Visual changes: check in a real browser at **390 px and 1280 px**, put screenshots in the PR, record the decision in `docs/design/DECISIONS.md`.
- **No new paid provider workers.** UFCalendar is cancelled; the collector workflow owns paid calls. Use saved data or free sources (UFCStats CSV export).
- Another session runs the site redesign phases (Fights, News, Fighters pages, Phase 3 fight-card snapshots/scores). It edits `assets/fighter-insights.js` and `index.html` too, so **merge `main` into your branch before asking to merge**.

## Environment
- No Node on PATH: use `~/Documents/Codex/2026-11-15/befn-codex-engineering-onboarding-you-are/work/node-v22.16.0-darwin-arm64/bin/node`. GitHub CLI at `/usr/local/bin/gh` (signed in).
- Local preview: copy the repo to the session scratchpad and serve with `python3 -m http.server` (the preview launcher cannot read ~/Documents).
- CI's Playwright browser has **no web fonts**, so wide fallback text must still fit (e.g. "Unrated").
- PR workflows only run for PRs into `main`, and not at all while the PR conflicts with `main`.
- Write PR bodies to a file with a **quoted** heredoc (`<<'EOF'`); an unquoted one runs backticked words as commands.

## What shipped (all live)
| Stage | PR | What |
|---|---|---|
| 1 | #322 | `scripts/build-ufc-stats.py` → `data/ufc-stats/` (index, names, divisions, per-fighter files). 4,848 UFC fights with round stats, 2,249 with scorecards, 1,111 active fighters. Windows: last 5 / 12m / 36m / career / recency-weighted. Reference date = latest saved UFC event (deterministic). Hourly in `build-ufc-stats.yml`. |
| 2 | #324, #334 | Official divisions snapshot `data/ufc-divisions.json` (rankings of 2026-11-17). Paid refresh workflow removed (#334). |
| 3 | #327 | Ratings v2 in `scripts/ufc_ratings.py`: exact port of the JS engine (`assets/fighter-power-index.js`), career weighted to recent fights, roster + division percentiles (1st–99th), opponent-adjusted recent form, "What drives this" drivers. CI parity check `tests/ufc-ratings-parity.cjs` must stay green. |
| — | #331, #333 | Site build publishes `data/ufc-stats/` (DATA_DIRS in `scripts/build-site.mjs`); release check updated for the new nav (deploys had been blocked). |
| 4 | #344 | Fighter profile in the light, borderless Sumo look (`assets/fighter-stats-profile.js`, `assets/fighter-profile-pro.css`): at a glance, round-by-round + judges' scorecards, full UFC history, window switch, compare with division average. |
| 5 | #367 | UFC stats page (`#leaderboards`): 22 boards (6 ratings + 16 stats), division filter, time window. Stat boards: 3 full-stat fights + 15 cage minutes; rating boards: 5 fights. Data `data/ufc-stats/leaderboards.json`. Divisions resolved official roster → latest labelled bout (`data/ufc-bout-weight-classes.json`, free) → reviewed: 958/1,111 fighters (was 431). |

## Open items
1. **Official ranks and champion tags are frozen** at the 2026-11-17 snapshot (`data/ufc-divisions.json`). Divisions themselves stay current via the free weight-class file. A free source for official rankings (e.g. UFC.com rankings page) is the owner's call.
2. **Division source mismatch:** the card-score builder (other session) uses latest-bout division only; the stats build uses the official roster first. They differ for 13 fighters (e.g. Pereira, Usman).
3. **Luis Gurule** needs his six-bout UFC career re-certified from sources (his wave43 certificate is stale after UFC 334; the test now expects it to fail closed).
4. Ideas not started: ratings/strike trends over time (Sumo-style "Analysis" charts), opponent-strength adjustment beyond recent form.

## Key files
- Build: `scripts/build-ufc-stats.py`, `scripts/ufc_ratings.py`, `scripts/refresh-ufc-divisions.py` (unscheduled), `scripts/build-site.mjs`
- Front end: `assets/fighter-insights.js` (profiles, leaderboards `renderV3Boards`), `assets/fighter-stats-profile.js`, `assets/fighter-profile-pro.css`, `assets/ufc-stat-leaderboards.css`, `assets/app-inline-2.js` (dialog shell, `renderLeaderboards`)
- Tests: `tests/test_ufc_stats_build.py`, `tests/test_ufc_ratings.py`, `tests/test_ufc_divisions.py`, `tests/ufc-ratings-parity.cjs`, `tests/test-fighter-stats-profile.cjs`, `tests/test-ufc-leaderboards-page.mjs`, `tests/test-ufc-profile-visual.mjs` (Playwright, CI only)
- Decisions: `docs/design/DECISIONS.md`; screenshots in `docs/design/screenshots/`
