# Independent boxing reconciliation — 14 November 2026 (batch 06)

Research-only; no profile publication or full-career certification. Continued Jesse “Bam” Rodriguez, focusing on previously uncorroborated recent bouts and a source conflict. Checked prior batch 05 first to avoid duplicating its three bouts.

## New bout-scoped crosschecks

| Event-local date | Bout | Candidate result | Independent listings | Status |
|---|---|---|---|---|
| 2025-07-19 | Jesse Rodriguez vs Phumelela Cafu | Rodriguez W TKO10 (2:07) | [Boxing247 professional history](https://www.boxing247.com/boxer-profile/jesse-rodriguez); [Cageside history](https://www.cageside.nl/fighter/jesse-rodriguez); [Martialbot history](https://www.martialbot.com/boxing/boxers/jesse-rodriguez-81e17b65b3c7f4fc9f7b5c8f76ce8bd2) | MULTI_REGISTER_MATCH; contemporaneous event-report check still required |
| 2024-06-29 | Jesse Rodriguez vs Juan Francisco Estrada | Rodriguez W KO7 | [Cageside history](https://www.cageside.nl/fighter/jesse-rodriguez); [Martialbot history](https://www.martialbot.com/boxing/boxers/jesse-rodriguez-81e17b65b3c7f4fc9f7b5c8f76ce8bd2); [Champinon history](https://champinon.info/boxing/jesse-rodriguez/) | MULTI_REGISTER_MATCH; contemporaneous event-report check still required |

These are **two newly crosschecked candidate bouts**, not independently certified event outcomes: multiple aggregators can share upstream data. Do not promote to BOUT_RESULT_CORROBORATED until an event/commission/promoter or contemporaneous independent report confirms date, opponent, outcome and method.

## New quality finding — Vargas method conflict

The 2026-06-13 Rodriguez–Antonio Vargas result is already covered in batch 05; **do not count it again**. [Reuters (14 June 2026)](https://www.reuters.com/sports/rodriguez-knocks-out-vargas-become-world-champion-third-weight-class-2026-06-14/) and [Boxing247](https://www.boxing247.com/boxer-profile/jesse-rodriguez) classify the sixth-round finish as **KO**; [BBC Sport (14 June 2026)](https://bbc.com.im/sport/boxing/articles/c14yn2mn40yo) calls it **TKO**. Keep METHOD_LABEL_CONFLICT open pending official result/commission classification. Do not silently overwrite KO or TKO. BBC reports 81/213 total punches for Rodriguez and 81/279 for Vargas; these are **journalistic totals, not validated CompuBox cache** and must not be ingested as CompuBox or as round-by-round data.

## Career candidate register / record status

[Boxing247 (snapshot updated 2026-09-17)](https://www.boxing247.com/boxer-profile/jesse-rodriguez) and [Cageside](https://www.cageside.nl/fighter/jesse-rodriguez) list 24 professional bouts, 24-0 with 17 stoppages. [BBC (14 June 2026)](https://bbc.com.im/sport/boxing/articles/c14yn2mn40yo) independently reports 24-0/17 stoppages after Vargas. This is a **dated record snapshot**, not independently verified current record on 2026-11-14 and **not** proof of full career completeness. Candidate list is useful for future row-by-row 5/10/career reconciliation. Preserve aliases (Fernando Martínez/Fernando Daniel Martínez) as unresolved until stable identity evidence exists.

## Progress / constraints

- Batch 06: **2 new multi-register candidate bout matches**; **0 newly event-corroborated bouts**, **0 newly certified careers**.
- Across batches 01–05: **12 reported event-corroborated bout results**; keep separate from these 2 candidate matches and verify exact archive queue membership before clearing rows.
- Cohort unchanged: **509 provisional profiles, 0 certified complete careers, 509 pending**. Existing 78 scouting profiles and CompuBox report cache unchanged.
- The purported 345-row archived verification queue was not found at `research/boxing/archived-bout-verification-queue.csv`; actual location remains unresolved.
- Next: secure contemporaneous Cafu/Estrada result sources, commission classification for Vargas, identify actual archived queue path, then reconcile all 24 candidate career rows and dated record updates.
