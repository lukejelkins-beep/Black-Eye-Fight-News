# Fight Talk social feed — 9 November 2026

The public Fight Talk page now defaults to **newest first**, including actual source post embeds and links. Engagement does not determine inclusion or ordering. The existing 10-minute GitHub Actions collector checks the configured fighter and promoter watchlists; a second 10-minute discovery scan finds independently linked public Instagram/Threads originals. Scheduled GitHub jobs are **best effort**, not guaranteed exact 10-minute execution.

## Source coverage and permission limitations

- X and Instagram account watchlists live in `data/fight-talk-sources.json`. Entries include a named account, exact username, sport, role and identity evidence. The X adapter resolves usernames to numeric account IDs using the official lookup API; it will reject mismatched usernames. The Instagram adapter checks returned Business Discovery usernames against its pinned entries and any supplied IDs.
- The X collector needs an `X_BEARER_TOKEN` with eligible user lookup and timeline-read permissions. **It is currently not connected; populating the watchlist alone does not activate it.** X has usage limits, potentially including paid API calls.
- Reading *other* Instagram professional accounts needs **Facebook Login**-based Instagram Business Discovery, `INSTAGRAM_ACCESS_TOKEN`, and the correct `INSTAGRAM_USER_ID` of the linked professional account. Instagram Login access alone cannot read other users' feeds. Instagram personal/private accounts and unavailable professional accounts are not supported.
- Old direct post links from `data/fight-talk-selected.json` continue to display with official native embeds. Independent publisher links in `data/fight-talk-embedded.json` are also retained where verifiable. Source-linked fallback is **not** an exhaustive scan of the account's latest posts.
- Bluesky public DID-pinned sources remain active as a fallback. Threads keyword search depends on approved Threads search access; its source allowlist is separate. Missing permissions must report unavailable, never pretend new posts were checked.
- Recent content is retained for 28 days; the Latest view shows the last seven days. No posts are generated, fabricated, deduplicated incorrectly, or given invented timestamps.
- The site auto-checks the latest GitHub JSON every 10 minutes while the Fight Talk screen remains open. Platform and GitHub delays can mean fewer updates than the scheduled frequency.

## Extending the watchlist

The website includes many boxers and MMA fighters. A publicly listed name is **not** sufficient proof that a similarly named social handle belongs to that athlete. Accounts sourced from direct original permalinks and a public combat-sports profile directory form an initial watchlist; additional fighters and prospects should only be added with reliable account-level identity evidence. The system must never guess missing usernames or use engagement thresholds to exclude their posts.

The newsletter remains an unrelated private project and is never published on this website.
