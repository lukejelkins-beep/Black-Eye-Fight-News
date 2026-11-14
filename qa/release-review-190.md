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
