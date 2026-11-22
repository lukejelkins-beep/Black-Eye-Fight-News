# Boxing photo cache — scope

Status: **proposal, 2026-11-22.** Nothing built, nothing fetched. Asked for after the landing page (#397) had to fall back to a pattern tile on boxing rows. The owner has picked the source route — promoter press kits — so what is left is the attestation and the first batch size, under "Still open".

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

## Route chosen: promoter press kits (owner, 2026-11-22)

The owner picked promoter and broadcaster press kits over supplying originals by hand. That makes this the second attested-permission intake after the JSA one, so it needs the same care.

**The promoters our own boxing cards name**, with the official sites those records already link to:

| Promoter | Site we already link to |
|---|---|
| Matchroom (and Matchroom Boxing) | `www.matchroomboxing.com` |
| Queensberry | `queensberry.co.uk` |
| BOXXER | `www.boxxer.com` |
| PBC | `www.premierboxingchampions.com` |
| MVP (Most Valuable Promotions) | `www.mostvaluablepromotions.com` |
| Salita / Universal Promotions | `www.salitapromotions.com` |
| Top Rank, Zuffa Boxing | no card linked to their own site yet |

**What an attested intake would do**, modelled on `scripts/cache-event-posters.py` and `sumo-portrait-intake.py`:
- Fetch only from that allowlist, only pages for fighters and events we already track, and only when the site's `robots.txt` allows it. One fetch per photo, a checksum so it is never re-fetched, and a failure recorded rather than retried forever.
- Record per photo: source page, image URL, promoter credit, `rights: promoter-press-kit`, the owner's attestation and its date, and the file hash — the shape `poster-register.json` already uses.
- **Skip agency photographs.** A press kit often contains Getty, AP or Reuters frames whose licence does not transfer to us, so anything credited to an agency, or carrying an agency watermark, is left alone rather than guessed at.
- Fail closed: no permission recorded for a promoter, or no robots allowance, means no fetch for that promoter.

**Before I build it I need one thing from the owner**: confirmation that their permission covers republishing fighter photographs from those named promoters on BEFN, with the promoter credited — and any promoter to add or drop from the list. That sentence, dated, is what goes in `IMAGE-GUIDE.md` and in every register row, exactly as the JSA attestation does. Permission to republish a press-kit photo is not the same as permission to crawl a site, so the allowlist stays narrow and robots-respecting either way.

## Still open

1. **The attestation itself**, as above: that your permission covers republishing fighter photographs from the named promoters, with the promoter credited, and whether any promoter should be added or dropped.
2. **How far down the list to go first** — my suggestion is the first 30, which puts a face on every announced boxing card.
3. **Whether to add Wikimedia Commons as a second source** for boxers no press kit covers (CC BY / CC BY-SA, photographer credited; `process-fighter-images.py` already knows that credit string).

## Not in this scope

- No change to the UFC library, the poster cache or the Sumo intake.
- No paid provider and no new worker: `AGENTS.md` keeps paid collection to the existing UFCalendar workflow.
- No face detection. Crops stay top-biased, as the UFC ones are, so a few will need a spot-check.
- Nothing that puts an uncleared photo in front of a reader. Until a boxer's photo is cleared, the page keeps the tile it shows today.
