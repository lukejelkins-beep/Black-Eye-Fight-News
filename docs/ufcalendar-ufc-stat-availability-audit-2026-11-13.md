# BEFN UFCalendar UFC Historical Statistical Availability Audit

**Date:** 2026-11-13
**Scope:** Read-only live authenticated UFCalendar v1 API queries. No production files or data were updated.
**Runs:**
- [Annual coverage + 32 selected historical fight samples](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/actions/runs/43410785612)
- [Focused 1993–2002 field audit, up to four fights/year](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/actions/runs/43411078398)

## Provider-reported annual coverage

GET /v1/coverage?org=ufc returns settled fights and their fight-total / per-round coverage by year.

| Year(s) | Completed UFC fights | With per-round data | Coverage |
| --- | ---: | ---: | ---: |
| 1993 | 8 | 8 | 100% |
| 1994 | 31 | 29 | 93.5% |
| 1995 | 40 | 34 | 85.0% |
| 1996 | 43 | 36 | 83.7% |
| 1997 | 40 | 38 | 95.0% |
| 1998 | 25 | 21 | 84.0% |
| 1999–2023 | all settled fights each year | all settled fights each year | 100% every year |
| 2024 | 567 | 566 | 99.8% |
| 2025 | 575 | 573 | 99.7% |
| 2026 (through audit date) | 552 | 552 | 100% |

**Important:** `fights_with_rounds` counts fights containing round rows, NOT every metric's completeness. An entire historical year may have 100% round coverage while its control time is null on every row.

## Field-level test samples

- First successful field test: up to two distinct bouts across 16 years (32 bouts); requested /fights/{id}/rounds and inspected numerical fields.
- Focused early-era test: four bouts/year across 1993–2002; /fights/{id}/rounds, one /fights/{id}/stats quality check/year.
- 1993–1999: **68/68 sampled fighter-round records have significant strike counts; 0/68 have control_time_sec**.
- 2000–2002: **54/54 successfully fetched sampled fighter-round records have significant strikes and control_time_sec**. One 2002 /rounds request returned HTTP 429 (rate-limited) and is **excluded** from this denominator.
- Sampled fields for 2015 (16/16 rows) and 2016 (12/12 rows) included significant strikes, takedowns, submission attempts, knockdowns, control time, total strikes and target/position splits.
- 1993 sampled rounds lacked head/body/leg and distance/clinch/ground strike splits; the early-era availability of these extra fields differs from availability of core strikes.

## Recommended bounded collection parameters

1. **No UFC statistical cutoff in 2015 or 2016.** Full per-round UFC data exists in the provider's 2015/2016 cohorts.
2. **For UFC bouts from 2000 onward:** collect /rounds once for uncached verified fights, retaining all numerical fields present; calculate each metric only over valid observed values (zero is a valid observation). Use source quality flags and cross-check available round-sum equality / expected rounds.
3. **For UFC bouts before 2000:** preserve results and available individual strike, takedown and submission/knockdown fields. Do **not** spend follow-up requests trying to recover control_time_sec absent from an otherwise valid per-round response. Store it as unavailable. Do not pretend absent control is zero.
4. **Control time pre-2000:** provisional period-specific "historically unavailable" rule based on the 68-record sample. An individual verified non-null control value can override the rule; do not claim an exhaustive year-by-year field audit.
5. **For early-era strike-position splits:** use per-field eligibility; do not assume `meta.quality.has_position_data` guarantees `control_time_sec`. Verify actual field values.
6. **For any year:** if a bout has complete cached round rows do not refetch. If incomplete, retry only under existing bounded provider-error/retry safeguards. Use /coverage year rates as a quality expectation, not an assertion that the local archive is complete.
7. **Throttle requests** and honour HTTP 429 / Retry-After. The concentrated audit encountered one 429 even though the annual allowance was not exhausted. Continue to preserve existing quota safeguards and dedicated live-service reserve.
8. **UFC-only leaderboards:** do not average a missing metric as zero; calculate observed denominators separately for Last 5, Last 10 and UFC Career and label statistical sample coverage.

## Limitations

- Provider coverage is self-reported by UFCalendar and was queried live; it does not independently certify the underlying historical measurements.
- Spot-checks used a narrow sample (historically earliest search results per selected year), and do not measure every fight's *field* completeness.
- Availability and measurement accuracy are different questions, particularly for early reconstructed/retrospectively compiled statistics.
- This test did not alter the eligible roster, fight-history collector, leaderboards, or production website.
