# PR #190 browser and editorial acceptance — 14 November 2026

## Recommendation

Ready for owner review of the web changes, subject to final-head CI and the owner's branch-protection check. No blocking defect remains in the tested Results/Upcoming paths or the reviewed current-cache deduplication output. This is a bounded acceptance result, not a complete accessibility, security, native-app or production-performance certification. Keep production integration subject to explicit approval.

## Exact environment and isolation

- Browser: Work cloud Chrome on Linux. Desktop viewport **1363 × 936**; mobile layout **390 × 844** in a real browser iframe (375 CSS-pixel content width after the desktop scrollbar). This is responsive-layout testing, not a physical phone or touch-device test.
- Results/Upcoming initially tested at `331baec69f834d0dd1ef644f7327e024f8ea2376`. Corrective source commit **`0ac044fdde1fab90a2180a39172ae1f2b75d4d21`** was then browser-checked. `index.html`, `assets/results.js` and `assets/upcoming-cards.js` are byte-identical between these revisions; SHA-256 provenance is saved in `evidence-190/provenance.json`.
- Final [desktop preview](https://raw.githack.com/lukejelkins-beep/Black-Eye-Fight-News/8ea165f3d00e8c4ddf12b7241a9e5e53ce4170af/qa-browser-preview.html#results) and [responsive test frame](https://raw.githack.com/lukejelkins-beep/Black-Eye-Fight-News/8ea165f3d00e8c4ddf12b7241a9e5e53ce4170af/qa-browser-frame.html) are on the separate `qa/browser-preview-190-20261114` branch. The frame's historical header still names the initial Results source; the document's `qa-source-revision` meta and external source URLs identify final `0ac044f`.
- Preview HTML adapts asset paths and adds a fetch harness and timing observer. Application implementation files are loaded from immutable commit URLs. All repository data reads use the pinned QA cache; the sole data override is the disposable current-news feed after executing Python deduplication. Non-GET/HEAD requests and external fetches are rejected; CSP blocks workers, frames inside the application, remote scripts and form submission. Public external image GETs remain permitted. The static preview has no server write API, provider credentials, deployment hook or publisher.
- No Render service, environment variable, production setting or automation changed. The cloud browser could not reach workspace localhost (`ERR_CONNECTION_REFUSED`). Production Render has previews disabled; a revision-pinned static preview solved that limitation without enabling them. DevTools was disallowed; the ordinary iframe supplies the requested mobile CSS viewport without changing that policy.

## Results measurements

Same pinned cache, All Sports, All card sections; counts taken after each batch settled. The unpaginated comparison uses the pre-QA Results implementation from merge-base `90f084dc35ddc81c964ac53e8390228ec65ae6ed`, with the same shell/styles/cache.

| Event cards | Results descendants | Bout nodes | Details elements |
| ---: | ---: | ---: | ---: |
| 12 | 16,239 | 123 | 258 |
| 24 | 34,581 | 270 | 564 |
| 36 | 51,975 | 412 | 860 |
| 48 | 68,916 | 551 | 1,150 |
| 60 | 86,131 | 691 | 1,442 |
| 72 | 104,676 | 838 | 1,748 |
| 76 | 110,298 | 886 | 1,848 |
| Unpaginated baseline: 76 | 110,298 | 886 | 1,848 |

Initial DOM reduction: **85.3%**. The original production observation was 110,282 descendants; the matched settled preview has 16 additional descendants from asynchronous frontend hydration. It is not presented as an identical production runtime snapshot. Both implementations retain all 76 events/886 bouts.

One spaced-out desktop pass measured click-handler capture to the second animation frame for six Show more actions: **235.7, 288.4, 466.7, 529.2, 687.5, 685.5 ms**. This is instrumented single-session interaction evidence, not INP, production latency, p95, CPU time or a before/after speedup. Repeated expansion still reaches the large DOM. An earlier rapid pass overlapped callbacks and one role-based automation action timed out at 72 cards; native keyboard activation completed the final batch. Initial unpaginated body inspection also timed out; targeted reads succeeded. Neither was an observed application outage. Raw measurements distinguish the rapid exploratory pass from the settled pass.

## Browser acceptance matrix

| Check | Observed result |
| --- | --- |
| Initial Results | 12 cards on desktop and mobile; no cards lost from the source data |
| Show more | 12 → 24 → 36 → 48 → 60 → 72 → 76 on both sizes; button disappears at completion; focus is the first newly added summary at each step |
| Older-event search | `Ankalaev` returns the 25 July 2026 Ankalaev–Guskov event beyond the first page; clearing returns to 12 |
| Empty search | `UFC 328` returns the no-results message without losing search focus |
| Sport changes | Boxing shows its two matching cached events; MMA returns 12 UFC events with promotion controls; All Sports restores the combined view; sport-button focus survives removal of prior cards |
| Results section controls | Cortes Acosta–Walker All/Main/Prelims select 14/6/8 bouts; main and co-main precede the remainder; expanded event remains open after section changes |
| Natural keyboard order | Main → Tab → Prelims → Enter preserves focus; stable scroll remained 1,235 px in the desktop check; next Tab reaches Fight snapshot. Mobile focus reaches the same content after normal browser smooth scrolling settles |
| Search/filter focus | Removing the expanded event through search leaves focus in the search input; sport filtering leaves focus on the selected sport control |
| Expanded/section state | Section selection survives search and returning to the event; selected prelims explains the lower bout counts in the exploratory mobile batch sample |
| Mobile overflow and controls | No document-level horizontal overflow in tested Results/Upcoming/News views; Results section buttons about 108 × 48 px, Upcoming tabs 120 × 60 px; no obstructing disclosure overlay observed |
| Portrait fallbacks | Cached missing portraits use the existing initials/BEFN fallback; available local/external portraits and posters display. No new portrait lookup service was enabled |
| Local time | UFC 334 shows Sunday 15 November, main card 1:00 PM GMT+11; date-only Pacheco/Fulghum shows Start time TBC / venue date, without invented time |
| Upcoming All | References all three existing UFC 334 main/prelims/early panel IDs; all displayed |
| Upcoming individual sections | Main/Prelims/Early each references its own panel, hides the other panels, and keeps focus on the pressed control |
| Narrow Upcoming tabs | Intentional horizontal tab strip: focusing Early scrolls it into view (159 px scrollLeft); no page-level overflow; visible 3 px focus outline |
| News browser output | One preferred MMA Fighting Perry signing card; the alternative signing headline absent; publisher image loaded (naturalWidth 4,873); source has three summary points, card renders two through existing summary presentation |

No screen reader was operated. Accessibility evidence is DOM/control relationships, accessible snapshots, keyboard behavior and visible focus, not an assistive-technology certification. No browser injection of a changing server payload was performed; existing deterministic refresh/outage tests remain the evidence for that scenario. The captured final 100 warning/error entries all originated from the browser extension; no BEFN-origin entry appeared in that bounded sample. This is not an exhaustive zero-error claim.

## Full-cache deduplication and corrections

Input: `main` snapshot `2b8f364fb37c0e9fd6133dedf481400b06a0b14a`, `data/news-live.json`, SHA-256 `e1c25a7a1791d1a03d22e84824185c4c769c76a327cf32829b2bcdf2208a954e`. The original QA feed was independently run too. No production/cache file was changed.

- Python `deduplicate()`: **280 → 279 articles**, **19 → 19 result reports**. Every retained record is unchanged; second pass is idempotent.
- Only Python removal: MMA Junkie, “UFC signs Mike Perry after five-year split”; retained MMA Fighting, “Mike Perry re-signs with UFC.” Same subject/promotion/development, timestamps 6h34m apart; retained source has image and fuller summary. Editorial assessment used saved titles/summaries, not a new external fact-check.
- Actual display filter: **279 → 278 articles**, reports unchanged. Its sole extra grouping is the same Islam Makhachev statement defending Usman Nurmagomedov, across MMA Fighting and Sherdog. Both cached summaries concern the same statement. This existing Python/JS tokenization difference is documented rather than hidden; no matcher broadening was added.
- Six real-feed comparisons cover the target pair and separate White criticism/warnings, press-conference stream/faceoff, Royval backup/preview, Anik contract/Gane analysis, and press-secretary suggestion/rejection.
- Adversarial verification found broader matchers bypassed the narrow guard: confirmed vs reportedly booked stories and signing follow-ups with a later bout could collapse. JS also collapsed contracts with different promotions. Commit `0ac044f` adds shared editorial-stage/booking vetoes and a JS promotion guard. Four Python subcase failures and four JS test failures were reproduced before correction; all pass afterward. Canonical URL identity behavior is retained.
- **25 dedicated Python dedupe tests, 32 news tests, six new JS tests** pass. The JS suite now runs alongside Python in the existing release-readiness news step. No new workflow or schedule.

Exact removed/retained pairs are in `evidence-190/news-python-audit.json` and `news-display-audit.json`.

## Integration and remaining release requirements

- Source commit `0ac044f`: full local executable release-preflight passed; four QA reporter tests passed. GitHub run [43577693632](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/actions/runs/43577693632) passed **release-preflight** and **qa-inventory**, including the expanded news step. Remote source blobs match locally tested files.
- At final operational review, GitHub reports **mergeable / clean**, open/draft. Earlier normalized `mergeable:false` represented raw `null/unknown`, not a proven conflict.
- Pinned main `9e131c2c3823c257c267dc781866f3576344bb9e` is 29 commits beyond the actual merge-base, changing 14 data files. QA source has no overlapping path and no local merge conflict. All 18 other open PRs have no QA changed-file overlap, including advancing UFC #189 and boxing #11. Recheck before integration because data branches keep advancing.
- Branch-protection read still returns HTTP 403; public rulesets `[]` does not establish that classic protection is absent. Owner must verify required checks and bypass permissions before approval.
- Render `srv-dbnftjqjnfac73c9746g`: branch `main`, autoDeploy `yes`, trigger `checksPass`, previews `off`. Last inspected live deployment `dep-dbs0t26k1f9s73fvqgtg` serves `82572c64bf15c32e882180b5a6549d4791c378e1`, trigger `deploy_hook`. Existing main-only recovery can invoke the deployment hook after passing readiness. Merging is consequential; no hook was invoked here.
- Require both jobs passing on the final documentation head. Then owner approval may authorize the focused QA merge/deployment. Do not merge the separate browser-fixture branch or any research branch.
- After an approved deployment: verify deployed revision/asset hashes, desktop/mobile initial 12 and Show more/search/filter, Main/Prelims focus, Upcoming panels/local time, first normal news refresh's preferred article, and existing hourly monitor. The Python fix does not retroactively edit the existing live cache; expect the ordinary publisher to apply it on its next run. Do not manually republish data from this QA fixture.
- Native live-feed routing remains a separate blocker to native distribution. Full screen-reader/physical-device testing and broader security/dependency review remain outside this bounded web sign-off. ONE QA-002 stays deferred; all protected research and automations remain untouched.

Screenshots: [desktop Results](evidence-190/desktop-results.jpg), [mobile Upcoming](evidence-190/mobile-upcoming.jpg), [mobile preferred story](evidence-190/mobile-news-perry.jpg).
