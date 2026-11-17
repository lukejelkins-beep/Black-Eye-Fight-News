# Decisions (newest first)

Format: date — decision — who — where it shows up.

## 2026-11-17
- 750 UFC fighter photos supplied by the owner from a local folder are cleared for use on BEFN and processed into portrait (4:5), card (16:9) and thumb (1:1) WebP files in `assets/img/ufc/`, recorded in `data/ufc-image-register.json` as `owner-cleared`. 33 fighters have no photo. Source URLs are kept in the register; the permission paperwork is held by the owner, not in this repo. Pages still hotlink until a follow-up PR switches them to the local files. — Owner direction — PR for branch ufc-local-fighter-images.
- Sumo navigation is four items: Results, Rankings, Rikishi, Techniques. Overview page removed; Results is the front page. — Owner approved — Sumo preview, PR #259.
- Every Sumo page uses one header pattern (dark band, red edge, uppercase title, one context line). — Owner approved — PR #259.
- Sumo preview refreshes every 30 minutes on possible basho days and daily all year; it picks up each new basho from the calendar and redeploys through a Render deploy hook. — Owner approved — PRs #260, #262, #265, #266.
- Wrestlers new to the tracked divisions are onboarded automatically from the Sumo API; they are labelled as awaiting independent certification and show a photo placeholder until a portrait is approved. — Owner approved — PRs #263, #264.
- The tracked cohort size is taken from the roster, never a fixed 190. — Claude, merged with the above.
- Career totals and head-to-head records are updated from each completed bout during a basho. — Owner approved — PR #265.
- Merging to `main` or the Sumo preview branch needs the owner's explicit "Merge N". — Owner standing rule.
- Design direction in DIRECTION.md (dark editorial look, two typefaces, one header and navigation pattern, no internal research on public pages) is approved. — Owner approved — docs/design/DIRECTION.md.
- There is no existing image collection. Images will be collected into a local library on the owner's Mac (originals, a rights register, processed website crops) and only processed, approved images go on the site. Claude does not download photos of public figures itself; the owner supplies files they are permitted to use, and Claude builds the pipeline and the site changes. — Owner direction — docs/design/IMAGE-GUIDE.md.
