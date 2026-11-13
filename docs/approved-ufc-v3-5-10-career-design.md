# Approved BEFN UFC Fighter V3 performance design — 13 November 2026

## Decision

Preserve the existing approved V3 profile **visual structure**: portrait and bio, Overall BEFN rating, five technical bars, compact fight history, nine-tile performance panel, performance highlights, detailed stats/rankings. **No redesign or layout expansion.**

### UFC-only performance period

Use one period selector, **Last 5 / Last 10 / UFC Career**, consistently in the nine tiles, detailed statistics, period-specific highlights and leaderboards. Default to Last 5 *when available*, otherwise UFC Career. Career means **all UFC fights, not all professional MMA fights**, and can include 2008 or earlier if an eligible roster member requires it.

A filter is selectable only when its period contains at least that many **verified distinct completed UFC bouts**: Last 5 >= 5; Last 10 >= 10; Career >= 1. A no-contest is part of fight history but should not contribute to W/L/D or conventional ranked performance samples. A fighter with 3 UFC bouts sees only Career; 7 sees Last 5 + Career; 10+ sees all three. In a fixed-period selection, **do not substitute older bouts when any of the selected bouts lack a metric**. Treat stats that were not measured as *missing*, not zero.

The entire database should first contain every verified UFC career result and as much reliable round-by-round evidence as the UFCalendar API provides. A given bout may have results but not complete detailed statistics.

### Nine headline statistics, exactly nine (existing tile geometry)

1. Record — W–L–D, scope-selected UFC results.
2. KO/TKO wins — **count**, separately verified by result method.
3. Submission wins — **count**, separately verified by result method.
4. Significant strikes landed per minute — total landed / measured cage minutes.
5. **Net significant strikes per minute** — (landed − absorbed) / measured cage minutes. **Replaces Strike Accuracy tile.**
6. Knockdowns per 15 minutes — UFC knockdowns per 900 seconds.
7. Takedowns landed per 15 minutes — UFC takedowns per 900 seconds.
8. Control time per 15 minutes — format m:ss, UFC `control_time_sec` relative to measured cage duration. **Not distance/clinch/ground position time.**
9. **Submission attempts per 15 minutes** — UFC attempts per 900 seconds. **Replaces Takedown Defence tile.**

Retain strike accuracy and takedown defence in **detailed statistics and leaderboards**, not the nine headline tiles.

### Other detailed statistics / leaderboards

Keep current: significant strikes absorbed/min, net sig. strikes/15 min, knockdowns/15, takedowns/15, control/15, net control/15, submission attempts/15, striking accuracy, takedown defence, KO/TKO wins, submission wins.

Support an additional view/category for strike defence, knockdowns received/15 and knockdown differential/15, takedown accuracy, reversals/15 and KO/TKO/submission finish rates, subject to reliable measured data and ranking QA.

Use per-15-minute rates rather than raw totals for performance comparisons across differing samples, apart from explicitly named *count* leaderboards. Derive every leaderboard from the same fixed selected UFC bouts, applying clear metric-specific coverage/qualification thresholds and division scope. Do not mix PFL/ONE/Bellator statistics into UFC rankings. Never label a partial sample a full career average.

### Keep these fixed when a period changes

- Overall BEFN score; technical bars; prospect/contender classification remain unchanged until a **separate period-specific ratings algorithm** is designed and approved.
- Profile shell, portrait, credentials and styling remain as approved.
- Fight history remains compact; permit expansion to additional UFC results instead of growing the dialog unnecessarily.

### Data and UI safeguards

- Key all joins by **verified unique UFC bout ID**, matching fighter and event; deduplicate aliases.
- Sort fights newest to oldest before taking 5 or 10; Career is all UFC bouts.
- Always count the **fixed actual time window of fights**, not “last N with stats.” Show a small *N of M bouts with measured statistics* context where required.
- No invented statistics, no conversion of missing to zero, no fake rankings for low sample counts. A genuine zero is valid.
- A short fight can inflate rates: leaderboards must use consistent minimum sample and minimum cage-time rules, not just fight count; final numeric thresholds require validation against completed history.
- Do not spend UFCalendar API requests chasing `distance_time_sec`, `clinch_time_sec`, `ground_time_sec` before 2022. The 2008–2026 audit found 100% field presence for headline/core metrics in sampled fighter-round records, but only 24.7% for position-time fields.
- Archive/cache each `/fights/{id}/rounds` response once per UFC bout; it contains both fighter corners, all rounds. Avoid repeat API calls for the same data.
- Distinguish **verified results coverage** from **metric coverage** and expose both to backend QA.
- Current 36-month eligibility roster and full UFC career backfill are prerequisites before applying the controls to production; users must not see unusable controls or misleading approximations.

## Rollout order

1. Finalise rolling **36-month active UFC eligibility** based on *most recent completed professional MMA fight overall being UFC*, with retirement/departure and later professional MMA outside UFC exclusions; ambiguous cases remain under review. This rule gates the roster only.
2. Build complete UFC career results and round statistics, leveraging cached UFCalendar data and QA evidence.
3. Compute **Last 5 / Last 10 / Career** statistical periods and separate period-specific leaderboards offline, with tests on 0/1/3/4/5/9/10/11-fight cases; missing fields; NC; dupe IDs; short fights; outcomes.
4. Add minimal selector and wire existing nine-tile grid / detailed list / highlights / leaderboard filters without altering overall ratings.
5. Run mobile/desktop QA and verified-sample audits in preview; only then release through existing guarded CI and Render deployment.

## Verification

UFCalendar metric availability audit (2008–2026): https://github.com/lukejelkins-beep/Black-Eye-Fight-News/actions/runs/43411817772 . This is a **sample** (57 bouts, 324 fighter-round rows), not a census. Full audit report: https://github.com/lukejelkins-beep/Black-Eye-Fight-News/blob/audit/ufcalendar-era-coverage-20261113/docs/ufcalendar-2008-2026-metric-availability.md .

## Deployment status

**Approved design specification only.** Feature work must not directly change production until the 36-month roster and full-career data, UI and QA acceptance conditions are satisfied.
