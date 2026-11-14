# PR #190 integration review

## Recommendation

Keep the PR draft pending live or approved-preview mobile/keyboard verification. Source checks alone do not establish visual or assistive-technology correctness. No merge or deployment is authorised by this report.

## Verified evidence

- PR head 1519a66925409b8df184f48499ab75c2ae4d7058 passed both release-preflight and qa-inventory in Actions run 43571004265.
- GitHub reported the PR mergeable against main a25f1fb499c2a3d003b2ac572d8a2483232320d6. This is conflict detection, not approval or branch-protection proof.
- The subsequent QA-014 reporter correction passed all four reporter tests and generated the cached-feed report locally; its own CI must be checked separately.
- Source fixes have failing-before/passing-after regressions for terminal upcoming events, Results section focus, upcoming All panel references and empty-feed diagnostics.
- Nine measured scheduled runs did not justify dropping fast tests or combining workflows with different privileges. No financial saving is claimed.

## Remaining release checks

1. Verify the final PR head passes both jobs, and recheck changed files in concurrent PRs before integration.
2. On an approved preview, check Results and Schedule at a narrow mobile width and desktop: card expansion, All/Main/Prelims, keyboard focus after selection and refresh, horizontal overflow, portrait fallback and local-time labels. Run a screen-reader spot check of section relationships. Record browser, viewport and revision.
3. Owner verifies required GitHub checks and bypass permissions; administration read returned 403. Do not assume protection is absent.
4. Review the public native bundle list. Packaging success does not approve native distribution: remote live-feed routing is still outstanding.

## Approval and rollout sequence

After the above evidence is complete, request explicit approval for this PR's merge and production deployment. Render auto-deploy and existing hook/recovery paths mean merging may publish changes; treat approval as consequential. Do not merge unrelated research branches.

After an approved deployment, verify the deployed revision, run read-only production checks and inspect the existing hourly monitor's first operational report. Data warnings require triage, not automatic data editing. If rollback is needed, prepare a focused revert of QA code and obtain approval before publishing it; preserve concurrent research/cache updates.

## News investigation

The cached news feed contains both Mike Perry signing headlines observed in production. The exact matcher treats `re-signs` as a contract extension, whereas `signs ... after five-year split` has no event type. Their short titles do not satisfy generic overlap thresholds. This explains the observed missed match without any new provider collection. A future focused dedupe change needs negative fixtures for rumours, contract offers, rejection, different promotions and subsequent fight bookings before changing publication behavior. Existing articles are unchanged.

## Boundaries

ONE remains deferred. Fighter cohort, certification standards, research evidence and collection schedules are unchanged. No fresh live mobile or screen-reader pass is claimed; the previous browser inspection timed out on Fights navigation. Broader security/dependency review remains open.

## Results rendering follow-up

A fresh live tab loaded Homepage and Upcoming. Selecting Results succeeded, but full DOM inspection timed out; a minimal DOM read succeeded and measured 110,282 descendants inside Results, including 886 bouts. This supports a size-related inspection limitation, not a demonstrated navigation failure. User latency remains unmeasured.

QA-015 limits initial rendering to 12 event cards and provides Show more. Search filters the complete cached dataset before pagination. The existing card-order suite now verifies reaching all 76 cached events, searching an older event and resetting pagination on search change. All local release-preflight checks passed. No stored records are removed. Repeated expansion can still grow the DOM; approved-preview mobile, focus and runtime verification remains required.

## Latest remote CI verification — 14 November 2026

- Verified QA head `59de1f46418b0b73a8b2a11b63d040984043884e` in GitHub Actions run `43573161795` (`BEFN release readiness`): **completed successfully**.
- Both `release-preflight` (job `132381664578`) and `qa-inventory` (job `132381664806`) concluded **success**. The former included native packaging, frontend and results validation without provider calls; the latter included read-only reporter tests, inventory and artifact upload.
- PR #190 was confirmed **open/draft/unmerged** against `main` at `a25f1fb499c2a3d003b2ac572d8a2483232320d6` before this documentation-only update.
- Successful CI does **not** establish mobile browser behavior, accessible focus, a reduction in perceived latency, or deployment readiness. Preview testing and DOM/runtime comparison remain open.
- Preview checks could not run in the receiving chat: connected browser access requires the originating extension context, and Render requires the owner to select its workspace. No preview or production deployment was attempted.

## QA-007 news dedupe follow-up — 14 November 2026

- Updated `scripts/news_dedupe.py` with a deliberately narrow match for **confirmed return-signing** headlines, such as “Mike Perry re-signs with UFC” versus “UFC signs Mike Perry after five-year split.” Both must agree on an explicitly named promotion, at least two distinctive subject tokens, publication within 72 hours, and the same editorial stage. This is not a generic rule merging every story about a named fighter.
- Added seven focused tests to `tests/test_news_dedupe.py` covering the target match, rumour versus confirmation, offered/rejected contracts, a different fighter, a different promotion, a later booking/new role, and a separate news cycle. These checks join the **existing** `befn-release-readiness.yml` PR workflow. No new schedule or provider request was introduced.
- On implementation commit `1e50a5045a85126172c3f5d09cd546d3b90e42f3`, GitHub Actions run [43575558020](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/actions/runs/43575558020) **passed** both `release-preflight` and `qa-inventory`. The dedicated “Verify conservative news deduplication without collection” step passed. Latest-source CI is source-level proof only, not a production editorial sign-off.
- No cached article, published record, news collector or automation was changed. Review the actual non-production feed outcome before integration; false-positive editorial merging remains a release risk.
- QA-015 still requires **real preview mobile/desktop and focus testing** and before/after DOM/runtime measurements. The earlier observed 110,282 Results descendants is a production baseline, not a measured branch improvement.
- The receiving normal chat could not access its originating connected-browser extension context. Render preview inspection also requires an owner-confirmed workspace. No preview browser pass, deployment, merge, production source edit or screen-reader check was performed here.
- PR #189's latest inspected changed file list concerned UFC research evidence and scripts, with no overlap with the QA news-dedupe files. Recheck both branches immediately before any integration.

## Current feed and concurrent-main sanity check

- Read-only inspection of `main:data/news-live.json` found **280 articles** and both observed Mike Perry headlines still present, with `sport=mma` and timestamps 2026-11-13T20:02:19+00:00 and 2026-11-13T13:28:00+00:00 (approximately **6.6 hours apart**). The PR does not modify the cached file.
- A read-only JavaScript candidate scan of the 280 current cached article titles using the narrow return-signing criteria found **one candidate pair**, those same two headlines. This is a focused candidate check, not an end-to-end execution of Python `deduplicate()` over the full news feed or a production editorial acceptance test.
- `main` advanced **17 commits** relative to original PR #190 base `a25f1fb499c2a3d003b2ac572d8a2483232320d6`. The compared main changes were in feed/data snapshots, including news-live, not in the QA frontend, tests or dedupe source being changed. Recheck the final head and conflicts before integration rather than assuming the original base is current.
