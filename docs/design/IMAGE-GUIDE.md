# Images

## Where we are (measured 2026-11-17)
- `data/results.json` holds 884 fighter photo references. **None are hosted by BEFN.** 570 point at ESPN's CDN, 235 at PFL's S3 buckets, 70 at ONE's CDN. News thumbnails come straight from publishers (MMA Fighting, Sherdog, World Boxing News, Wikimedia).
- The repository holds about nine images. The Sumo preview is the exception: 190 official JSA portraits in `assets/sumo-photos/`, with a rights record per photo in `data/sumo/approved-photos.json`.
- Consequences: the look is uneven (every source crops differently), images can disappear or be blocked at any time, we cannot resize or optimise them, and rights depend on someone else's server.

## Target
Every image shown to readers is a file BEFN controls, in a consistent shape, with a recorded source and rights status.

## Pipeline (proposed)
1. **Intake:** original goes in a private store (not the public site root) with source URL, credit, licence/permission and date.
2. **Process:** generate fixed crops per use — portrait 4:5, card 16:9, thumbnail 1:1 — in WebP/AVIF at 1x and 2x. Face-aware crop so heads are never cut.
3. **Publish:** only the processed files go in a public folder, e.g. `assets/img/<sport>/<id>-<crop>.webp`.
4. **Record:** one register entry per image: id, source, credit, licence, approved-by, date.
5. **Use:** pages reference the register, never a raw third-party URL.

## Rules
- Hot-linking third-party images is a stop-gap, not the end state. Migrate by priority: Top 25 UFC and boxing names first, then event headliners, then the rest.
- No image without a rights status. "Found online" is not a status.
- Event posters: use the promotion's own poster when permitted; otherwise a BEFN-designed card from the headline bout.
- Alt text on every image; names and event, not "photo".

## Local library (decided 2026-11-17)
There is no existing stockpile. The owner keeps a local `befn-images/` folder on their Mac with `originals/`, `register.csv` (source, credit, licence, permission, focus point, approval) and `process_images.py`, which makes the portrait, card and thumbnail WebP crops and a `manifest.json`. Only approved rows are processed. Processed files and the manifest are what get added to the site.
- Claude does not fetch photos of public figures from the web. The owner downloads what they are permitted to use and drops it into `originals/`.
- **Exception, Sumo (owner approved 2026-11-19):** official JSA rikishi portraits are fetched automatically by `scripts/sumo-portrait-intake.py` on the Sumo preview branch, under the owner's attested JSA permission (2026-11-16). Each one is matched to the roster by JSA id, ring name and stable, recorded in `data/sumo/approved-photos.json` with source, credit, licence and hash, and turned into a display cut-out when it is a clean full-body photo. Runs daily from `.github/workflows/sumo-portrait-intake.yml`. No other sport or source is covered by this exception.

## Rights status (owner statement, 2026-11-22)
The owner stated on 2026-11-22 that **every image held in this repository is approved and cleared for use on BEFN**. That statement is the rights basis for the sets below; it is recorded, not inferred, and no licence has been invented for any of them. Source URLs, credits and each source's original wording are kept as provenance, so a register entry may still show what a source said before the owner cleared it — the effective status is the `rights` field, not the `originalRightsNote`.

| Set | Files | Where | Record | Status |
| --- | --- | --- | --- | --- |
| UFC fighter photos | 2,250 (750 fighters × 3 crops) | `assets/img/ufc/` | `data/ufc-image-register.json` | `owner-cleared` |
| UFC cutouts | 52 | `assets/img/ufc-cutouts/` | `data/ufc-cutout-register.json` | derivative of the cleared portraits, same status |
| Event posters | 88 | `assets/img/posters/` | `data/poster-register.json` | `owner-cleared`, official promotional posters |
| Sumo JSA portraits, heads and cutouts | 478 (190 rikishi) | `assets/sumo-photos/` | `data/sumo/approved-photos.json` | `approved: true`, owner's attested JSA permission (2026-11-16) |
| Sumo kimarite clips and posters | 31 | `assets/sumo-kimarite/` | `data/sumo/kimarite-media.json` (`clips`) | NHK permission confirmed by the owner |
| JSA kimarite stills | 82 | `assets/sumo-kimarite/jsa/` | `data/sumo/kimarite-media.json` (`jsaPhotos`) | `owner-cleared` (added 2026-11-22; had no record before) |
| Sumo country landmarks | 4 | `assets/sumo-landmarks/` (Sumo preview branch) | `data/sumo/landmarks.json` | `approved: true`, owner 2026-11-22 |
| Country flags | 28 | `assets/img/flags/` | licence file kept beside them | flag-icons 7.6.0, MIT |
| Anthony Joshua portrait | 1 | `assets/fighter-portraits/` | `assets/portrait-sources.json`, `assets/PHOTO_CREDITS.md` | CC BY 3.0, attribution retained |
| Site artwork, icons and brush marks | 10 | `assets/` | this table | BEFN's own artwork |
| Documentation screenshots | 14 | `docs/design/screenshots/` | this table | BEFN's own screenshots of its own pages |

The owner extended the same statement to the hotlinked portraits on 2026-11-22, so the 226 entries in `assets/fighter-portrait-registry.json` that hold a photo link now read `owner-cleared` instead of `external-hotlink-license-not-cleared` (the copy inlined in `index.html` is kept identical). Those files live on 74 other sites and BEFN does not hold them: the status records the owner's permission to use them, not a licence from the source, and nothing copies them locally — `cache-licensed-portraits.yml` caches only the Wikimedia Commons CC entries in `assets/portrait-sources.json`. The other 643 names have no photo at all, so they keep their lookup status (`portrait-not-yet-verified`), which is about whether a portrait has been found, not about rights. Publisher thumbnails in news and results data are still other people's files, served from their own servers, and are not part of this record.

## UFC library (added 2026-11-17)
750 of the 783 approved UFC fighters have processed images in `assets/img/ufc/<slug>-{portrait,card,thumb}.webp`, listed in `data/ufc-image-register.json` (rights: `owner-cleared`, per owner statement). `scripts/process-fighter-images.py` makes them from the owner's local folder; crops are top-biased with no face detection, and 293 sources are under 480 px wide (`lowRes: true` in the register), so they will look soft if shown large. 33 fighters are listed under `missing`.

## Event posters (added 2026-11-19)
The owner holds permission to republish official event posters. `scripts/cache-event-posters.py` (workflow "Cache official event posters", twice a day) downloads each poster link recorded in `data/upcoming-cards.json` and `data/historical-posters.json` once, saves `assets/img/posters/<event-id>-portrait.webp` or `-landscape.webp` (900 or 1280 px wide), and records image URL, source page, credit, rights, size and checksum in `data/poster-register.json`. `assets/local-posters.js` tells the Upcoming and Results pages to use these copies first. Failed downloads are retried up to three times. Originals are not committed.

## UFC cutouts (added 2026-11-21)
Fighters on announced UFC cards get a transparent cutout made offline from their owner-cleared portrait in `assets/img/ufc/` by `scripts/build-ufc-cutouts.py` (rembg, no web fetch, no new photo). Results and reasons are in `data/ufc-cutout-register.json`; a failed check means the page shows the original photo in a disc. Cutouts are derivatives of the cleared portraits and carry the same credit (ESPN) and rights status.

## Boxing library (added 2026-11-22)
Boxer photographs come from promoter press kits under the owner's attestation of 2026-11-22: BEFN may republish fighter photographs from Matchroom, Queensberry, BOXXER, PBC, MVP and Salita, with the promoter credited. `scripts/boxing-portrait-intake.py` reads the priority list in `docs/design/boxing-photo-priority.csv`, fetches from an allowlist of promoter rosters only, and writes `assets/img/boxing/<slug>-{portrait,card,thumb}.webp` plus a row per photo in `data/boxing-image-register.json` (promoter, credit, source page, image URL, SHA-256, attestation, fetch date). First run: 8 boxers — Adam Azim, Alan Chaves, Anthony Joshua, Callum Smith, Conah Walker, Dmitry Bivol, George Liddard, Lewis Crocker.
- It fails closed. A site whose `robots.txt` disallows us or ClaudeBot is skipped, and so is one that refuses an automated request. On the first run that left out **PBC** (HTTP 403), **MVP** (robots disallows ClaudeBot, `ai-train=no`) and **Queensberry** (the site is the merchandise store and carries no roster); their photos need the owner to supply them by hand.
- It never takes an agency photograph. Getty, AP, Reuters, AFP, PA, Shutterstock, Alamy and Imago credits are skipped, because that licence does not travel with a press kit.
- It never fetches the same photo twice: a slug already in the register is left alone, and the checksum records what was taken.
- `scripts/build-local-image-map.py` now merges this register with the UFC one into `assets/local-images.js`, each keeping its own folder, so the Fights, Results, Fighters and hover cards show a boxer's face wherever they already showed a UFC fighter's. A name two fighters share is dropped rather than guessed at.
- Crops are top-biased like the UFC ones, with no face detection, so they want a spot-check.
