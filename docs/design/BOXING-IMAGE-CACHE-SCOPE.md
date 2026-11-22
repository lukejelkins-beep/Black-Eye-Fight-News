# Boxing photo cache — scope

Status: **proposal, 2026-11-22.** Nothing built. Asked for after the landing page (#397) had to fall back to a pattern tile on boxing rows. Needs the owner's decisions in "What I need from you" before any work starts.

## Why

Measured on today's feed (`data/news-live.json`, 280 articles):

| | MMA | Boxing |
|---|---|---|
| Headlines | 205 | 65 |
| Carry a publisher photo | 61 (30%) | **12 (18%)** |
| Name a fighter we hold a photo of | 104 (51%) | **0** |

The UFC library (750 cleared portraits, `data/ufc-image-register.json`) roughly doubles how often an MMA story can show a face. Boxing has no equivalent, so four of the five "Latest news" rows on the landing page fall through to the house tile, and boxing cards in "This week and next" show a poster or nothing. The gap is the photo cache, not the page: the page already asks for a local photo and takes one the moment it exists.

## What already exists and can be reused

- `scripts/process-fighter-images.py` — takes a source folder, a manifest CSV and an output folder; writes portrait (4:5, 480px), card (16:9, 800px) and thumb (1:1, 240px) WebP crops. Sport-agnostic already.
- `scripts/build-local-image-map.py` — turns a register into `assets/local-images.js` (`window.BEFNLocalImages.has/url`). Hardcoded to the UFC register today; needs to read two registers and keep each one's `basePath`.
- `data/ufc-image-register.json` — the register shape to copy: id, name, files, credit, sourceUrl, lowRes, plus top-level `rights` and `rightsNote`.
- `scripts/build-ufc-cutouts.py` — makes transparent cut-outs from cleared portraits with rembg, offline. Works on any cleared portrait, so boxing cut-outs come free once portraits exist.
- The landing page, Fighters page and news rows already call `BEFNLocalImages`, so nothing has to be rewired to start showing boxing faces.

## The standing rule this has to respect

`IMAGE-GUIDE.md`, owner decision 2026-11-17: **Claude does not fetch photos of public figures from the web.** The owner downloads what they are permitted to use into their local `befn-images/originals/` with a `register.csv` row, and only approved rows are processed. The one exception is Sumo (JSA portraits, owner's attested permission, 2026-11-19) and it covers no other sport or source.

So this is mostly a sourcing and rights job for you, plus a small amount of plumbing for me. I am not proposing to scrape boxer photos.

## Who to photograph

`docs/design/boxing-photo-priority.csv` — 225 names in priority order, generated from our own data: main-event fighters on announced boxing cards first, then everyone else on those cards, then boxers in recent results, then anyone named twice or more in boxing headlines. It has empty `source_url`, `credit`, `licence`, `permission` and `approved` columns, in the same shape as your local `register.csv`, so it can be filled in as you go.

Coverage modelled against today's 65 boxing headlines:

| Photos sourced | Boxing headlines that could show a face |
|---|---|
| Top 10 | 25% |
| Top 30 | 37% |
| Top 50 | 51% |
| Top 80 | 65% |
| Top 120 | 83% |

The first 30 are the visible win: every announced boxing card gets a face on the landing page and the Fights page, and a third of boxing news rows stop showing a tile.

## Work, in order

1. **You**: pick the rights route (below) and drop originals for the first batch into `befn-images/originals/`, with their `register.csv` rows filled in.
2. **Me**: `data/boxing-image-register.json` in the UFC register's shape; `scripts/build-local-image-map.py` reads both registers and keeps each one's `basePath`; processed files land in `assets/img/boxing/<slug>-{portrait,card,thumb}.webp`. Ambiguous names (two boxers, one name) are dropped exactly as the UFC map already drops them.
3. **Me**: regression test over the merged map (both sports resolve, a name in neither returns empty, a clash returns empty), and a build check that every mapped file exists.
4. **Me**: run the cut-out script over the cleared boxing portraits so boxing cards get the same transparent treatment as UFC ones, and a line in `IMAGE-GUIDE.md` recording the library, its source and its rights status.
5. **You**: approve the PR as usual. Nothing goes to `main` without "Merge N".

Roughly half a day of my time once the first batch of originals exists, and it does not grow much with batch size — step 2 onwards is the same work for 30 photos or 300. Repository size is the one thing to watch: the UFC library is 29 MB for 750 fighters, so 225 boxers would add about 9 MB.

## What I need from you

1. **Which sources may we republish?** This is the open question `IMAGE-GUIDE.md` has carried since 17 November. Realistic options, and they can be combined:
   - **Your own cleared stockpile**, as with the UFC library. Safest, slowest.
   - **Promoter and broadcaster press kits** (Queensberry, Matchroom, BOXXER, Golden Boy, PBC, DAZN). Usually free to use for editorial coverage, often with a required credit. Needs your attestation per promoter, as with the JSA.
   - **Wikimedia Commons**, CC BY or CC BY-SA, with the photographer credited in the register and shown in the page's credit line. `scripts/process-fighter-images.py` already knows the Wikimedia credit string.
2. **Do you want me to fetch under an attested permission**, as Sumo does, or do you want to keep supplying originals by hand? If a promoter permission is attested I can write the intake the way `sumo-portrait-intake.py` works, with a rights record per photo.
3. **How far down the list to go first** — my suggestion is the first 30.

## Not in this scope

- No change to the UFC library, the poster cache or the Sumo intake.
- No paid provider and no new worker: `AGENTS.md` keeps paid collection to the existing UFCalendar workflow.
- No face detection. Crops stay top-biased, as the UFC ones are, so a few will need a spot-check.
- Nothing that puts an uncleared photo in front of a reader. Until a boxer's photo is cleared, the page keeps the tile it shows today.
