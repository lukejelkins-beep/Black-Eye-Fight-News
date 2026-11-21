# Phase 1 plan: the Sumo look across the whole site

Status: **proposal, waiting for the owner's OK.** Nothing here is built yet.

## Goal
One site, one look. The Sumo preview's dark-band headers, uppercase condensed headings and cream pages replace the old masthead, seven-tab bar and icon sport buttons on the main site.

## Primary navigation (five items, same on phone and desktop)
News · Fights (Upcoming and Results as tabs) · Fighters · Analysis · Fight Talk
- Sport filter becomes labelled text: All · Boxing · MMA · Grappling · Sumo.
- Champions, UFC stats and Fight film move inside Fighters, Fights and News. Nothing is deleted.
- Analysis starts as a short "coming" page with the bouts that will have one; real content arrives in phase 4.

## Steps (each is its own PR to `main`, checked at 390 px and 1280 px)
1. **Shared tokens.** One stylesheet for colour, type, spacing and radius, used by the main site and Sumo. No visible change.
2. **Compact header and navigation.** Replace the logo band (about 170 px tall) with a 56 px header and the five-item bar. Mobile keeps a bottom tab bar with the same five items.
3. **Fights page.** The Results and Upcoming lists in the compact result-row pattern, posters first. ✅ built and merged
4. **News page.** Lead story, then a tight list. Live text headings instead of image headings. ✅ built earlier; tidy pass awaiting merge
5. **Fighters page.** Card grid first; staff review tools moved out of the reader view. ✅ built (awaiting merge)

## How it is approved
- Each step is previewed on a preview service first. No change reaches `main` without "Merge N".
- Fonts: Barlow Condensed (headlines) and DM Sans (body) only.

## Not in phase 1
Live social news, stats snapshots and analysis (phases 2 to 4).
