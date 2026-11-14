# Independent boxing reconciliation — 15 November 2026 (batch 12)

Research only; no profile or complete career certified.

## Candidate bout: Jesse “Bam” Rodriguez vs Saúl Juárez
- Date: **2020-12-12**, Las Vegas, Nevada; Rodriguez **W KO R2 2:05**. Status: `BOUT_REGISTER_CROSSCHECKED; CONTEMPORANEOUS_POSTFIGHT_CONFIRMATION_PENDING`.
- [KSAT prefight, published 10 December 2020](https://www.ksat.com/sports/2020/12/11/inside-the-ring-rodriguez-looks-for-more-wins-in-las-vegas/) identifies the exact opponent and event, Rodriguez **12-0**, Juárez **25-12-2**. Prefight source cannot establish outcome.
- [Saúl Juárez opponent-side bout register](https://en.wikipedia.org/wiki/Sa%C3%BAl_Ju%C3%A1rez) lists loss to Rodriguez 2020-12-12, KO R2 2:05.
- [RecordBoxing Rodriguez register](https://www.recordboxing.com/boxer.php?boxer_id=b5069412) independently lists date, opponent, outcome and time. [Boxing247 register](https://www.boxing247.com/boxer-profile/jesse-rodriguez) also matches.
- These historical registers may share upstream data: do **not** upgrade to independently corroborated without contemporaneous postfight or commission evidence. No duplicate count against prior 20 verified bouts.

## Critical identity ambiguity: Rodriguez's 2020-09-05 opponent
- [Boxerbook](https://boxerbook.com/es/peleas/6379/jan-paul-rivera-vs-jesse-rodriguez) identifies **Jan Paul Rivera** for the September 2020 KO1 bout.
- [RecordBoxing](https://www.recordboxing.com/boxer.php?boxer_id=b5069412), [Boxing247](https://www.boxing247.com/boxer-profile/jesse-rodriguez) and [Cageside](https://www.cageside.nl/fighter/jesse-rodriguez) instead identify **Janiel Rivera** (KO R1 2:03).
- Status: `OPPONENT_IDENTITY_CONFLICT`. **Do not merge** Jan Paul Rivera and Janiel Rivera or certify this bout until contemporary event documentation confirms the actual opponent. Treat date/result match as insufficient for identity.
- Boxerbook's own event chain links this as Rodriguez's previous fight before Juárez, but does not resolve the conflicting name.

## Controls and progress
- No complete-career inference from the 24-row historical register; validate every bout and account for potential omissions and event-local dates.
- Archived 345-row queue not found at `research/boxing/archived-bout-verification-queue.csv`; no queue rows marked reconciled.
- Cumulative **20 previously corroborated bout results**, **1 additional register-crosschecked candidate**, **1 opponent identity exception**. **0/509 full careers certified; 509 pending**.
- Existing 509-profile foundation, 78 scouting profiles and CompuBox cache untouched. No paid API, main, production, Render, or UFC V4 changes.
