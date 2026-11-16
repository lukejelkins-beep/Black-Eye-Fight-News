# Kimarite technique video pipeline — BEFN Sumo preview

**Scope:** NHK-style gallery for the official 82 JSA kimarite, with one short, muted WebM example for each technique when an accurate NHK example can be sourced.

**Owner attestation:** the BEFN project owner reports permission from NHK to use its videos. Preserve the written permission and confirm the agreement includes edits, conversion, publication on BEFN, and ongoing display before a public deployment. NHK's permission is not a substitute for any separately required third-party platform access.

## Implementation
- Gallery: `assets/sumo-kimarite-gallery.mjs`, styled by `assets/sumo-kimarite-gallery.css`.
- Media directory: `assets/sumo-kimarite/{slug}.webm`. Static posters are the official JSA catalogue photographs, linked by canonical technique ID (`https://sumo.or.jp/img/kimarite/kimarite_{ID}.jpg`), rather than screenshots extracted from the NHK footage.
- Manifest: `data/sumo/kimarite-media.json`. Only files declared in the manifest play. Each record includes NHK credit and rights provenance; the photo poster uses an official JSA image and is credited separately.
- Cut worksheet: `data/sumo/kimarite-clip-cuts.csv`. The first nine rows point to individually verified NHK WORLD-JAPAN videos; other 73 need direct video-to-technique matching.

## Produce a clip
1. Obtain the NHK-approved source video file; store it outside the repository initially, in a folder such as `/tmp/nhk-authorised/`. Do not commit unedited source footage.
2. Watch the video and mark the action **starting just before the decisive movement and ending after completion**; generally 3–5 seconds. Record source file, source URL, cut start, duration and `reviewed=yes` in the cut worksheet.
3. JSA still image permission was confirmed by the BEFN owner on 17 November 2026; each technique automatically uses its official JSA photograph, independent of the NHK video.
4. Run:
   `python3 scripts/build-kimarite-webm.py --source-dir /tmp/nhk-authorised/`
5. Inspect the output loop: the correct named winning technique must be demonstrated clearly, full wrestlers remain visible, playback is silent, and the loop does not cut off the finish.
6. Commit only approved WebM outputs, updated cut worksheet, and media manifest on the **Sumo test branch**. Check mobile data usage and the reduced-motion experience.

## Technical
- VP9 WebM, 640px maximum target width, 24fps, no audio, 1.2–8s source cuts.
- Defer loading; pause outside viewport and for reduced-motion preference.
- Always offer original NHK source link; do not assert media exists until files are committed and browser-tested.
- Never automatically assign generic footage to a rare kimarite. A missing example remains visibly pending.
- Keep existing Sumo routes, data, results, standings and wrestler profiles intact.

## Pilot: Oshidashi
- BEFN user supplied a 1.965-second MOV screen recording to ChatGPT on 17 November 2026.
- A muted 640×294 VP9/WebM sample was generated (171,992 bytes). This example **does not yet show an unambiguous completed ring exit** and has not been added to the public manifest or the repository.
- Official still: https://sumo.or.jp/img/kimarite/kimarite_03.jpg; source reference https://sumo.or.jp/Kimarite/detail/3/.
- For production-quality instructional footage, supply a longer view containing the decisive push-out and full finishing motion.

## GIF pop-up interaction (17 November 2026)
- BEFN Sumo uses an on-demand GIF overlay: tap a named kimarite from the gallery, match results, H2H, profile techniques or standings, and a modal opens without changing the current URL, view or scroll position.
- GIFs are **not** auto-loaded across the 82-card gallery. Full-motion GIFs load only after a tap, with Escape, backdrop and close-button dismissal, focus restoration and a mobile-safe frame.
- Technique tiles always show the matching original JSA reference photograph (verified Oshidashi: https://sumo.or.jp/img/kimarite/kimarite_03.jpg). Never show unrelated image-search photographs as JSA examples.
- `data/sumo/kimarite-media.json` accepts an optional `gif` path under `assets/sumo-kimarite/{slug}.gif`. Source credit and usage permission are required.
- Create a tight GIF directly from the permitted recording using:
  `python3 scripts/build-kimarite-gif.py /path/oshidashi.mov --slug oshidashi --crop 760:426:20:24 --width 480 --fps 12`
- Test a full technique sequence, both wrestlers' visibility throughout, no unnecessary borders, mobile decoding and GIF loop behaviour before declaring an example completed. 
- The user-supplied 1.965-second Oshidashi MOV was cropped into a **review GIF only**. It lacks conclusive footage of the ring exit and has **not** been committed to the site or media manifest.
- Top 15 frequent winning techniques remain the priority set; other kimarite show JSA photographs and links until a verified GIF exists.
