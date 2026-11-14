# BEFN Sumo — three-division test implementation

**Status:** Draft PR #196, testing only, not merged or deployed.  
**Date:** 14 November 2026.  
**Development branch:** feat/sumo-section-test-20261114  
**Base:** feat/sumo-api-source-20261114 (API adapter draft PR #194).  
**Entry:** sumo.html.  
**Production:** main, Render and blackeyefightnews.com.au remain unchanged by this workstream.

## Current tracked roster

Track all rikishi listed in the current **Makuuchi, Juryo and Makushita** banzuke, including the Yokozuna, Ozeki, Sekiwake and Komusubi positions inside Makuuchi. The cohort is not permanently fixed at 190: new snapshots recalculate membership against the three division's published banzuke IDs, not against an arbitrary fixed list. The builder refuses duplicated IDs, unreconciled identities, missing divisions or partially fetched source data.

| Division | November 2026 current banzuke |
| --- | ---: |
| Makuuchi | 42 |
| Juryo | 28 |
| Makushita | 120 |
| **Tracked total** | **190** |

The 14 November source roster held 596 identities in all divisions. The snapshot matched all 190 current banzuke IDs to stored rikishi with no extra/missing IDs or conflicting ranks.

## Implemented screens and interactions

1. **Overview** — matches BEFN's existing black/cream/gold/red branding and approved sport icon imagery; a current basho banner, three-division totals, featured wrestler cards and Makuuchi leaders.
2. **Rikishi directory** — all 190 wrestler profiles, ranked per current banzuke, searchable by shikona (Japanese and Romanised), stable, origin or rank; per-division filters and paged cards.
3. **Wrestler profile** — desktop portrait/identity/performance arrangement and condensed mobile arrangement; rank, stable, date of birth, birthplace, height and weight from the source; the November 2026 tournament outcome grid; existing opponent data and available kimarite percentages. Direct JSA profile links use separate official NSK IDs. No athlete photos are imported without rights.
4. **Technique panels** — current-basho winning method distributions for wrestlers with recorded wins, labelled by sample and denominator. The featured profiles additionally use up to 18 recent source bout records. Unknown lifetime percentages, style scores and source gaps are never guessed.
5. **JSA signature manoeuvres** — a separate evidence file records JSA-listed manoeuvres for Onosato (tsuki, oshi, migi-yotsu, yori), Wakatakakage (migi-yotsu, yori), and Nishikigi (oshi), each with its official JSA profile URL. These are **source-listed styles, not calculated win percentages**. Nishikigi's reviewed JSA page only showed September 2026 at the time of inspection; current rank is therefore taken from the separate November banzuke snapshot, not declared cross-certified by that older page.
6. **Basho Centre** — November 2026 event dates, standings and calendar-day results for all three divisions, with day controls and outcome/kimarite details.
7. **Banzuke** — complete three-division rankings in East/West rank order, W/L and absence fields only where the source supports them.
8. **Kimarite reference** — a nine-technique explanatory catalogue with a link to the official JSA classification.

## Important Makushita interpretation

**The API gives 15 calendar-day positions for Makushita, although wrestlers normally fight approximately seven bouts during the basho.** Its `absent` result can appear on routine non-bout days. Treating those positions as injury absences produced incorrect records and has been corrected.

- Count `win` and `loss` outcomes only as completed bouts; keep their **actual calendar-day positions**.
- Treat `absent` in Makushita as *no recorded bout* unless independent bout/kyujo evidence proves an absence. Show Makushita absence totals as unknown, rather than fabricating a numeric value.
- Distinguish forfeits (fusen) from a performed wrestling technique; they are excluded from technique frequency charts.
- Leave future/unrecorded day slots distinct from non-bout days and from losses.

The snapshot's Makushita 120-person banzuke has 15 slots per entry, with most wrestlers having 3–4 recorded results through day seven; this supports calendar-day interpretation rather than consecutive-bout numbering.

## Stored source data

- data/sumo/rikishi-index.json — current 190 eligible identities and measurements (derived from 596-source roster).
- data/sumo/preview-details.json — all three November 2026 current banzuke, event details and extended stats/matches for Onosato, Wakatakakage, Nishikigi.
- data/sumo/official-style-evidence.json — small verified JSA style registry for those three example profiles.
- scripts/sumo-build-preview.mjs — bounded, explicitly invoked build-time snapshot update using the read-only Sumo API source adapter.
- assets/sumo-data.mjs — testable ranking, match, technique and eligibility calculations.
- assets/sumo.js, assets/sumo.css, sumo.html, assets/sumo-nav.css — responsive user-facing preview.

The source API is https://www.sumo-api.com/api and its guide is https://www.sumo-api.com/api-guide. Official source comparisons: https://www.sumo.or.jp/EnSumoDataRikishi/search.

## QA and access

- Source-client tests: node --test tests/test-sumo-api-source.mjs.
- Three-division data, source evidence and UI contract tests: node --test tests/test-sumo-data.mjs.
- Browser QA: GitHub Actions workflow **Sumo desktop and mobile browser QA** visits the Overview, directory/search, featured and nonfeatured profiles, three divisional banzuke, basho and techniques at 1440px desktop and 390px mobile. Screenshots and the QA summary are downloadable as a short-retention GitHub Actions artifact.
- CI workflow **Sumo section isolated preview QA** checks source contracts, rank/ID data, JS syntax and isolation from production.
- Local review: check out this branch, run `python3 -m http.server 8000` and open http://localhost:8000/sumo.html. A local HTTP server is necessary because the pages fetch JSON.

**Draft review:** https://github.com/lukejelkins-beep/Black-Eye-Fight-News/pull/196  
**API prerequisite:** https://github.com/lukejelkins-beep/Black-Eye-Fight-News/pull/194

## Remaining gates / planned extensions

- Provider asks websites using the service to make contact. Confirm public-use terms before broad historical enrichment, automatic scheduled collection or production deployment.
- Collect and independently reconcile historical basho/banzuke data for all 190, career matches, rank progression, lifetime historical records, and more JSA-sourced signature manoeuvres; retain timestamp and source provenance.
- Add wrestler photography only once rights or permitted official embeds are established.
- Add a validated Sumo-specific overall/style model only after enough verified data is available. Do not invent ratings.
- Optionally deploy an independent Render test service **after the user selects the Render workspace and approves any costs or new resources**.
- Obtain explicit release approval before merging the stacked PRs into main. Keep unrelated UFC certification, boxing and other BEFN automation work untouched.
