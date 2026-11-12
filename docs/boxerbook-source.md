# Boxerbook — supplementary boxing source integration

**Status: QA-only, not deployed or automatically publishing** (12 November 2026).

Authoritative references:
- https://boxerbook.com/developers
- https://boxerbook.com/developers/pricing
- https://boxerbook.com/terms#api

The linked freepublicapis.com directory does **not** reflect all of Boxerbook's current requirements.

## Current integration

- Read-only server-side access to two documented JSON API endpoints: `GET /v1/schedule?when=weekend` and `GET /v1/results?days=14`.
- A live QA run makes **two requests**, without page enumeration, full database scraping, or ID crawling.
- Compares only **boxing** entries in `data/upcoming-cards.json` and `data/results.json`, requiring both complete fighter names (accent-normalised) and the exact date to match. Opponent conflicts, ambiguous matches and unknown response structures are rejected, not guessed.
- Writes a short, expiring `qa/boxerbook-source-review.json` QA report with only Boxerbook attribution URLs and match metadata; does not mirror Boxerbook data. Default is **no publication**, no source data alteration and no effect on UFC or other MMA workflows.
- A guarded `--apply` option can add **source cross-check metadata only** to existing matching bouts. It does **not** update records, titles, results, winners, divisions, rankings, start times, cancellations, or running order.
- Offline unit tests and manual GitHub Actions QA workflow. The workflow cannot push commits or deploy.
- **Live API response parsing remains unverified**: the documentation was available but raw JSON could not be fetched from the assistant's environment. A real API check is required before considering publication.

## Test and operate

```bash
python -m unittest discover -s tests -p test_boxerbook_source.py -v

# Only two read-only source calls, no changes to BEFN's public datasets:
python scripts/boxerbook_source.py --live --report qa/boxerbook-source-review.json

# Or pass local JSON fixtures with no network:
python scripts/boxerbook_source.py --schedule-fixture /path/schedule.json --results-fixture /path/results.json
```

In GitHub, use **Actions → Boxerbook source QA → Run workflow**. The default runs offline tests; enable **Live API QA check** to run the two read-only API requests and download the one-day QA artifact. An API key is optional for a limited one-off personal test, but required for an app/site deployment and for protected lookup endpoints.

A zero match count is not proof of no bouts; check the actual schema, dates, response shapes and source links. Never relax identity rules to force a match.

## API keys, attribution and licence

Boxerbook states that an app or website needs an API key. Get one in https://boxerbook.com/developers/account and put it in a **server-side** GitHub Actions secret named `BOXERBOOK_API_KEY`. Do not put a key into JavaScript, static hosting, source control, logs, or HTML.

As at 12 November 2026, Boxerbook's **Free** plan is for personal, non-commercial or test use (up to 100 requests/day, 30/minute). Commercial sites require an appropriate paid plan or separate agreement: **App US$19/month**, **Business US$99/month**. Bulk or historical/media data requires a data licence. Do not subscribe or enable commercial use without owner approval. The third-party directory's older open licence statement must not supersede the provider's current terms.

Source attribution is required for displayed data: show **Data: Boxerbook** with a link to the exact Boxerbook source page on each relevant public screen. Existing independently verified BEFN sources remain authoritative unless explicitly reviewed. Boxerbook permits caching for performance for up to **24 hours**, but not rebuilding or mirroring its database.

Publishing metadata is intentionally opt-in: `BOXERBOOK_PUBLICATION_APPROVED=1` plus server-side `BOXERBOOK_API_KEY`, `--live --apply`; the manual QA workflow does not call it. Verify the user's applicable licence and production permission first.

## Next engineering stage — after live schema and rights checks

1. Validate the actual OpenAPI schema: https://boxerbook.com/v1/openapi.json. Adjust only source parsers, not conflict checks.
2. Reconcile verified boxing cards and result methods/records against independent publisher/commission sources and create a human-review queue for discrepancies; do not auto-replace primary-source data.
3. Add keyed boxer lookup and sanctioning-body ranking checks for boxing champion and prospect/contender profiles, using small targeted requests and rate-budget guards. Keep BEFN's independent contender/prospect algorithm.
4. Add explicit expiry controls and per-screen attribution before rendering any derived facts on the public website. Only then enable a scheduled refresh.

This integration does not change the private newsletter and does not modify any UFC fighter-profile research worker.
