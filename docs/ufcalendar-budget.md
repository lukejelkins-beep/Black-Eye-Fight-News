# UFCalendar 100-call monthly intelligence budget

BEFN uses an actual quota-aware weekly collector, not a proposed allocation.

## Budget (UTC calendar month)

| Category | Maximum | Use |
|---|---:|---|
| Round-by-round bouts | 48 | Both athletes and every recorded round in one call |
| Comparisons | 12 | One comparison call for each fighter pairing |
| Career histories | 12 | Five most recent bouts from full career timeline |
| Division intelligence | 8 | Rankings, latest results, upcoming and roster together |
| Event detail | 4 | Full-card summaries |
| Fight discovery | 4 | Narrow recent completed-fight searches |
| Reserve | 12 | Usage checks and safety buffer |
| **Total** | **100** | **Absolute BEFN cap** |

Collection is in scripts/refresh-ufcalendar-budget.py. It runs through the existing weekly refresh-fighter-intelligence.yml GitHub Actions workflow and also on manual dispatch. It always requests GET /v1/usage first (counts as one reserve request) and uses the provider's authoritative requests_used and requests_limit numbers. BEFN never spends more than the lesser of the actual plan limit and 100 monthly requests, allowing for calls from other integrations on the same account. Missing or invalid usage response stops optional requests. No API key or raw provider payload is ever written to GitHub.

Budgets are apportioned over the number of Mondays in the UTC calendar month. Each run also has these maximums: 12 rounds, 3 comparisons, 3 career histories, 2 divisions, 1 event and 1 fight discovery. The total cap is 23 HTTP calls including the quota check. Failed calls count against their category, and are not auto-retried within the same month. New months reset counters but not derived cached historic evidence.

## Priority, coverage, persistence

Discover completed UFC MMA bouts with actual provider IDs, then score them by the presence of BEFN scouting review subjects, title/main-event importance and recency. Only recently active fighters are selected for new discovery (18 months); previously captured career evidence may be older. PFL is launched in UFCalendar but first-stage discovery focuses on UFC. ONE remains a staged org, so this collector never assumes ONE fight endpoints are available.

Reuse each fight's data for both corners. Persist selected per-round striking and grappling evidence with null-preserving missing values; do not infer official judging scores from striking differential. Compare fighters through one request per pairing. Use one career history request per fighter, and one division request for rankings, recent matches, upcoming matches and roster. Do not overwrite published BEFN results or automatically award prospect and contender labels.

Files:
- data/ufcalendar-budget.json is an account-usage summary, category ledger, and request identity cache, without keys or raw response bodies.
- data/ufcalendar-intelligence.json contains selected, derived per-round performance evidence, comparison insights, career summaries and event/division summary counts.
- data/fighter-intelligence.json retains existing scouting assessments and now includes counts of additional round-by-round evidence when available.

These outputs are selected and transformed editorial information. UFCalendar terms forbid redistribution of a substantial raw dataset, downloadable feed, or standalone third-party API. See https://www.ufcalendar.com/developers/terms and https://api.ufcalendar.com/docs. UFCalendar data and source identity are labelled; third-party images are not copied.

## Known limitations

Some bouts have no official per-round statistics or control-time totals. Missing values remain null. This first version incrementally captures recent UFC events; it does not claim to have completed the full historical UFC archive, to support ONE, or to have built a final fighter ranking algorithm. Historical statistics can be backfilled in later quota-controlled runs. The failed malichetty hosted UFC Stats endpoint is independent of UFCalendar.
