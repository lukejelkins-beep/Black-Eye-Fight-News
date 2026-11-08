# Championship photo hover and fighter-portrait follow-up — 8 November 2026

## Scope

## Implemented
- Website boxing and UFC champion tables: text-only fighter names, with a large editorial photo preview (approximately 440px wide × 300px high), fixed outside the horizontally scrollable table to avoid cropping/clipping.
- Preview images have `object-fit:contain` to preserve full photos without face-clipping.
- Preview controls have keyboard-focus styles and Escape/outside-click dismissal in scripted browser versions.
- Site's scouting directory now contains a photo URL for all 166 of 166 profiles, including the 86 entries previously lacking a source. The data is source-complete, but **not** guaranteed to be live-image verified.
- Latest sourced addition: ESPN Alexander Volkanovski fighter headshot.

## Static checks passed
- 63 championship entries checked on website, **0 without photo mapping**.
- 166 of 166 scouting profiles have a nonempty photo URL.
- All 9 JavaScript scripts (excluding structured JSON script tags) passed parse/syntax validation.

## Outstanding checks and restrictions
- Source URL presence does not prove cross-browser loading, correct copyright licence or reuse rights. Some external hosts may block image hotlinks or return 403/404/429 errors. Missing/failing photos show a truthful fallback.
- A full live browser desktop/mobile screenshot audit of both renderings remains outstanding.
- Email clients can strip JavaScript and disallow hover CSS, so rich hover/tap behaviour works in the browser/HTML version but **cannot be guaranteed in all email clients**; tested CSS fallback is necessary per client before claiming equivalent behaviour.
- The archive and website remain preview assets pending publication/rights review.

These notes supersede the **counts** in `qa/IMAGE_AUDIT_2026-11-07.md` but do not alter its historical record.
