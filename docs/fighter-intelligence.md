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
