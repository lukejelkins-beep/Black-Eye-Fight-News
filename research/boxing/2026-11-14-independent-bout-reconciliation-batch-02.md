# Independent boxing bout reconciliation — 14 November 2026 (batch 02)

Research-only evidence supplement to batch 01. No profile marked fully certified, no API or CompuBox cache re-fetch, no changes to production.

## Two additional independently corroborated Goodman bouts

| Fighter key | Opponent | Date evidence | Result | Evidence | Status |
|---|---|---|---|---|---|
| boxing-sam-goodman | Tyler Blizzard | 2025-12-17 (Sydney local) | Goodman win, UD 10; 100-90, 100-90, 99-91 | [BoxingScene contemporary report](https://www.boxingscene.com/articles/sam-goodman-returns-from-first-defeat-to-outscore-tyler-blizzard); [No Limit Boxing promoter fight history](https://nolimitboxing.com.au/fighters/sam-goodman) | BOUT_RESULT_CORROBORATED; career incomplete |
| boxing-sam-goodman | Rodrigo Fabian Ruiz (also billed Rodrigo Ruiz) | 2026-04-05 per Australian promoter; 2026-04-04 per US broadcaster | Goodman win, UD 12; 118-110, 116-112, 115-113 | [No Limit Boxing](https://nolimitboxing.com.au/fighters/sam-goodman); [PBC fight report](https://www.premierboxingchampions.com/bouts/736598); [PBC scorecard](https://www.premierboxingchampions.com/sam-goodman-vs-rodrigo-ruiz/scorecard) | BOUT_RESULT_CORROBORATED; LOCAL_DATE_DISCREPANCY; career incomplete |

**Date exception:** PBC labels the Goodman–Ruiz event April 4, while the Australian promoter records April 5. Store both source-asserted dates, identify event timezone before normalising, and do not use raw date equality alone to reject a matched bout. The opponent's shortened billing must not create a second fighter identity.

**Record-data exception:** No Limit Boxing's Sam Goodman fighter page currently displays a stale top-line record of 21-1-0 even while listing the April 2026 Ruiz win, and it does not reflect the September Nishida win. The independently reported post-Nishida 23-1 (8 KOs) is a dated snapshot, not proof of a complete career as of this run. [AAP September 27 report](https://aapnews.aap.com.au/news/sam-goodman-wins-ibf-interim-world-boxing-title), [Fightnews report](https://fightnews.com/aussie-goodman-defeats-nishida-wins-interim-ibf-122lb-belt). Preserve the contradiction; never replace a current record from an outdated promoter headline.

**Title-label exception resolution policy:** WBC's [official event listing](https://wbcboxing.com/en/events/willy-hutchinson-vs-joshua-buatsi/) and [November 8 result](https://wbcboxing.com/en/willy-hutchinson-defeats-joshua-buatsi-to-capture-wbc-interim-light-heavyweight-title/) both explicitly identify Hutchinson–Buatsi as **interim**. [Sky Sports](https://www.skysports.com/boxing/news/13609599/willy-hutchinson-crowned-as-new-wbc-light-heavyweight-champion-after-beating-joshua-buatsi-in-rematch) describes a vacant full championship. For BEFN canonical governing-body classification, prefer **WBC interim** with conflict noted; do not silently grant full champion status.

## Count accounting and remaining gates

- Cohort: 509 provisional profile foundations = 499 ranked plus 10 scouting; **0 certified full professional careers, 509 pending**.
- This batch adds **2 distinct independently corroborated Goodman bout results**, on top of batch 01's 2 independently corroborated bout results (Goodman–Nishida and Hutchinson–Buatsi): **4 cumulative bout-result confirmations** in these two evidence batches, not four fully verified profiles.
- Original archived queue size remains 345; exact row-level intersection for these two newly corroborated bouts requires queue inspection before incrementing the number of queue entries cleared. Do not assert a new cleared-queue count.
- Existing 78 scouting profiles and 16 cached CompuBox reports unchanged. No punch statistics newly ingested.
- Next: reconcile the archived queue path and exact row identities; verify Goodman's Nick Ball and Cesar Vaca Espinoza bouts against independent reports; then check all remaining career fights and record before certifying. Keep UFC work and production untouched.
