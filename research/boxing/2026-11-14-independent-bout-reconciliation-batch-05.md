# Independent boxing reconciliation — 14 November 2026 (batch 05)

Research-only evidence. No profile publication or full-career certification. New fighter focus: **Jesse “Bam” Rodriguez**, **Fernando Martínez**, **Antonio Vargas**, **Pedro Guevara** (bout-scoped identities; do not merge automatically).

## Corroborated results (not full career certification)

| Date (event-local) | Bout | Result | Corroboration | Status |
|---|---|---|---|---|
| 2026-06-13 | Jesse Rodriguez vs Antonio Vargas | Rodriguez W KO6, 1:15; WBA bantamweight title | [Reuters, 2026-06-14](https://www.reuters.com/sports/rodriguez-knocks-out-vargas-become-world-champion-third-weight-class-2026-06-14/); [Boxerbook bout](https://boxerbook.com/bouts/6367/jesse-rodriguez-vs-antonio-vargas) | BOUT_RESULT_CORROBORATED; not proof of career completeness |
| 2025-11-22 | Jesse Rodriguez vs Fernando Martínez | Rodriguez W KO10, 1:25; WBA super-flyweight belt gained | [WBC event listing](https://wbcboxing.com/en/events/jesse-rodriguez-vs-fernando-martinez/); [Fightnews report](https://fightnews.com/bam-dominates-puma-in-10/177581); [San Antonio Express-News](https://www.expressnews.com/sports/article/bam-rodriguez-wins-knockout-claim-wba-21203898.php) | BOUT_RESULT_CORROBORATED; source conflict for Martínez's prefight record |
| 2024-11-09 | Jesse Rodriguez vs Pedro Guevara | Rodriguez W TKO3; WBC and Ring super-flyweight defence | [Matchroom event results](https://www.matchroomboxing.com/events/ennis-vs-chukhadzhian-and-rodriguez-vs-guevara/); [San Antonio Express-News report](https://www.expressnews.com/sports/article/bam-rodriguez-wins-tko-philadelphia-19904168.php) | BOUT_RESULT_CORROBORATED |

## Record and source reconciliation

- Reuters' June 14, 2026 report puts Rodriguez at **24–0 after Vargas**, consistent with a 24-row [historical listing](https://en.wikipedia.org/wiki/Jesse_Rodriguez) and [Cageside](https://www.cageside.nl/fighter/jesse-rodriguez). **Record snapshot corroborated as of 2026-06-14**, not certified current as of November 14 and not a certified 24-bout career register.
- Martínez pre-fight discrepancy: [Boxerbook](https://boxerbook.com/bouts/6368/jesse-rodriguez-vs-fernando-martinez) lists **20–0 going in**, while contemporary [Fightnews](https://fightnews.com/bam-dominates-puma-in-10/177581) and [San Antonio Express-News](https://www.expressnews.com/sports/article/bam-rodriguez-wins-knockout-claim-wba-21203898.php) say **18–1 after loss**, consistent with **18–0 before**. Mark **PREFIGHT_RECORD_CONFLICT**; do not overwrite a verified fighter record from this bout page.
- [Fight Scores](https://fightscores.co/fights/jesse-rodriguez-vs-fernando-martinez-2025-11-22) labels the Martínez stoppage TKO10 while contemporaneous reporting and Boxerbook say KO10. Mark **METHOD_LABEL_CONFLICT**; retain KO10 as report-supported but do not silently normalise the conflicting source.
- The historical Rodriguez list is a **candidate register only**; independently reconcile all rows before claiming five/ten/career history complete. The [Cageside listing](https://www.cageside.nl/fighter/jesse-rodriguez) explicitly cautions that historical coverage can be incomplete.
- These three are distinct bout IDs by date/opponent. Do not create opponent identities by name alone, infer missing CompuBox statistics as zero, or fetch paid APIs.

## Progress and next action

- **3 new unique bout-result corroborations** this batch; **12 across batches 01–05**, subject to checking against the archived 345-row queue when located.
- **509 provisional profiles; 0 complete careers certified; 509 pending**. Existing 78 scouting profiles and cached CompuBox reports unchanged.
- The queue at `research/boxing/archived-bout-verification-queue.csv` remains not found; locate its actual path before row-level clearance.
- Next: verify independent Rodriguez professional debut-to-present register, resolve Martínez record and KO/TKO discrepancy against an official commission/bout register, then expand to other ranked fighters.
