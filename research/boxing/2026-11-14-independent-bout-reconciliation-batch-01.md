# Independent boxing bout reconciliation — 14 November 2026 (batch 01)

Research only; not a full-career certification or a production dataset. Cross-checked against the existing 345-entry archived verification queue and 16 cached CompuBox reports. No API calls, no CompuBox re-downloads.

| Boxer ID | Date | Opponent | Outcome / method | Independent evidence | Status |
|---|---|---|---|---|---|
| boxing-sam-goodman | 2026-09-27 | Ryosuke Nishida | Win, UD 12; 114-111, 115-110, 116-109 | [The Ring](https://www.ringmagazine.com/news/6NEh5BJgZU7BgwakRINGyh), [Nine](https://www.nine.com.au/sport/combat-sports/boxing-news-sam-goodman-ryosuke-nishida-ibf-super-bantamweight-world-title-fight-result-video-reaction-20260928-p610xd.html), [Fightnews](https://fightnews.com/aussie-goodman-defeats-nishida-wins-interim-ibf-122lb-belt) | RESULT_INDEPENDENTLY_CORROBORATED; title: IBF interim |
| boxing-willy-hutchinson | 2026-11-07 | Joshua Buatsi | Win, UD 12; 117-112, 115-113, 115-113 | [WBC](https://wbcboxing.com/en/willy-hutchinson-defeats-joshua-buatsi-to-capture-wbc-interim-light-heavyweight-title/), [Sky Sports](https://www.skysports.com/boxing/news/13609599/willy-hutchinson-crowned-as-new-wbc-light-heavyweight-champion-after-beating-joshua-buatsi-in-rematch), [BoxingScene](https://www.boxingscene.com/events/joshua-buatsi-willy-hutchinson-2) | RESULT_INDEPENDENTLY_CORROBORATED; TITLE_CLASSIFICATION_CONFLICT |

## Exceptions and non-inference

- **Willy Hutchinson title classification**: WBC's 8 November report calls the belt **interim**, while Sky Sports and BoxingScene report a **vacant/full WBC** title. Preserve both claims and do not silently set a definitive full-champion flag until an official WBC rankings/title registry reconciles them.
- The Hutchinson–Buatsi rematch is **later than** the archived queue's five bouts for Hutchinson, so the legacy last-five sequence is stale. Recompute the latest five only after checking intervening bouts and their dates.
- The Goodman–Nishida result is an independently corroborated **single bout**, not verification of his other four archived bouts.
- Fight-day reported records are snapshots, not verified current records. No full career is certified; no five-/ten-/career punch aggregates are inferred.
- The cached CompuBox report for Hutchinson–Buatsi may be matched using date/opponent, but this evidence note does not re-ingest or duplicate that report.

## Count accounting

- 509 provisional profile foundations (499 ranked + 10 extra scouting), **0 full careers certified**.
- 345 archived bout rows still in the original review queue; this batch independently corroborates **1** of those archived rows (Goodman–Nishida) plus **1** newer bout not in that queue (Hutchinson–Buatsi).
- 16 existing CompuBox report cache entries unchanged; 7 existing curated bout results unchanged.
- These are **two bout-result confirmations**, not two verified profiles. Do not count them as career certifications.

Next: verify the remaining high-priority archived bouts and resolve the WBC title designation before updating titleholder labels.
