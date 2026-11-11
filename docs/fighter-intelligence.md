# BEFN fighter intelligence integration

The website receives a weekly editorial *reassessment queue* based on existing sourced results and optional API enrichment. This is not a replacement for original fight-card data, official UFC rankings, or a decision to award a prospect/contender designation.

- Script: scripts/refresh-fighter-intelligence.py
- Derived display data: data/fighter-intelligence.json
- Tests: tests/test_fighter_intelligence.py
- Automation: .github/workflows/refresh-fighter-intelligence.yml
- Frontend: assets/scout-intelligence.js, on the current Fighter Scout page.

## API setup and terms

UFCalendar uses https://api.ufcalendar.com/v1 and needs a production Free or paid key. Create one at https://www.ufcalendar.com/account/api. Add a GitHub Actions repository **secret** with name UFCALENDAR_API_KEY. Never commit or email the key. The pipeline uses no more than seven requests per weekly run (one UFC ranking board + up to three exact fighter lookups and bios). Terms dated 10 November 2026: 100 requests/month on new Free accounts, 1,000 on Free accounts created before 11 November 2026. Derived display inside BEFN is permitted; raw API database redistribution is not. https://www.ufcalendar.com/developers/terms

Octagon API adapters at https://api.octagon-api.com/rankings and /fighters are implemented but disabled pending confirmed reuse rights, including rights related to original UFC-derived content. Set GitHub Actions repository **variable** BEFN_OCTAGON_ALLOWED=true only after verifying permission. Ranking data is an *undated provider snapshot* and must never be called a verified current official ranking. No Octagon images are downloaded or displayed.

Malichetty UFC Stats API adapter at https://ufcapi.aristotle.me/api/fighters is implemented but disabled pending permission. The project README limits hosted usage to personal and non-commercial development; the MIT repository code licence alone does not change the data licence. Only set GitHub Actions repository **variable** BEFN_UFC_STATS_ALLOWED=true if BEFN qualifies for that use and the provider's terms are satisfied (or permission is obtained). It uses up to four requests per weekly run. https://github.com/malichetty/ufc-stats-api

## Workflow

In GitHub, Settings > Secrets and variables > Actions > New repository secret: UFCALENDAR_API_KEY. Under Actions > Refresh fighter scouting intelligence > Run workflow, run one refresh. The process also runs every Monday. No Render secret is required because collection is server-side in GitHub Actions, not the public browser.

Only confirmed past UFC, PFL and ONE MMA results with named winners contribute to the review queue. No inferred historic ranking from a present-day board. Historical ranked wins require a timestamp-specific rank and source on the bout. Fewer than two completed sourced fights: no automatic review priority. The latest five appearances drive a transparent *review priority*, never a final classification. Verified outcomes are never overwritten. Outages preserve previously observed provider attributes. The user-facing view is a small editorial highlight section; it never republishes a third-party raw feed or any provider imagery.

For full bout-level statistics, point-in-time rankings, boxing integration and final prospect/contender designation decisions, later work should add a data-rights-compliant private backend and explicit fighter identity mapping.

## Non-commercial UFC Stats authorization (11 November 2026)

The BEFN owner explicitly confirmed this site is **non-commercial**. The weekly workflow now enables the hosted malichetty UFC Stats adapter for this use, limited to at most 7 requests per weekly run (a health check, a known-fighter search/detail validation, then up to two exact-match fighter search/detail pairs). A healthy status alone is not presented as a successful working connection; a full verified fighter search and detail response are required. All use remains subject to the provider's published personal/non-commercial terms. Public display is restricted to individual derived profile metrics with attribution; no bulk copying or imagery.

## Connectivity recovery checks

A GitHub Actions secret named `UFCALENDAR_API_KEY` must contain the **production** key exactly, without the string `Bearer`, quotes or spaces. The weekly connector now first requests `GET /v1/usage` with the bearer token; a failed usage request is reported as `authentication_unconfirmed`, not interpreted as definitive proof of an invalid secret. Once usage succeeds, `GET /v1/rankings/ufc` is optional and cannot block individual fighter lookups using `q` and `org=ufc`. A healthy API and a matched fighter biography are required before reporting `connected`.

The malichetty hosted UFC Stats API has returned network errors in BEFN GitHub Actions (11 November 2026). Its connector continues checking a verified live health/search/profile sequence, and is never labelled connected on a code-only test. If the public host remains unreachable, contact the original API maintainer about restoring DNS/hosting, or arrange a separately licensed hosted data mirror. Do not publish raw UFC datasets in the public repository.

Provider connectivity updates do not affect BEFN's source-linked existing result cards.
