# UFC V4 exception investigation — 14 November 2026

Source authority: [latest completed main Stage 3 audit, run 43562557229](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/actions/runs/43562557229) (commit `0b3f82005c015da0032cb224051fb792c7280be1`). **Before** this branch: 59 independently certified, 461 fast lane, 263 exceptions; all 783 evaluated. The two proposed attestations below are **not counted as certified until a new strict Stage 3 audit on this PR confirms them**. This document is evidence-only and must not modify collector caches.

## Nikolas Motta — exception `provider_history_discrepancy`

- Independent official [UFC biography](https://www.ufc.com/athlete/nikolas-motta) lists seven completed official UFC fights, 19 Feb 2022–21 Jun 2025, including the 18 Nov 2023 **no contest** against Trey Ogden (premature stoppage). [Greco pinned UFCStats results](https://github.com/Greco1899/scrape_ufc_stats/blob/c742842f29466758fedc3906dbad28d6d320a8da/ufc_fight_results.csv) has exactly seven fighter-specific rows and the same outcomes.
- Exact native IDs, oldest to newest: `61373`, `61189`, `60170`, `59985` (NC), `59923`, `38597`, `60275`; fighter numeric ID `1165`. All seven are present with paired measured rounds in saved index. The [shared NC source bout](https://ufcstats.com/fight-details/6e5a3d6b6ed84ac3) reconciles with Ogden's native corner.
- [2020 DWCS bout against Joseph Lowry](https://www.ufc.com/athlete/nikolas-motta) and TUF Brazil 4 exhibition contests are excluded. Provider `explicitFullProviderTimeline=false` does **not** establish a complete provider history; source evidence is independent. No missing official bout in seven-row Greco/UFC crosscheck.
- Proposed independent full-career evidence recorded in registry on this branch. **CI must pass the strict Stage 3 native identity, outcome, roster chronology and source gates**.

## Trey Ogden — exception `provider_history_discrepancy`

- Independent official [UFC biography](https://www.ufc.com/athlete/trey-ogden) lists seven completed UFC fights, 16 Apr 2022–11 Jan 2025, including the same 18 Nov 2023 **NC** against Motta. Pinned Greco UFCStats fight-results CSV has exactly seven matching fighter-specific rows and fight URLs.
- Native IDs, oldest to newest: `61526`, `61186`, `53835`, `59985` (NC), `38998`, `65931`, `60349`; numeric fighter ID `39`; seven measured saved records. The [Thiago Moisés bout](https://ufcstats.com/fight-details/54fa6e32330a8cca) is an **Ogden loss**, despite the official athlete page's superficial graphical “Win” label; the UFC detailed history explicitly says he lost, matching pinned source W/L and native winner.
- The cached 16 May 2026 Thomas Gantt listing (native `66121`) has **no completed result**, and no corresponding result in the independently sourced UFCStats history; it is not counted as a completed fight. Provider timeline lacks full-history attestation, which alone does not block independent source certification.
- Proposed independent full-career evidence recorded in registry on this branch; **pending strict Stage 3 audit**.

## Rodolfo Bellato — exception held for targeted native identity review

- [Official UFC biography](https://www.ufc.com/athlete/rodolfo-bellato) and pinned Greco source agree on **six completed official UFC fights**: Ihor Potieria (2 Dec 2023, win), Jimmy Crute (8 Feb 2025, **draw**), Paul Craig (14 Jun 2025 US-local, **NC**), Navajo Stirling (27 Sep 2025 US-local, loss), Luke Fernandez (7 Mar 2026, win), Christian Edwards (26 Sep 2026, loss).
- Source UFCStats links: [Potieria](https://ufcstats.com/fight-details/0dc2fc8d39e226a3), [Crute draw](https://ufcstats.com/fight-details/de85ef2fd4769070), [Craig NC](https://ufcstats.com/fight-details/13e2ff8b3a122094), [Stirling](https://ufcstats.com/fight-details/dc31d3260dea7dcf), [Fernandez](https://ufcstats.com/fight-details/a5abdc461cb1538e), [Edwards](https://ufcstats.com/fight-details/30b73c201daa089c).
- Six saved native UFC IDs: `59957`, `60982` (draw), `60289` (NC, 15 Jun UTC), `38214` (28 Sep UTC), `60697`, `85941`; numeric ID `34`. The two DWCS fights (`84047` against Vitor Petrino; `83862` against Murtaza Talha) are feeder contests and **excluded**. Native `66117` against Modestas Bukauskas on 16 May 2026 has no final result; do not count as completed UFC fight.
- **Precise unresolved blocker:** existing cached `ufcApprovedFullFightSearchChecks.rodolfo-bellato` is `manual_review`, `invalidRows:1`, `rejectedByReason.cached_native_id_or_event_identity_conflict:1` despite six source results and two excluded DWCS records. This specific rejected numeric-search row must be independently reconciled against its native event/bout/corner identity before a certificate can pass. Do **not** rerun the same six known source searches; inspect that rejected row and document whether it is a scheduled event, feeder event, alias, or real seventh official contest. No certification assertion made for Bellato.
- This structured blocker is intentionally preserved so future exception passes target the **single rejected row**, not repeat the entire fighter history search.

## Boundaries

No paid UFCalendar calls, no writes to collector-owned cache, no change to immutable 783 roster, no production V4 UI/ratings deployment, no release tracker or draft safety PR changes. [Issue #171](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/issues/171) remains the sole production release tracker.