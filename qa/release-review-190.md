# PR #190 integration review

## Current recommendation — 14 November 2026

**Ready for owner review of the bounded web changes. Explicit approval is still required before merge or production deployment.** Keep the PR draft pending that decision and the owner's branch-protection check. This report does not authorize native distribution or claim full assistive-technology compliance.

The prior browser-preview blocker is resolved. Detailed methods, screenshots, measurements, corrections and limitations are in [browser-verification-190.md](browser-verification-190.md); raw evidence is in `qa/evidence-190/`.

## Verified source and checks

Corrective source commit: `0ac044fdde1fab90a2180a39172ae1f2b75d4d21` on `qa/quality-supervisor-20261114`. Full local source release-preflight and reporter tests passed. [GitHub run 43577693632](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/actions/runs/43577693632) passed both `release-preflight` and `qa-inventory`, including Python and new JavaScript deduplication regressions. Verify the final documentation head separately before integration.

| Outstanding handover item | Current evidence |
| --- | --- |
| Actual PR preview | Isolated, revision-pinned static preview; no production service/configuration change |
| Results desktop/mobile | 1363 × 936 and 390 × 844; initial 12; all 76 events and 886 bouts reachable; search/filter/reset and keyboard focus verified |
| DOM comparison | 16,239 initial descendants vs 110,298 matched unpaginated baseline: 85.3% reduction; complete growth table saved |
| Interaction timing | One instrumented pass: 236–688 ms click-to-second-frame as batches grow; no production speedup/INP claim |
| Results/Upcoming accessibility | Real keyboard/control-target checks pass within supported tooling; full screen reader remains untested |
| News editorial acceptance | Real cache Python 280→279; only intended Perry pair; JS display 279→278 adds one reviewed same-statement pair; preferred Perry card rendered |
| Confirmed correction | Broad fuzzy paths could discard rumours or signing follow-up bookings; Python/JS guards added with before/after regressions; JS different-promotion guard added |
| Integration | GitHub clean/mergeable; current inspected main and all 18 other open PRs have no QA path overlap |

## Remaining owner and deployment requirements

1. Both final-head readiness jobs must pass; recheck concurrent paths/main before integration.
2. Owner verifies branch protection and bypass permissions. Administration read still returns 403; enforcement is unknown, not disabled.
3. Explicitly approve the focused QA merge and production deployment. Render auto-deploy from main after checks and existing main-only hook recovery can publish the change. No merge/deploy occurred here.
4. After deployment, verify deployed revision, Results/Upcoming desktop/mobile and news after its next normal refresh, then inspect the existing hourly monitor. Do not merge the separate preview-fixture branch or research PRs.

The final tested source is safe to consider for the web release on this evidence. No blocking mobile/editorial defect remains in the tested paths. Residual limits: iframe mobile layout rather than physical device, no screen reader, no browser changing-payload refresh test (covered by source regressions), a bounded console sample, and large DOM after full expansion. Native remote-feed routing remains unresolved for native distribution. ONE QA-002 remains deferred. UFC/boxing data, criteria, collectors and automation are unchanged.
