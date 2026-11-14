# BEFN UFC V4 — one coordinated full-career certification workstream

**Established:** 14 November 2026 (Australia/Melbourne). **Research-only / nonproduction.** Frozen approved roster: **783** fighters. This file coordinates *certification research*, not the separate staged production-release authority ([issue #171](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/issues/171)).

## Single source of truth for reporting

The **latest completed strict V4 offline certification gate** on branch `feat/ufc-v4-career-stat-foundation-20261114` is the **current V4 research certification checkpoint**. Its input source-attestation batch is `data/ufc-v4-independent-full-career-certification-batch-20261114.json`, **not** a certificate by itself. Confirm each fighter against successful full-cohort CI and exact gate output; do not count a proposed/failed/in-progress PR.

Checkpoint: [merged PR #185](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/pull/185), [strict CI 43563947389](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/actions/runs/43563947389): **147 independently V4-certified of 783, 636 not V4-certified**. This count is **nonproduction only**, subject to refresh from newer completed runs.

The `main` Stage 3 source-proof register (`data/ufc-independent-full-career-verification.json`) and `qa/ufc-v4-certification-queue.json` Action artifact remain **independent input and audit diagnostics**, not another additive certificate counter. Main's Stage 3 validator has additional source-provenance requirements and may not accept a V4 proof until it has been converted and individually validated. The 147 V4 certificates must be safely carried into the eventual main/R1 release gate, with no declaration that a main Stage 3 record equals a V4 certificate or vice versa. Never write V4 research into production to make counters agree.

## Measured cross-register inventory (source snapshot 14 Nov 2026)

- `main` Stage 3 registry: **66 source-attestation entries**.
- V4 strict-batch input: **147 source-attestation entries**, corresponding to 147 certificates in last confirmed V4 strict CI.
- **60 fighter slugs overlap**, **87 V4-only**, **6 main-only**. **153 unique source-attestation slugs is NOT a certified count**.
- Six main-only entries needing reconciliation without certificate promotion: `bruno-gustavo-da-silva` (12 source bouts), `carlos-hernandez-7` (7), `park-hyun-sung` (5), `ange-loosa` (6), `adrian-luna-martinetti` (1), `alexander-poppeck` (1).
- The three protected pilot cases (Bruno, Carlos, Park) have V4-specific exception handling. Do not bypass it by copying main entries. Other main-only entries need strict V4 checks, including identity, source count, official scope, native corners and full measured rounds.
- Compare slugs and bout IDs before creating or merging any PR; guard against overlapping changes by concurrent workers. Snapshot totals are **not** live counters.

## One end-to-end loop

1. Read newest completed V4 **strict** CI, the frozen 783 roster, its source-batch and feeder exclusions, then current `main` Stage 3 **strict** audit and original source register. Read open PRs before allocating any athlete.
2. Reconcile inputs **by immutable approved fighter slug**, not additive row totals or loose fighter names. Preserve full source provenance, known-bout IDs, all measured round statistics, official UFC dates/results, opponent corners, source snapshots and exact exclusion evidence.
3. Partition **783** into **certified (strict V4 passed)**, **fast-lane (all known fights measured but complete independent history not yet proven)**, and **exceptions (missing/contradictory bouts, identity, source coverage, metric gaps or failed gates)**. A sourced record can be *pending* or an exception; never infer certification from a registry row or all known bouts indexed.
4. **ONE hourly coordination worker** can handle both lanes in the same workstream: preferentially attempt some short unblocked fast-lane careers and work a bounded set of high-priority exceptions. Keep one per-fighter claim and PR, with reason code, evidence URLs, last attempt, next viable action, and CI outcome. Progress on exceptions must not block other fast-lane fighters.
5. Independently verify **every official UFC fight from debut through 14 Nov 2026**: exhaustive UFC athlete narratives and pinned UFCStats-derived fight/event identities, saved UFCalendar numeric native IDs/corners, dates, results, official NC/draws, TUF/RTU finals, measured rounds, aliases and verified DWCS/other feeder exclusions. Event titles are display metadata, not a strict exact-match gate. Retain unresolved contradictions as exceptions.
6. Commit only additive, nonproduction evidence via small conflict-safe changes. Re-check against latest branch before merge; require full 783 strict V4 CI and specific newly certified fighters/bout counts. No bypasses, guessed completions, or duplicate registry writers. On a bad gate, keep the exception and move to the next candidate.
7. Report a **single certification checkpoint** after each run: V4 strictly certified `N/783`, new verified fighters/bouts, main Stage 3 diagnostic count (explicitly labelled nonadditive), remaining uncertified, fast-lane/exceptions from that audit's relevant snapshot, provenance and CI URLs, blocks, next steps. If zero new certificates, state zero.
8. **Migration/production handoff:** Only after V4 certificates are translated and *individually pass* the canonical main/R1 strict validation, collapse to one authoritative `main` certified record and one shared report/queue. Crosswalk old/new IDs and require full cohort conservation; supersede obsolete attestations and duplicate workflows without deleting their provenance. Release remains gated by #171, and needs separate explicit authorization.

## Operating boundaries

- **Single paid collector:** keep existing five-minute UFCalendar GitHub collector as exclusive API/cache writer; certification and crosswalk research use read-only saved data.
- The prior separate `:45` exception automation is superseded by the consolidated `:15` UFC certification coordinator **once automation settings are confirmed updated**. Do not disable exception coverage until the mainline prompt owns both lanes.
- Keep **boxing**, **external NCAA/judo/grappling achievements**, and the **future full cross-promotion MMA fight-history** project separate from this UFC-only certification. Those are not certification dependencies.
- No website UI, V4 score/rating/classification deployment, public data, roster modification, API budget change, or release approval implied by this workstream.
