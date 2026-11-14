# BEFN Quality & Efficiency baseline — 14 November 2026

Source inspected: main `90f084dc35ddc81c964ac53e8390228ec65ae6ed`. This is an initial baseline with explicit gaps, not a completed security/accessibility certification.

## Observed inventory

- 59 existing workflow files; 23 have schedules. 70 original test files; this change adds two test files.
- 15 open PRs and 190 branch refs, fully paginated at inspection. Branch existence does not prove active work. PR filenames and heads are saved in the evidence JSON.
- 245 distinct Actions runs across three bounded samples (latest 100 repository runs, latest 100 main runs, latest 50 failures). Per-workflow history URLs were rejected by the connector. No billing or exhaustive failure-rate claim is possible.
- Render static service `srv-dbnftjqjnfac73c9746g`: main, `checksPass`, publish `.`, trivial echo build command; PR previews off. Latest observed live deploy `dep-dbrvlfmk1f9s73fsblu0`, commit `f2784a35344ec96130156fca4820bb32ef4012d4`, via deploy hook. Main HEAD and deployed SHA are different; that alone does not establish a broken release or stale public asset.
- Release-readiness latest observed success: 43563087674. Render recovery: 43564676415 success. Live desktop/mobile profile QA: 43564903618 success. These are run results, not an independent visual review of every page.
- Branch-protection read denied (403); no conclusion about actual enforcement.
- Both named ChatGPT automations inspected and enabled: unified UFC certification hourly at :15; boxing hourly approximately :32. Their latest recorded runs were completed. No automation was edited.

## Highest-priority findings

| ID | Priority | Evidence and disposition |
|---|---|---|
| QA-002 | P1 | ONE backfill run 43554340366 failed: two matches for 2026-10-30. Preserve its fail-closed check pending exact identity investigation. |
| QA-001 | P2 | Actual native build fails on absent `editions`; fixed and regression-tested in this branch. |
| QA-003 | P2 | Full source gate lacked PR trigger and native build test; added before-merge validation, preserving main checks. |
| QA-005 | P2 | Consolidated advisory inventory/freshness/Actions report added to existing workflows. |
| QA-010 | P2 | Three original UI tests failed outside CI; card-order harness restored without removing ordering assertions. Event-status and card-order checks added to source gate. Two other stale harnesses remain open. |
| QA-004 / QA-009 | P2 | Broad news tests and repeated certification runner startup are efficiency candidates, not established cost savings. No schedules/tests deleted. |

Full evidence, root cause confidence, impact, risks, owners/conflicts, effort and closure gates are in `qa/findings.json`.

## Coordination boundaries

PRs #109, #133, #136, #137, #141, #179, #186 and #189 remain open research work. #130 is confirmed merged. #189 modifies the shared evidence register, Stage 3 code and research audit workflow. #48 changes period analytics and frontend; #47 changes V3 publication; #11 changes Boxerbook adapter/QA; #9 changes grappling data. Their full changed-file sets are recorded, not edited.

The boxing research branch exists. UFC release coordination issue #171 remains open. All UFC/boxing evidence, cohorts, calculations, collectors and their workflows are untouched. The proposed release gate and live monitor additions did not overlap the inspected open PR file lists. Recheck before merge because this is an active repository.

## Pipelines and refresh cadence

The detailed inventory records every workflow's exact triggers, permissions, concurrency, job dependencies/timeouts, action dependencies, called scripts and direct tests. Existing collectors remain separate where their failure domains/privileges differ.

- News: every 15 minutes; full Python discovery currently repeated on each run.
- Results and Fight Film: scheduled every five minutes.
- Upcoming: every three hours; browser polls visible upcoming tab every 15 minutes and updates countdowns every 15 seconds.
- Results browser: 30-second timer with existing live/idle throttling; live desk five minutes; notifications two minutes; event-state refresh one minute.
- UFC archive/UFCalendar: shared archive concurrency and bounded relay/watchdog; cache files are owned by existing collectors. No API requests were made by this audit.
- Social: separate Fight Talk/Meta/Twitter collectors and budget mechanisms; no quota changes.
- Production source gate, recovery controller and post-deployment browser QA already exist. Extend them; do not add a competing deployment controller.

## Test assessment and measurements

- Existing full Python discovery: **249 tests passed** before changes.
- Existing source release-preflight commands: all passed locally, including the new native build.
- New report tests: three passed (GitHub YAML `on`, test discovery mapping, branch-separated failure/recovery, missing/future/duplicate/date-only feed evidence).
- Native packaging regression passed and actual `npm run build` changed from failure to success. Bundled feed snapshot limitation remains; no native store readiness claim.
- Card-order assertions pass for main/prelims after restoring current DOM stub and selecting main explicitly. Original test assumed a removed note marker and a default main-only view.
- Static inventory initially found six test files not directly invoked by workflows. Four remain after adding event-state/card-order checks; indirect invocation may exist. `test-results-ui.cjs` currently fails on missing DOM `createElement`; `test-upcoming-cards.cjs` lacks required local-time support. These require focused fixture updates, not deletion of assertions.
- Current public-feed ID diagnostics pass. Results freshness is **unknown** because its review value is date-only. Source timestamps are reported without replacing missing information with zero.
- No runner-minute, API-budget or monetary savings are claimed. New report adds bounded CI overhead; later consolidation must demonstrate savings.

## Production smoke observations

Read-only live browser navigation exercised News, Champions, Fighter scout, Fights Upcoming/Results, Fight Talk and Fight Film. Pages rendered data; schedule displayed GMT+11 and distinguished unknown times from confirmed timestamps. Boxing sport filter changed selection and Fight Film content. Fight Talk showed original X embeds with platform/account/source links. Fight Film displayed publisher-labelled video links; playback/region availability was not independently verified from Australia.

Homepage fetched HTTP 200 (682,161 bytes); this is uncompressed HTML size, not a performance score. The homepage featured two Mike Perry signing articles from different publishers; semantic duplicate review recorded. This audit did not rewrite live articles.

## Remaining audit work (not represented as passed)

- Detailed mobile viewport, keyboard, screen-reader, image fallback, all links/video playback and approved-design parity review. Existing hourly profile QA supplies useful but narrower evidence.
- Exhaustive dependency vulnerability/licence scan and secret-history audit; no secret values were requested or exported.
- Full per-workflow failure/runtime/billing history and required-check settings.
- Exact ONE duplicate-event cause and remaining stale test harnesses.
- Per-feed source attribution/referential/date/status validation beyond existing unit tests and new structural diagnostics.
- Full request-level cache hit/yield metrics and cross-writer conflict analysis before schedule consolidation.

No merge, deployment, production setting, research record, paid API collection or automation change occurred. Proposed CI becomes active only after explicit integration approval.
