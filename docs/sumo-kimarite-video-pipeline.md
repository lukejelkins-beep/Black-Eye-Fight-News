# Kimarite technique video pipeline — BEFN Sumo preview

**Scope:** NHK-style gallery for the official 82 JSA kimarite, with one short, muted WebM example for each technique when an accurate NHK example can be sourced.

**Owner attestation:** the BEFN project owner reports permission from NHK to use its videos. Preserve the written permission and confirm the agreement includes edits, conversion, publication on BEFN, and ongoing display before a public deployment. NHK's permission is not a substitute for any separately required third-party platform access.

## Implementation
- Gallery: `assets/sumo-kimarite-gallery.mjs`, styled by `assets/sumo-kimarite-gallery.css`.
- Media directory: `assets/sumo-kimarite/{slug}.webm` plus `{slug}.jpg`.
- Manifest: `data/sumo/kimarite-media.json`. Only files declared in the manifest play. Each record includes NHK credit and rights provenance.
- Cut worksheet: `data/sumo/kimarite-clip-cuts.csv`. The first nine rows point to individually verified NHK WORLD-JAPAN videos; other 73 need direct video-to-technique matching.

## Produce a clip
1. Obtain the NHK-approved source video file; store it outside the repository initially, in a folder such as `/tmp/nhk-authorised/`. Do not commit unedited source footage.
2. Watch the video and mark the action **starting just before the decisive movement and ending after completion**; generally 3–5 seconds. Record source file, source URL, cut start, duration and `reviewed=yes` in the cut worksheet.
3. Run:
   `python3 scripts/build-kimarite-webm.py --source-dir /tmp/nhk-authorised/`
4. Inspect the output loop: the correct named winning technique must be demonstrated clearly, full wrestlers remain visible, playback is silent, and the loop does not cut off the finish.
5. Commit only approved WebM/poster outputs, updated cut worksheet, and media manifest on the **Sumo test branch**. Check mobile data usage and the reduced-motion experience.

## Technical
- VP9 WebM, 640px maximum target width, 24fps, no audio, 1.2–8s source cuts.
- Defer loading; pause outside viewport and for reduced-motion preference.
- Always offer original NHK source link; do not assert media exists until files are committed and browser-tested.
- Never automatically assign generic footage to a rare kimarite. A missing example remains visibly pending.
- Keep existing Sumo routes, data, results, standings and wrestler profiles intact.
