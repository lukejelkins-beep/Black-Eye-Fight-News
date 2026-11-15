# BEFN V4 fast-lane native-ID reconciliation — 14 November 2026

**Scope:** offline read-only comparison of pinned Greco source links against the V4 independent certification registry. This document is **not** a career certificate or a collector-cache repair.

**Inputs:** `data/ufc-v4-next20-greco-fight-links-20261114.json` (Greco commit `c742842f29466758fedc3906dbad28d6d320a8da`) and `data/ufc-v4-independent-full-career-certification-batch-20261114.json` from V4 draft PR #109.

Of the 20 source-linked fighters, **18 have registry entries**. Their **190 pinned source bout rows** were compared to registry native IDs and UFCStats-derived source URLs. **188** have a matching numeric native ID and exact source fight-detail URL. The other **two have no native ID in the source crosswalk**, so they must not be counted as fully reconciled:

| Fighter | Official bout | UFCStats-derived fight-detail reference | Source crosswalk native ID | Required next action |
| --- | --- | --- | --- | --- |
| John Castaneda | 2026-09-26 vs Alatengheili, loss | https://ufcstats.com/fight-details/577011f3bbcf7f91 | null | Locate exact existing native bout ID, verify correct athlete/corner and result against official UFC record, or send to collector-only recovery |
| Kyoji Horiguchi | 2015-09-26 vs Chico Camus, win | https://ufcstats.com/fight-details/26ac85fc4bee63a6 | null | Independently confirm UFC bout and exact native ID; investigate historical identity rather than guessing |

**Safety:** Both registry entries currently carry `sourceCoverageAttested: true`. That flag alone is **not** sufficient for certification; require strict Stage3 numeric identity and complete measured stats gates. The source crosswalk is a dated secondary dataset through 7 November, not a direct UFCStats scrape or exhaustive official UFC.com record. Do not edit the immutable roster or collector-owned cache. The separate exception worker should own these two unresolved native-ID cases; this fast-lane worker should select another fully reconcilable fighter.

**Outcome:** 190 rows reviewed; 188 exact source/native-ID crosswalk matches; 2 specific missing native IDs; **zero newly certified careers and zero recovered cache rows** from this investigation.
