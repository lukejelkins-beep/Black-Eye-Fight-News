# UFC V4 fast-lane: Adrian Luna Martinetti — independent official-source review (2026-11-14)

Status: **research-only; NOT certified**. Cohort slug: `adrian-luna-martinetti`. This is not a provider-cache update or V4 production change.

## Source identity and scope

Official UFC fighter profile: https://www.ufc.com/athlete/juan-martinetti (the official URL uses **juan-martinetti**, although the displayed fighter name is **Adrián Luna Martinetti**). Official biography gives UFC Octagon debut **2026-04-25**, and identifies one UFC Fight Night appearance against **Davey Grant** on **2026-04-25**. The profile separately lists a **2025-10-07** unanimous-decision win over **Mark Vologdin** in **Dana White's Contender Series, Season 9, Episode 9**: exclude that DWCS fight from the official UFC career.

## Critical result discrepancy requiring independent adjudication

The UFC profile's visible *athlete record* panel labels the **Grant vs Martinetti** bout **Win**, while its own detailed fight biography says **Martinetti LOST a three-round unanimous decision to Davey Grant**. The outcome cannot be accepted from the ambiguous panel label; check the official event scorecard and archived UFCStats-derived result with both corners before writing any result or attesting certification. The Japanese UFC page (https://jp.ufc.com/athlete/juan-martinetti) repeats the date with a local calendar-day offset (2026-04-26), so match by official event date and not locale display alone.

## Exact bounded next action

1. Read cached `data/ufcalendar-fighter-research.json` entry for `adrian-luna-martinetti` **in a memory-safe targeted reader**; retrieve original native fight ID and both corner names, date and final result for Grant, and identify whether Vologdin DWCS is improperly labelled UFC.
2. Independently verify official UFC Grant–Martinetti scorecard and a pinned UFCStats-derived *fight-detail* URL; verify result and native ID/corner, measured stats and zero extra UFC fights from UFC debut through roster snapshot.
3. If all gates pass, add a complete source-linked single-career certificate and run Stage3 strict CI; otherwise mark exact blocker and advance the next unassigned fast-lane candidate.

No native fight ID or result is guessed. No certification is granted on the basis of one displayed UFC panel, a name-only match, or a single saved fight.
