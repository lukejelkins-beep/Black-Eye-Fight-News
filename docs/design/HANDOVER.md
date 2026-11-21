# Handover: where BEFN stands (21 Nov 2026)

Written so a fresh chat or tool can continue without the old conversation. Read `AGENTS.md`, `CLAUDE.md` and `docs/design/README.md` first. `DECISIONS.md` has the reasoning for every change; `PHASE-1.md` and `PHASE-2.md` have the plans.

## Standing rules (from the owner)
- Nothing merges to `main`, or to the Sumo preview branch, until the owner says "Merge N". Open a PR, state how it was verified and what was not, then wait.
- Visual changes are checked in a real browser at 390 px and 1280 px, not only by tests.
- Record decisions in `docs/design/DECISIONS.md` (newest first under the date heading).
- Say plainly when something was not verified. A wrong claim earlier (a "preview" of PR #345 that did not exist, because PR previews are off) was corrected and the owner prefers that honesty.
- Personal, non-commercial site. Sources are original public posts and publisher feeds, always with source link and date.

## Where things live
- Repo: `lukejelkins-beep/Black-Eye-Fight-News`.
- Live site: Render `black-eye-fight-news` (`srv-dbnftjqjnfac73c9746g`, branch `main`), https://black-eye-fight-news.onrender.com.
- Sumo preview: Render `befn-sumo-preview` (`srv-dbs37n6k1f9s73859fog`, branch `feat/sumo-section-test-20261114`), https://befn-sumo-preview.onrender.com. Sumo changes go by PR into that branch; its build runs the sumo tests, then `node scripts/build-site.mjs`.
- Render workspace: `tea-dbnfkshsrm7s739a943g`.
- Deploys of the main site: the service's auto-deploy trigger is `checksPass` and PR previews are off. Deploys in practice come from the GitHub workflow "BEFN conditional Render recovery" (deploy hook after "BEFN release readiness", and every 2 hours). If the `RENDER_DEPLOY_HOOK_URL` secret ever breaks, deploys stop; `trigger_deploy` in the Render tool is the manual fallback.

## Done and merged
**Phase 1 (shared look and navigation): complete.** Shared design tokens, header and nav, Fights page (#345, expanded fight cards #346), Fighters page (#347), News page tidy (#348, owner chose "keep it dark, tidy only"), Sumo country discs and head-to-head (#341, into the Sumo preview branch).

**Phase 2 (live news and Fight Talk): partly done.**
- #349 Fight Talk shows per-platform freshness (state, last check, newest post age; stale posts hidden from Live; Instagram shown as paused).
- #350 Automatic Bluesky account finder (GitHub workflow `find-bluesky-accounts`, writes `data/bluesky-candidates.json`). First run: 0 verified, 81 name-only. Needs a second proof (official site or promotion page linking the Bluesky account) before any account is added. The owner parked this: "we will come back to it".
- #351 X collector reads fighters on upcoming cards (next 10 days) and recent results (last 3 days) first; same US$1.80 internal ledger cap, 65-minute cooldown, groups of 8, no retries.
- #352 News page shows "Updated N min ago" and ticks every 30 seconds. News already re-checks every 5 minutes with a "Show fresh updates" button; Fights, Results and Fight Talk already poll. Site cache is about 5 minutes, so "live" means within about 10 minutes.

## Next, in order
1. **Related news on cards** (Phase 2 step 3): latest three stories naming a fighter or fight on cards and fighter pages. Exact or close-spelling matches only, using the results importer's name rules.
2. **Fight Talk page filters** (step 4): by fighter, promotion and sport, same labels as the Fights page.
3. **Publisher embeds:** check all 32 feeds on a rotation (currently 3 per run).
4. **Roster gaps:** 55 of 215 fighters have no verified account; fill from official promotion pages and fighters' own sites, keeping the supporting link. Unsupported stays blank.
5. **Schedule review in about a week:** re-run the source health report and retire feeds that never produce (including the Bing News feeds). Set job frequencies from that data.
6. **Bluesky second proof** (parked by the owner).
7. **Alerts:** an open question to the owner, not started.

## Sumo design (waiting on the owner)
The owner wants the Sumo country discs redone with their own transparent PNGs (landmark or national symbol per country: Ukraine, Mongolia, Kazakhstan, China, Russia; Japan stays), one placed top-left of each disc. Decisions already made: keep the invisible fighter cutouts and make the discs larger. Open choices: the Russia option and Kazakhstan headwear. Work starts when the PNGs arrive; deliver as a PR into the Sumo preview branch and wait for "Merge N".

## Technical notes that save time
- Legacy CSS uses ID selectors and `!important`. New overrides need specificity like `#main #upcoming-cards-root ...` or `#main .fighters-unified #fighterGrid ...`, plus `-webkit-text-fill-color`, and sometimes a reset of old fixed sizes (for example `.fighter-tag`). `::before` and `::after` must be separate selector lists; they are invalid inside `:is()`.
- Bump the `?v=` cache-bust on any changed asset in `index.html` (and `sumo.html` for Sumo); `sw.js` lists assets too.
- Local testing: `python3 -m http.server 8767` (start with `setsid nohup ... &` or it dies), Playwright (Python) with `/usr/bin/google-chrome`. The Sumo branch can be served from a git worktree.
- Node tests (`.cjs`/`.mjs`) run directly with `node tests/<file>`. Four old tests fail identically on `main` and are not caused by recent work: `test-upcoming-cards`, `test-results-ui`, `test-results-card-order`, `test-ufc334-research`.
- Data files: `data/fight-talk-live.json`, `data/fight-talk-sources.json` (Bluesky accounts and X accounts), `data/fight-talk-roster.json` (215 fighters), `data/news-live.json`, `data/bluesky-candidates.json`.
- The Bluesky API cannot be reached from the Claude workspace (proxy 403), which is why the finder runs on GitHub.
- Design tokens: red `#cf1824`, gold `#f3c332`, cream `#f8f4ed`, ink `#111013`, dark band `#151115`; Barlow Condensed headlines, DM Sans body.

## Known loose ends
- Four old failing tests (above).
- Translation name quirks in Sumo; dead masthead CSS in `index.html`.
- Instagram stays links and embeds only (owner decision 19 Nov); no Meta Business Discovery setup.
- Guessed feed URLs earlier failed and nothing was changed; unreviewed feeds stay as they are until the one-week review.
