# BEFN — UFCalendar UFC historical round-stat field audit

**Audit date:** 2026-11-13  
**Scope:** UFC, completed 2008–2026  
**Execution:** https://github.com/lukejelkins-beep/Black-Eye-Fight-News/actions/runs/43411817772  
**Method:** authenticated read-only UFCalendar `/coverage`, `/usage`, stratified `/fights/search`, `/fights/{id}/rounds`, and one `/fights/{id}/stats` quality check per year. No production data mutations.

## Sample

- 19 years × 3 fights/year (Jan–Apr, May–Aug, Sep–Dec) = **57 UFC bouts**.
- **324 fighter-round rows** inspected; all 57 sampled bouts returned round rows.
- **135 API requests** including usage, coverage, search, rounds, and quality checks.
- Provider-reported yearly `fights_with_rounds / fights_completed`: **100% per year 2008–2023**, **99.8% in 2024**, **99.7% in 2025**, **100% in 2026**.

## Per-field presence, 324 sampled fighter-round records

| UFCalendar field(s) | Records with numeric value | Notes |
|---|---:|---|
| `sig_strikes_landed`, `sig_strikes_attempted` | 324 / 324 (100%) | Main striking metrics |
| `total_strikes_landed` | 324 / 324 (100%) | |
| `head_landed`, `body_landed`, `leg_landed` | 324 / 324 (100%) | Target splits |
| `distance_landed`, `clinch_landed`, `ground_landed` | 324 / 324 (100%) | Strike-position splits, **not time** |
| `knockdowns` | 324 / 324 (100%) | Zero means a recorded zero |
| `takedowns_landed`, `takedowns_attempted` | 324 / 324 (100%) | |
| `submission_attempts`, `reversals` | 324 / 324 (100%) | |
| `control_time_sec` | 324 / 324 (100%) | UFC control time; distinct from position time |
| `distance_time_sec`, `clinch_time_sec`, `ground_time_sec` | 80 / 324 (24.7%) | Not reliable for universal profiles/leaderboards |

Position-time availability in the sample was **0% each year 2008–2021**, **33.3% in 2022**, **100% in 2023–24**, **66.7% in 2025**, **100% in 2026**. These are *sample* measurements; 2025 remains uneven. Per-fight totals quality flags (`has_totals`, `has_rounds`, `has_position_data`, `rounds_sum_matches_totals`) were positive for one sampled fight each year; this does not prove whole-year completeness.

## Recommended research rules (not yet deployed)

1. **Finish the 36-month roster eligibility audit first.** Retired, departed, or later non-UFC professional MMA fighters do not qualify. The roster cutoff does not truncate historical fights.
2. **No field-based cutoff in 2015, 2016 or 2020 for the main UFC statistical metrics.** Sampled detailed UFC round fields were available even in 2008. Use **2008 as a provisional expected earliest fight year**, but derive the true research floor from each verified eligible fighter's earliest UFC bout. Do not silently omit qualifying older UFC bouts.
3. **Fetch once per unique UFC bout ID, not per fighter or individual field.** The same `/fights/{id}/rounds` response supplies both athletes and every recorded round. Reuse existing archived round observations. Avoid repeated `/stats` calls when rounds already provide the required data.
4. **Store missing fields as null, never zero.** Validate UFC bout identity, date, event, both corners, expected rounds and available quality flags. A sample's 100% field presence is not evidence that every fight has 100% coverage.
5. **Treat position-time fields as optional.** Do not issue additional requests merely to chase distance/clinch/ground-time data for pre-2022 UFC bouts. For later bouts, consume these fields when present in an otherwise necessary round-stat request, but do not use them for universal career leaderboards until independently validated across the eligible roster. Standard `control_time_sec` should still be collected for every available year.
6. **Respect existing request caching and retry guards.** A transient outage warrants bounded retry; a confirmed missing metric must not trigger repeated paid requests. Keep existing provider allowance and budget/rate-limit protections.
7. **Compute Last 5, Last 10 and UFC Career views from stored UFC bouts only**, applying separate statistical denominators for actually measured rounds/fights. No production UI/leaderboard changes until source and profile QA pass.

## Limitations

This is a **small stratified availability audit**, not an exhaustive year census, and field *presence* does not independently guarantee statistical correctness for every fight. Missing data remains possible in unsampled bouts. The annual provider `/coverage` endpoint reports fight-level existence of statistics/round records rather than per-field completeness. Audit script: `scripts/audit-ufcalendar-era-coverage.py` on this branch.
