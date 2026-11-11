# BEFN Fight Talk — five-minute rolling source directory

The Fight Talk collector runs on GitHub Actions at five-minute intervals, subject to
GitHub Actions best-effort schedule delays.

## One-hour rotation

The watchlist comes from verified source identity files in
`data/fight-talk-sources.json`. We do not need to log into or follow accounts
to maintain that directory. `scripts/fight-talk-rotation.mjs` deduplicates
platform/usernames and schedules at most **84 distinct accounts/communities
per five-minute execution**. At 1,000 unique entries this requires **12 runs
(60 minutes)**. With fewer accounts the rotation finishes sooner. Each
scheduled run picks its shard deterministically from the current UTC
five-minute slot, so no cursor write is required.

GitHub scheduling can be delayed or skipped: 60 minutes is a target, not a
guarantee. Check workflow runs and `rollingScan` output for actual cadence.

## Collection capabilities (important)

Scheduling a source does NOT mean an API read succeeded:

- Bluesky: direct author-feed access for tracked, identified DIDs.
- Instagram: direct business discovery only with valid approved Meta
  permissions; otherwise retained posts come from trusted original post links.
- Threads: follow source-linked original public post URLs; account-level
  feed collection is not authorised by simply having a username.
- X: **zero automated paid X timeline API calls** regardless of credentials.
  US$2 monthly maximum remains protected; only sourced original posts and
  official embeds are used.
- Facebook and Reddit: only permitted API reads when relevant credentials
  and identities are available.

Fight Talk's separate public original-post discovery workflow still runs every
ten minutes. It does NOT require followers or social login credentials.
The site continues rendering original embeds with links as fallbacks.

## Publishing

Five-minute checks log the shard and actual successful checks. The collector
publishes a new feed when authentic post content changes. Otherwise, it
retains the previous feed and writes no new GitHub commit until an hourly
heartbeat is due, reducing noise and avoiding deploys for empty scans.
This heartbeat is a publication indicator, not proof every scheduled source
was accessible.

To expand toward 1,000 sources, add properly attributed and verified account
identities to the source directory; never invent handles. Respect API access
restrictions, source attribution and account privacy.
