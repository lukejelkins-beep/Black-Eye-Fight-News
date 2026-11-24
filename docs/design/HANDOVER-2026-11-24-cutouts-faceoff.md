# Handover: UFC cutouts, face-off snapshots, profile band, flags (24 Nov 2026)

From the chat that started with "add the new UFC headshot cutouts". Read `AGENTS.md`, `CLAUDE.md` and `docs/design/README.md` first; `DECISIONS.md` (24 Nov entries) has the reasoning for every change below. Where this file disagrees with `main`, a completed Actions run or the live site, those win.

## How the owner likes to work (this chat)
- **Give a selector whenever a decision is needed** (owner: "Give me a selector when decisions need to be made"). One clear recommended option first.
- Nothing merges until the owner says "Merge N" (or picks "Merge N" in a selector). Draft PR first, say what was and was not verified.
- Check visual work in a real browser at 390 px and 1280 px, and confirm on the live site after the deploy.
- The owner prefers not to run terminal commands; when something needs running, offer to run it in the session.

## What shipped (all merged and live-checked unless noted)
| PR | What | Notes |
| --- | --- | --- |
| #469 | 676 UFC cutouts from the owner's zip (729 then) | 53 existing cutouts untouched; `build-ufc-cutouts.py --all` and `check_framed()` |
| #472 | Fight snapshot "face-off" (option B of 3 mock-ups) | Open snapshot hides the card row; equal picture boxes; zero-based height/reach bars; tape left, analysis right from 1100 px; fixed "Vanprofile", empty disc, missing record, double weight class |
| #476 | Face-off for finished UFC bouts on Results | Winner tagged, loser greyed; records "after the fight"; no pre-fight analysis or form pills (no fight-time numbers held) |
| #479 | Profile hero "dark band" (P2 of 3 mock-ups) | UFC fighters with a cutout: cutout shown through the profile's own portrait frame over a faded half-flag. Non-UFC and no-cutout profiles unchanged |
| #482 | Country flags 58 → 710 | `scripts/build-ufc-fighter-countries.py` from Wikipedia "List of current UFC fighters" (saved wikitext); 51 flag-icons SVGs; `gb-eng/gb-sct/gb-wls` accepted |
| #484 | Profile QA runs locally; portrait counts only when its frame is on screen | `tests/test-ufc-profile-visual.mjs` header says how to run it |
| #486 | Flags for Korean surname-first and Polish "ł" names (+10 fighters) | Also corrected the Topuria note |
| #487 | 137 larger ESPN headshots, 114 more cutouts (843), `scripts/pull-ufc-hires-photos.py` | Run in the session at the owner's request; owner checked contact sheets and cleared the photos; 2 cutouts dropped for specks |

Mock-ups for #472 and #479 are on the private canvas https://claude.ai/artifact/RUw6CY47K3kHs5biqJyv2f (pages "Tale of the tape" and "Profile hero").

## Where things are now (counts from the files, 24 Nov)
- **UFC cutouts:** 843 kept of 907 in `data/ufc-cutout-register.json`; files in `assets/img/ufc-cutouts/`.
- **Countries:** 724 keys in `data/ufc-fighter-countries.json` (some are alternative spellings of the same fighter). Flags in `assets/img/flags/` (flag-icons 7.6.0, MIT).
- **UFC photos:** 901 in `data/ufc-image-register.json`; the 137 swapped ones keep `previousSourceUrl`.

## How the pieces fit
- **Snapshot face-off:** `assets/snapshot-b.js` (`tapeHTML`, `barWidths`, `figureHTML`) and `assets/snapshot-b.css`, scoped to `#upcoming-cards-root` and `#results-content`. Wiring in `assets/fighter-insights.js`: `renderSnapshotB` (upcoming), `renderResultB` (results), `upgradeRowPhotos` (cutouts in the closed card row), `figureFor` (cutout or photo plus flag).
- **Profile band:** `heroCutout()` in `assets/fighter-insights.js` (called from `layoutProDialog`, and when the cutout register or country list loads); styles at the end of `assets/fighter-profile-pro.css` under `.befn-pro-hero.has-cut`. It swaps the portrait frame's image for the cutout, so the frame's loaded/"Photo unavailable" states and the profile QA keep working. Do not hide the frame (that broke CI once).
- **Photos and cutouts pipeline:** `scripts/pull-ufc-hires-photos.py plan | fetch | apply --owner-cleared`, then `scripts/build-ufc-cutouts.py --only <slugs>` (needs `rembg`). Downloads go to `.photo-pulls/` (git-ignored).
- **Flags:** re-run `python3 scripts/build-ufc-fighter-countries.py <saved wikitext>`; it keeps existing entries and fails on an unknown country code.
- **Cache strings:** bump `?v=` on changed CSS/JS in `index.html` and the `CACHE_NAME` in `sw.js` when shell files change.

## Lessons from this chat
- **A `DECISIONS.md` conflict silently stops CI.** Other chats add 24 Nov entries all day; when `main` moves, the PR's checks never start ("mergeable: unknown"). Merge `main` into the branch, keep both entries, push.
- **Run the real profile QA locally before pushing profile changes.** It needs Playwright importable (see the test's header). Earlier in this chat it was wrongly called a pre-existing failure; it passes on `main`.
- **Check the crop, not the source size.** ESPN headshots are landscape (600 x 436): the 4:5 portrait is limited by height (349 px).

## Open, for the owner to decide
1. **14 UFC fighters not matched on ESPN** keep a small photo and no cutout: Alexander Romanov, Cameron Nelson, Jose Henrique, Joseph Kropschot, Rafael Cerqueira, Thomas Gantt, Valesca Machado, Zachary Scroggin (not found); Ce Liu, Heili Alateng, Klaudia Sygula, Jose Delgado (spelled differently on ESPN; ids can be added by hand in `.photo-pulls/ufc-hires/ids.csv`); Caio Machado (two ESPN athletes of that name); Mohammad Yahya (search error).
2. **21 new photos failed the cutout checks** (12 soft halo, 8 shoulders missing, 1 coverage) plus 2 dropped for specks (Jake Hadley, Jose Daniel Medina). They show the photo in a disc.
3. **Tight framing:** about ten long-haired fighters' cutouts are framed tighter (`frame()` reads long hair as a bigger head), as Katlyn Cerminara's was before. Kept by the owner's choice; a framing fix would redo them with `--only`.
4. **About 150 cutout fighters have no country** (not on the Wikipedia page, mostly retired or released). Ilia Topuria is listed with two flags (Georgia and Spain) and has none stored. Bia Mesquita and Raquel Pennington are ranked but not listed under those names.
5. **Boxing face-off:** offered but not started (33 boxing cutouts exist).
6. **Not reviewed:** ESPN's and UFC.com's terms for automated reads. **Not checked:** a real phone or Safari for the face-off and profile band (`:has()` and `mask-composite` need current browsers; older ones degrade gracefully).
7. **Ownership note:** `FIGHTERS-HUB-FORM.md` gives the fighter profile to the ratings chat; the owner chose to build the profile band here.
