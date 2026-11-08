# Fight Talk connections

The scheduled collector checks every 10 minutes, subject to GitHub scheduling. Latest shows posts from the past seven days. The default order puts tracked champions, contenders, prospects and fighters drawing strong engagement first, then rotates through authors and platforms. Each author can appear up to three times in a filtered view.

Engagement uses source-reported likes, replies or comments, and reposts where available. The ranking compares counts against platform-specific cutoffs so each source can surface strong activity at its own scale. The card shows when its figures were checked and marks rounded counts.

Selected posts live in `data/fight-talk-selected.json`. Include an original post permalink, verified account name and handle, the actual publication date or timestamp, sport, author role and a short editorial summary. Add engagement counts only when verified and include their observation time. A selected post expires after seven days and carries a Selected post label. Automatic collection status is independent of selected posts.

## Current coverage

17 configured Bluesky profiles. Public IDs are pinned; biographies/domain handles were checked when adding sources. A public profile ID is not an independent fact check of its claims. Fighter coverage is incomplete; do not label media-reported quotations as direct fighter posts.

## Connections still required

Credentials belong in GitHub Actions secrets, never committed files or chat.

| Platform | Credentials/configuration | Source records |
|---|---|---|
| X | X_BEARER_TOKEN with approved read access | platforms.X.accounts: verified numeric id, name, username, sport, role |
| Instagram | INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID, META_GRAPH_VERSION repository variable | platforms.Instagram.accounts: verified id and username; eligible professional accounts via business discovery |
| Facebook | FACEBOOK_ACCESS_TOKEN, META_GRAPH_VERSION repository variable; permission to read specified public Pages | platforms.Facebook.accounts: verified numeric Page id, name, sport, role |
| Reddit | REDDIT_ACCESS_TOKEN for an approved external Data API integration; renew before expiry | Five configured communities. Recent non-NSFW discussions need score >=10 and >=5 comments; titles link to originals |
| Threads | THREADS_ACCESS_TOKEN and approved keyword search access | threads.allowlistedUsernames; role must be verified before classifying an account as fighter |

Adapters are implemented and fixture-tested. Until authenticated live checks succeed, platform status must remain disconnected/unavailable. Existing ChatGPT social logins do not supply an unattended GitHub Actions API credential. Instagram personal/private accounts and personal Facebook profiles are not supported by these readers.

Prioritise official fighter accounts from the existing archive, then their promoters, major journalists and fan communities. Confirm each ID against the athlete's official website/promoter links before activation; a matching display name alone is insufficient. Begin with boxing and UFC athletes already featured in the archive, then add grappling/RAF competitors.

API access may involve platform approval or billing. No paid plan has been purchased. Do not enable unauthenticated scraping as a fallback.

## Direct fighter posts and visible variety — 8 November 2026

Fight Talk now includes a larger, manually selected set of directly linked originals from X and Instagram, alongside the public Bluesky source feed. These are **source-linked originals**, not an authenticated automatic X or Instagram collection. Embedded X and Instagram posts may require platform cookies/login or may be unavailable in some browsers; keep the original permalink as the fallback.

The default Live & relevant page displays 12 posts rather than six. The balanced ordering rotates platforms and authors, prioritising roughly three fighter posts per industry post where those posts exist; authors are capped at three visible appearances per view. The automatic collector restricts each media/commentator/promoter account to two retained posts (fighters may have four), preventing publisher floods. The four-week highlights retain only posts with source links and genuine dates. The 7 November newsletter/archive is unchanged.

Before adding a manual post, verify that the direct permalink resolves to the actual author, match the account handle to the permalink, confirm the date (for X a snowflake post ID can independently corroborate a timestamp), and retain the source evidence URL. Do not imply API-backed live X/Meta access until the approved credentials are present and the collector reports connection success. Adding handles to a watchlist alone is not an authenticated API connection.
