# Independent boxing reconciliation — 14 November 2026 (batch 04)

Research-only; **no career certification** and no publication. Continuing batches 01–03, without re-fetching CompuBox or paid APIs.

## Newly corroborated historical bouts (Sam Goodman)

| Opponent | Australian event date | Result | Independent evidence | Status |
|---|---|---|---|---|
| Chainoi Worawut / Thachtana Luangphon | 2024-07-10 | Goodman W, UD12; judges 119–109, 117–111, 117–113 | [PBC Goodman bout listing](https://www.premierboxingchampions.com/fighters/553107); [Fightmag event results](https://www.fightmag.com/boxing-sam-goodman-vs-chainoi-worawut-results/); [Boxing247 report](https://www.boxing247.com/boxing-news/sam-goodman-overcomes-a-broken-hand-to-win-decision-over-worawut-boxing-results/280337) | BOUT_RESULT_CORROBORATED; opponent alias requires bout-scoped matching |
| Mark Schleibs | 2024-03-13 | Goodman W, TKO round 4 (scheduled 10) | [PBC bout listing](https://www.premierboxingchampions.com/fighters/553107); [independent historical bout list](https://fightannex.com/en/fighters/sam-goodman) | BOUT_RESULT_CORROBORATED; no punch stats inferred |
| Zhong Liu | 2023-12-15 | Goodman W, UD12 | [PBC bout listing](https://www.premierboxingchampions.com/fighters/553107); [independent historical bout list](https://fightannex.com/en/fighters/sam-goodman) | BOUT_RESULT_CORROBORATED |

## Exceptions and data integrity

1. **Promoter phantom bout:** [No Limit's Goodman page](https://nolimitboxing.com.au/fighters/sam-goodman) includes a January 20, 2025 **'Draw' against Naoya Inoue**, despite the fight having been cancelled. **Do not ingest as a professional result**. The same promoter page reports an outdated 21–1 record. [PBC](https://www.premierboxingchampions.com/fighters/553107) reports **23–1**, consistent with a 24-bout history in the [current detailed historical listing](https://en.wikipedia.org/wiki/Sam_Goodman_%28boxer%29); preserve source timestamps and independently reconcile the full register before marking current-record verified.
2. **Simplice Fotsala historical result conflict:** [Boxerlist](https://boxerlist.com/boxer/sam-goodman/540012) incorrectly lists Goodman **LOSS UD** on 2019-03-29; [FightAnnex](https://fightannex.com/en/fighters/sam-goodman) and the [detailed professional record](https://en.wikipedia.org/wiki/Sam_Goodman_%28boxer%29) list **WIN UD6**. Flag **RESULT_CONFLICT_REQUIRES_PRIMARY_CHECK**; do not trust Boxerlist for this row.
3. **Date-zone alias:** PBC presents Miguel Flores (2023-10-14/15) and Ra'eese Aleem (2023-06-17/18) as duplicate date variants. Match by opponent, event, method and round, never count both rows.
4. **Archived verification queue:** expected `research/boxing/archived-bout-verification-queue.csv` returned 404. **No row-level clearance claimed**; locate actual path before applying evidence to 345 queue entries.

## Measurable progress

- **3 newly independently corroborated bout results**, bringing documented unique bout-result corroborations to **9** across batches 01–04 (Goodman eight, Hutchinson one). These are result-level checks, **not complete career certifications**.
- **509 provisional profiles; 0 complete professional careers certified; 509 pending**. Existing 78 scouting profiles and 16 cached CompuBox reports unchanged.
- Next: resolve the Fotsala outcome against a primary register, locate queue file, independently reconcile remaining Goodman bouts and begin separate boxer identity batches. Do not mark 5/10/career complete based on partial bout lists.
