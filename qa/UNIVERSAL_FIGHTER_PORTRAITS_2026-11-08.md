# Universal fighter mentions and portrait cache — 8 November 2026

## Implemented
- Uses exact full-name matches with punctuation/Unicode-aware word boundaries. Does not invent identities, names or post content.
- Champion table photo controls were preserved; the universal controller intentionally excludes those existing independent controls.
- Photo order: approved local / known editorial URL, optional recorded secondary URL, matching public encyclopaedia page thumbnail, finally readable initials.
- Existing source images are indexed in a reusable JSON catalogue; no mass download of third-party photos without permission.
- One verified local fighter photo: Anthony Joshua, Creative Commons Attribution 3.0, attributed in `assets/PHOTO_CREDITS.md`.

## Static validation
- 899 indexed names.
- 228 portrait-source entries currently specify a photo URL/path (227 original external site sources plus Anthony Joshua local file).
- 671 indexed names lack a vetted preassigned image link and rely on lookup/initials.
- JS syntax compiled successfully in V8; Unicode name matching verified for Anthony Joshua, Oleksandr Usyk, Richard Torrez Jr., Casey O’Neill, Zha Yi and Mizuki.
- Repository photo file confirmed present: `assets/fighter-portraits/anthony-joshua.jpg` (196,096 bytes; SHA-1 verified by caching workflow).
- Browser screenshot audit and testing in actual email clients are still outstanding.

## Editorial limits
- This does not guarantee all 899 names have a verified photograph, nor does a matching Wikipedia page prove correct identification.
- Names referred to only by surname or nickname cannot be matched reliably without disambiguation.
- Photo rights, URL reliability, portrait identity and weekly report factual accuracy still require review.
- Keep archival status and noindex until publication decisions and rights clearances are complete.
