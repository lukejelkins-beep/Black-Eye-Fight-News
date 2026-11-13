# BEFN original X post alert pilot — staged, not active

**Status (13 November 2026):** The initial 20-account webhook pilot is committed and its tests pass. **No TwitterAPI.io webhook rules have been created or activated.** The existing 90-minute paid X poll remains the current source, and the free social-link collectors continue.

## What it monitors

Two rule definitions live in `data/fight-talk-x-webhook-pilot.json`:

- BEFN-PILOT-MMA-01 — 10 tracked accounts across MMA fighters, UFC/PFL, management, media and meme pages
- BEFN-PILOT-BOX-01 — 10 accounts across boxing fighters, promoters, boxing media and meme pages

Each query is below the documented 255-character limit, uses only handles already in BEFN's verified X watchlist, and specifies an hourly rule interval. Total: **11 fighters, four promoters, one manager, two media accounts and two meme accounts.**

A rule is not active until it is registered and enabled in TwitterAPI.io. Having this configuration file does **not** bill anything.

## Cost and budget

Provider references:
- https://twitterapi.io/blog/monitoring-twitter-via-api-guide
- https://twitterapi.io/pricing/details
- https://twitterapi.io/blog/tweet-notification

TwitterAPI.io checks filter rules even when no account has posted. Current advertised minimum: **US$0.00015 per rule check**, plus approximately **US$0.00015 per returned post**. Two hourly rules, 31 days: US$0.2232 in checks alone, plus matching-post charges.

**CRITICAL:** The existing GitHub polling ledger only guards the paid `advanced_search` job, not TwitterAPI.io's own webhook evaluations. Before activation:
1. Disable automatic recharge on the provider and keep its prepaid balance at or below the user's approved **US$2 monthly total**.
2. Verify provider billing and ensure no other service is drawing on the same prepaid balance.
3. Set the GitHub repository Actions **variable** `BEFN_X_WEBHOOK_ACTIVE=true` to skip the overlapping paid `refresh-twitterapi-io.yml` job; leave free link discovery unchanged.
4. Monitor real provider charges and manually disable the rules before prepaid credit runs out.

Do not activate the webhook with paid polling still enabled, and do not mistake the dashboard's internal ledger for a provider-enforced spending cap.

## Existing server route (disabled)

The existing `befn-threads-review` Node service has a staged webhook route in `threads-review/twitterapi-webhook.mjs`. This is separate from Threads OAuth and does not change the public BEFN static site's API keys or security.

- `GET /webhooks/twitterapi/status`: configuration readiness (never exposes secrets)
- `POST /webhooks/twitterapi`: strict constant-time `x-api-key` authentication, validates event/rule/author/timestamp/URL, acknowledges promptly, then commits *only accepted original public posts* into `data/fight-talk-x-api.json` via GitHub's Contents API. Subsequent client refreshes can pick up this JSON without another Render deployment.
- `event_type=test_webhook_url` returns a test acknowledgement without storing public posts.

It is **disabled by default** and returns HTTP 503 until the Render Node service has the following server-side environment variables:

| Environment variable | Purpose |
|---|---|
| `BEFN_X_WEBHOOK_ENABLED=true` | Explicit server enable flag |
| `TWITTERAPI_IO_API_KEY` | TwitterAPI.io API key used to authenticate provider callbacks |
| `BEFN_GITHUB_WRITE_TOKEN` | Fine-grained GitHub token restricted to `lukejelkins-beep/Black-Eye-Fight-News`, Contents read/write only, for durable post updates |

Do not paste these values in chat, code, logs, GitHub commits or a static site. The GitHub Actions secret `WITTERAPI_IO_API_KEY` / `TWITTERAPI_IO_API_KEY` cannot be read back and automatically copied into Render.

## Hard blocker before turning on billable rules

**TwitterAPI.io requires HTTP 200 within one second and does not retry failed deliveries.** The existing `befn-threads-review` Render service is on the **free** plan, which can sleep when idle. A cold start may take longer than one second, resulting in lost posts *while TwitterAPI.io still charges for checks*. This endpoint is suitable for controlled verification; it has **not** been established as a reliable production webhook endpoint.

Also, individual webhook-driven GitHub commits may trigger repository CI/deploy activity, so long-term production should use a persistent queue and batch commits, or a receiver with durable storage and a suitable uptime arrangement. The current endpoint is intentionally a limited pilot, not a guaranteed real-time service.

**Do not enter the TwitterAPI.io rule registration or activation steps until receiver uptime, authentication, secure persistence, and provider spending protections have all been proven.** The existing 90-minute paid X search remains a working fallback until then.

## QA

Existing tests: `node --test threads-review/test.mjs`; and `node tests/test-twitterapi-io.mjs`. They cover source watchlist membership, rule size, inbound payload validation, canonical X posts, impersonation/reply filtering, isolated Threads routes and mocked GitHub write persistence with no real API calls.

The receiver code is on GitHub, but **deployment to Render and externally reachable status have to be separately confirmed** before offering its URL to the provider dashboard.
