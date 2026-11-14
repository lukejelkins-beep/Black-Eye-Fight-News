# Independent boxing bout reconciliation — 14 November 2026 (batch 03)

Research-only evidence, extending batches 01–02. No profile certified and no statistics inferred.

| Fighter | Opponent | Local date | Outcome | Independent references | Status |
|---|---|---|---|---|---|
| Sam Goodman | Nick Ball | 2025-08-16, Riyadh | Goodman loss, UD12; Ball retained WBA featherweight championship | [PBC fighter bout list](https://www.premierboxingchampions.com/sam-goodman); [Fightmag contemporary report](https://www.fightmag.com/video-nick-ball-retains-title-in-fire-fight-with-sam-goodman/) | BOUT_RESULT_CORROBORATED; career incomplete |
| Sam Goodman | Cesar Vaca Espinoza (Cesar Vaca) | 2025-05-14, Sydney | Goodman win, UD10; scores 100-90, 99-91, 99-92 | [AAP contemporary report](https://aapnews.aap.com.au/news/goodman-eyes-world-title-shot-after-successful-return); [BoxingScene](https://www.boxingscene.com/articles/sam-goodman-cut-again-but-he-outpoints-cesar-vaca-in-sydney); [PBC fighter bout list](https://www.premierboxingchampions.com/sam-goodman) | BOUT_RESULT_CORROBORATED; opponent alias; career incomplete |

## Data-quality findings

- PBC's Sam Goodman fight list includes **two apparent entries for the same Goodman–Rodrigo Fabian Ruiz UD12**: April 4 and April 5, 2026, with short and full opponent billing. **Do not count these as separate bouts**. Preserve both source assertions, link by opponent/event/round/outcome, and flag for source-date normalization. [PBC](https://www.premierboxingchampions.com/sam-goodman).
- PBC's page also has historical opponent records alongside results. Do not treat a historical record snapshot as the fighter's current record.
- For Vaca, independently reported scores match exactly across AAP and BoxingScene. Match shortened 'Cesar Vaca' only when date, venue, result and round corroborate; do not globally merge all similarly named boxer identities.
- These two results bring **six distinct bout-result corroborations across batches 01–03** (Goodman five: Nishida, Ruiz, Blizzard, Ball, Vaca; Hutchinson one: Buatsi). This is not six certified histories. A five-fight recent sequence for Goodman has result evidence, but its completeness and chronology against a comprehensive professional register remain unverified.
- Cohort unchanged: **509 provisional profiles, 0 certified complete professional careers, 509 pending**. Archived queue baseline 345; exact row-level cleared count not asserted until original queue file is located and matched. Scouting profiles 78 and CompuBox reports 16 unchanged. No punch statistics newly ingested.

Next: locate the archived queue under its actual repository path; reconcile row keys; independently audit Goodman's remaining 19 earlier professional bouts before any full-career certification. Prioritize identities and complete records for other fighters in subsequent batches. No paid APIs, production or UFC V4 changes.
