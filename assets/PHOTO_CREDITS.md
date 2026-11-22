# Fighter portrait sourcing and reuse

## Locally hosted, permission-reviewed

**Anthony Joshua** — `assets/fighter-portraits/anthony-joshua.jpg`

- Original work: *Anthony.Joshua.JPG*, 2018
- Photographer/source: **Jumeirah**, via Wikimedia Commons
- Source: https://commons.wikimedia.org/wiki/File:Anthony.Joshua.JPG
- Licence: **Creative Commons Attribution 3.0 Unported** — https://creativecommons.org/licenses/by/3.0/
- Attribution: "Anthony Joshua — Jumeirah, CC BY 3.0, via Wikimedia Commons"
- Modifications: None to original JPEG
- Download URL: https://upload.wikimedia.org/wikipedia/commons/e/e2/Anthony.Joshua.JPG
- SHA-1 verified against Commons metadata: `a1dcd87204009bb56eb64caf1b9c1a15c06fd245`
- GitHub Actions workflow: `.github/workflows/cache-licensed-portraits.yml`

This is an image of the named fighter and is hosted locally with the licence and attribution retained. The original uploader identified the subject.

## Other catalogue entries

The source catalogue at `assets/fighter-portrait-registry.json` contains third-party image links (existing in the original research). The owner stated on 2026-11-22 that all images BEFN uses are approved and cleared, so the 226 entries that hold a photo link are marked `owner-cleared`; that status is the owner's statement, not a licence granted by the source. Most entries have no local file: the pages hotlink the source, and nothing in this repository copies them — `.github/workflows/cache-licensed-portraits.yml` caches only the Wikimedia Commons CC entries listed in `assets/portrait-sources.json`, which it asserts. Fighter identity on those links was never individually checked, so treat a surprising photo as unverified rather than wrong rights.

For entries without an approved photo, the presentation can attempt a public encyclopaedia image lookup and otherwise displays initials. An automated lookup is *not* an identity or licence certification. This remains a pre-launch archived research site; editorial review is required before broader publication.
