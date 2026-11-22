# Handover: where BEFN stands (22 Nov 2026)

Replaces the 21 Nov version. Written from the central audit chat, merging the design, Sumo and UFC/data chat handovers. Read `AGENTS.md`, `CLAUDE.md` and `docs/design/README.md` first. `DECISIONS.md` has the reasoning for every change. Where a claim here conflicts with `main`, a completed Actions run or the Render deploy, those win.

## Standing rules (from the owner)
- Nothing merges to `main`, or to the Sumo preview branch, until the owner says "Merge N". Open a PR, state how it was verified and what was not, then wait.
- Visual changes are checked in a real browser at 390 px and 1280 px, not only by tests.
- Record decisions in `docs/design/DECISIONS.md` (newest first under the date heading).
- Say plainly when something was not verified. No "preview" or "live" claims without checking; PR previews are off.
- Personal, non-commercial site. Images need a recorded source and rights status; the owner stated on 2026-11-22 that every image the repository holds is approved and cleared (inventory in `IMAGE-GUIDE.md`).
- Where the owner's most recent design decision conflicts with a written rule, the recent decision wins and the rule is updated.

## State at 22 Nov (from the chat handovers; verify against the repo)
- **Merged:** Phase 1 look and nav; Phase 2 freshness, related news (#354); Phase 3 steps 1-4 (snapshots, scores on by default, kill switch `BEFN_FEATURES.snapshotScores`); UFC stats page stage 5; fighter profiles restyle (#362 and related); Sumo on `main` as a snapshot (#366); Sumo landmarks decision (#380).
- **On the Sumo preview branch only:** landmark cut-outs (#379; all four approved by the owner on 2026-11-22, so they now show), Sumo Stories hub (#385). The 30-minute basho refresh still commits to that branch.
- **Open, waiting on "Merge N":** #382 home landing page (design D); #386 divisions fix; #377 fighter "Over time" chart. #378 is a draft mock-up, not the approved direction. Site-wide style branch `feat/site-style-20261122` is unfinished and not yet a PR. Other open PRs are UFC certification and research drafts.
- **Design direction:** see `DIRECTION.md` (updated 22 Nov: cream, Unbounded, dark top bar). Unbounded is not on `main` yet.

## Counts: where each one comes from
Do not copy a count between files. Each has one source:
- **Certification (783 cohort):** the latest completed, successful, full-cohort strict Stage 3 audit (`scripts/ufc-36-month-stage3-progress.mjs`). Figures in older docs and PRs (426, 429, 650, 747 certified) are dated snapshots, not current. A local 747 reached on 17-18 Nov was not CI-verified.
- **Fighters with stats (about 1,111) and with a division (958):** `data/ufc-stats` build and `data/ufc-bout-weight-classes.json`.
- **Fight Talk roster (215):** `data/fight-talk-roster.json`.
Each page names which population it uses.

## Owner decisions waiting
- Confirm the direction in `DIRECTION.md` and that #378 is not it.
- Sumo: when the full area moves from the preview branch to `main`, whether the refresh moves too, and when `noindex` comes off.
- Pereira's division (official rankings say light heavyweight; UFC.com says heavyweight) and ranking UFC 335 against the contracted division.

## Where things live
- Repo: `lukejelkins-beep/Black-Eye-Fight-News`.
- Live site: Render `black-eye-fight-news` (`srv-dbnftjqjnfac73c9746g`, branch `main`), https://black-eye-fight-news.onrender.com.
- Sumo preview: Render `befn-sumo-preview` (`srv-dbs37n6k1f9s73859fog`, branch `feat/sumo-section-test-20261114`), https://befn-sumo-preview.onrender.com. Sumo changes go by PR into that branch; its build runs the sumo tests, then `node scripts/build-site.mjs`.
- Render workspace: `tea-dbnfkshsrm7s739a943g`.
- Deploys of the main site: the service's auto-deploy trigger is `checksPass` and PR previews are off. Deploys in practice come from the GitHub workflow "BEFN conditional Render recovery" (deploy hook after "BEFN release readiness", and every 2 hours). If the `RENDER_DEPLOY_HOOK_URL` secret ever breaks, deploys stop; `trigger_deploy` in the Render tool is the manual fallback.

## Done and merged (to 21 Nov; see State above for 22 Nov)
**Phase 1 (shared look and navigation): complete.** Shared design tokens, header and nav, Fights page (#345, expanded fight cards #346), Fighters page (#347), News page tidy (#348, owner chose "keep it dark, tidy only"), Sumo country discs and head-to-head (#341, into the Sumo preview branch).

**Phase 2 (live news and Fight Talk): partly done.**
- #349 Fight Talk shows per-platform freshness (state, last check, newest post age; stale posts hidden from Live; Instagram shown as paused).
- #350 Automatic Bluesky account finder (GitHub workflow `find-bluesky-accounts`, writes `data/bluesky-candidates.json`). First run: 0 verified, 81 name-only. Needs a second proof (official site or promotion page linking the Bluesky account) before any account is added. The owner parked this: "we will come back to it".
- #351 X collector reads fighters on upcoming cards (next 10 days) and recent results (last 3 days) first; same US$1.80 internal ledger cap, 65-minute cooldown, groups of 8, no retries.
- #352 News page shows "Updated N min ago" and ticks every 30 seconds. News already re-checks every 5 minutes with a "Show fresh updates" button; Fights, Results and Fight Talk already poll. Site cache is about 5 minutes, so "live" means within about 10 minutes.

## Next, in order
1. **Related news on cards** (Phase 2 step 3, built in PR for feat/related-news-on-cards-20261121, awaiting "Merge N"): latest three stories naming a fighter or fight on cards and fighter pages. Exact or close-spelling matches only, using the results importer's name rules.
2. **Fight Talk page filters** (step 4): built in PR for feat/fight-talk-filters-20261121 (stacked on the related-news branch), awaiting "Merge N".
3. **Publisher embeds:** check all 32 feeds on a rotation (currently 3 per run).
4. **Roster gaps:** 55 of 215 fighters have no verified account; fill from official promotion pages and fighters' own sites, keeping the supporting link. Unsupported stays blank.
5. **Schedule review in about a week:** re-run the source health report and retire feeds that never produce (including the Bing News feeds). Set job frequencies from that data.
6. **Bluesky second proof** (parked by the owner).
7. **Alerts:** an open question to the owner, not started.

## Phase 3 (planned, waiting on the owner)
Fighter snapshots on upcoming UFC cards: see `PHASE-3.md`. Awaiting the owner's answers to three open questions before step 1.

## Sumo design (waiting on the owner)
**Update 22 Nov:** four photo cut-outs (RU, UA, MN, KZ) are built in PR #379 into the Sumo preview branch. All four are approved in `data/sumo/landmarks.json` (owner, 2026-11-22), so they show. The note below is the original brief.

The owner wants the Sumo country discs redone with their own transparent PNGs (landmark or national symbol per country: Ukraine, Mongolia, Kazakhstan, China, Russia; Japan stays), one placed top-left of each disc. Decisions already made: keep the invisible fighter cutouts and make the discs larger. Open choices: the Russia option and Kazakhstan headwear. Work starts when the PNGs arrive; deliver as a PR into the Sumo preview branch and wait for "Merge N".

## Technical notes that save time
- Legacy CSS uses ID selectors and `!important`. New overrides need specificity like `#main #upcoming-cards-root ...` or `#main .fighters-unified #fighterGrid ...`, plus `-webkit-text-fill-color`, and sometimes a reset of old fixed sizes (for example `.fighter-tag`). `::before` and `::after` must be separate selector lists; they are invalid inside `:is()`.
- Bump the `?v=` cache-bust on any changed asset in `index.html` (and `sumo.html` for Sumo); `sw.js` lists assets too.
- Local testing: `python3 -m http.server 8767` (start with `setsid nohup ... &` or it dies), Playwright (Python) with `/usr/bin/google-chrome`. The Sumo branch can be served from a git worktree.
- Node tests (`.cjs`/`.mjs`) run directly with `node tests/<file>`; there is no runner, so loop over `tests/*.cjs tests/*.mjs` yourself. macOS has no `timeout`, so give that loop its own watchdog or a hung test takes the run with it.
- Test baseline on `main` at 7f5331cd (clean run of all 172 files, 22 Nov): **159 pass / 13 fail**. The failures are `test-upcoming-cards`, `test-results-ui`, `test-results-card-order`, `test-ufc334-research`, `ufc-ratings-parity`, `test-build-site`, `test-render-recovery-contract`, `test-ufc-36-month-independent-evidence`, `test-ufc-profile-visual` and the four Sumo UI files (`test-sumo-editorial`, `test-sumo-profile-refinements`, `test-sumo-roster-ux`, `test-sumo-ux-refinement`). The earlier "four old tests" note counted only the four that two sessions happened to run; it was never the whole suite. Compare a branch against this list rather than expecting green.
- `test-build-site` is red for two reasons worth fixing separately: `data/sumo` is published but missing from `DATA_DIRS`, and the build is 156 MB against the test's 80 MB limit.
- The Python tests cannot run on this Mac: `pytest` is not installed for any python3 here, so they only run in CI.
- Data files: `data/fight-talk-live.json`, `data/fight-talk-sources.json` (Bluesky accounts and X accounts), `data/fight-talk-roster.json` (215 fighters), `data/news-live.json`, `data/bluesky-candidates.json`.
- The Bluesky API cannot be reached from the Claude workspace (proxy 403), which is why the finder runs on GitHub.
- Design tokens: see `DIRECTION.md`.

## Known loose ends
- Thirteen failing tests on `main` (above), including `test-build-site`'s `DATA_DIRS` gap and size limit.
- Translation name quirks in Sumo; dead masthead CSS in `index.html`.
- Instagram stays links and embeds only (owner decision 19 Nov); no Meta Business Discovery setup.
- Guessed feed URLs earlier failed and nothing was changed; unreviewed feeds stay as they are until the one-week review.
