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

## Open questions for the owner
- Where is the stockpile of images you have collected (a folder, a drive, a service)? Roughly how many, and under what permission?
- Which sources are you permitted to republish (promoter press kits, licences, Wikimedia)? List them here once known.
