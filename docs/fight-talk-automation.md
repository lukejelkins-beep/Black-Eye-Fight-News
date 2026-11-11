# Fight Talk public-post discovery and refresh

Updated 11 November 2026. This is the production workflow for the **public**, view-only Fight Talk feed. It is separate from the experimental Threads OAuth App Review prototype and does not make BEFN visitors log in.

## Inputs and schedules

- GitHub Actions [Refresh live Fight Talk](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/actions/workflows/refresh-fight-talk.yml): best-effort every 10 minutes. This reads pinned **Bluesky author feeds** via the free public API and writes original post URLs to `data/fight-talk-live.json`. Optional Instagram/Facebook/Reddit credentials may be used only for their respective allowed APIs. Unauthorised queries do not invent missing content.
- GitHub Actions [Discover official Instagram, Threads and X post embeds](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/actions/workflows/refresh-meta-embeds.yml): best-effort every **10 minutes**, at minutes 6, 16, 26, 36, 46 and 56. Every run checks five official organisation homepages, the newest eight articles and a rotating batch of additional publisher articles, as well as the configured free RSS feeds. The broader publisher article pool rotates through five ten-minute slots to protect free-source rate limits. Each run writes original source links to `data/fight-talk-embedded.json`.
- Selected manually fact-checked links and the verified social account watchlist remain in `data/fight-talk-selected.json` and `data/fight-talk-sources.json`.
- `index.html` loads these feeds, prioritises fighters/promoters where the original account is verifiably identified, deduplicates posts, and displays official Instagram, Threads, X, and Bluesky embed widgets with direct-source fallback links.

### Trusted article and RSS sources

The shared allowlist is implemented in `scripts/fight-talk-public-sources.mjs`. It includes MMA Fighting, MMA Junkie, Sherdog, World Boxing News, Boxing News, UFC, RIZIN, ONE Championship, Cage Warriors, FloGrappling, PFL, IBJJF and ADCC domains. The original news feed and publisher RSS pages provide article links, not fabricated social posts.

Initial RSS feeds:

- https://www.mmafighting.com/rss/current.xml
- https://www.boxingnewsonline.net/feed/
- https://www.worldboxingnews.com/feed/

Publisher homepages are explicitly allowlisted and checked in a bounded ten-minute batch. The publisher HTML must itself link a structurally valid original Instagram, Threads or X permalink. A blog/news article is never represented as the original social post.

### Verification

Each post link is normalised to an HTTPS canonical platform permalink and deduplicated.

1. **Trusted publisher source link:** the link appears in a recently published article or an approved official homepage. It may enter the feed with `verification: "trusted-publisher-link"` and `embedVerified: false`. The site renders the official platform widget where supported and retains an original-post link fallback. This is **not** an assertion that a platform API independently confirmed post availability or author identity.
2. **Official oEmbed:** an authenticated-author check (where returned by the platform) and native official widget response were successful. The entry uses `verification: "official-oembed"` and `embedVerified: true`. Unknown Instagram or Threads post authors remain generic unless independently supported by the platform's author information.
3. **Bluesky:** pinned accounts are checked by DID against the public author-feed API, then their original post URI, CID and text are shown.
4. **Curated records:** explicitly selected canonical URLs are retained without inventing new captions, author names or dates.

Do not use an article timestamp or homepage observation as proof of when the original Instagram/Threads post was published. The public interface says `Discovered in coverage` where the original post time is not available. The current 7-day Latest view and 28-day Highlights window operate on source-linked discovery dates where required. Old homepage links cannot re-enter the feed as newly posted items simply because they were rediscovered. The candidates are capped and rotated: five official homepages, eight recent articles and at most 22 additional articles per ten-minute run, with four page workers. The broader pool is covered over approximately 50 minutes when all scheduled runs occur.

## X monthly hard spending policy

**US$2 is the maximum approved X/Twitter API budget; the current production system spends US$0.** The unattended X API timeline reader is deliberately hard-disabled in `scripts/fight-talk-platforms.mjs`, even if an `X_BEARER_TOKEN` exists. The workflow no longer passes an X API secret. This enforces a strict zero-spend upper bound without relying on untrustworthy client-side account balance estimation. Real X posts are still collected from trusted publisher links and displayed with X's official public embed. The discovery output records `paidXApiCalls: 0` and `xApiEstimatedSpendUsd: 0`.

Do not reactivate paid X requests unless an external **provider-enforced** US$2 billing limit exists and is verified. A local counter reset on a new GitHub runner does not constitute a reliable billing safeguard.

## Ten-minute end-to-end freshness

- **Bluesky:** author feeds are polled every ten minutes using the free public API.
- **Instagram, Threads, X:** each ten-minute discovery run searches vetted fight coverage and official publisher links for original public posts. This is **link discovery** and not permission to query every account's timeline. New posts not indexed or linked publicly may take longer to be found or may be missed.
- **Facebook and Reddit:** the underlying live collector runs every ten minutes too, but automatic account-feed collection requires supported access and configured sources. Unconfigured/unauthorised sources cannot produce new posts simply by polling more often.
- **Open Fight Talk webpage:** while the view is open, it refreshes every ten minutes and now compares the statically deployed Render JSON with the latest GitHub JSON for **both** direct posts and publisher-linked embeds. The newer GitHub version wins; new embeds no longer require a manual Render deploy. A viewer can also reload the page.
- GitHub Actions scheduled runs are **best-effort**, and external platforms may delay, rate-limit or block discovery. Ten minutes is the intended *check interval*, not a guarantee that every new post on every site will appear within ten minutes.
- Unattended X paid-API requests remain disabled: **US$0 monthly X API spend**.

## Source quality and priority

- Prioritise known original fighters, champions, contenders, prospects, managers, trainers, teams, and promoters over general media reposts. `linkPriority` is only set when the account's identity is actually supported. Do not invent an Instagram handle merely from article context.
- Unidentified publisher-linked Instagram posts can legitimately render as `Original Instagram post` until the embed itself identifies the author.
- Preserve original text and native platform embed scripts, not LLM-written paraphrases.
- Keep X widget fallbacks. Media playback can fail due to platform restrictions even when the post itself is valid.
- Rate limit through ten-minute rotating discovery, strict trusted hosts, bounded page batches, and 4 concurrent page workers. Free-source refresh frequency is best-effort under GitHub Actions scheduling.

## Automated tests and operational checks

- `node tests/test-fight-talk-public-sources.mjs`
- `node tests/test-meta-embeds.mjs`
- `node tests/test-fight-talk.cjs`
- `node tests/test-fight-talk-roster.cjs`

Initial successful enhanced run (11 Nov 2026): 81 publisher pages checked, 3 RSS feeds working, 44 original links found, 78 retained source-linked embeds, 5 new official embed confirmations and 1 additional source-verified original link; 0 paid X API calls. Actual availability depends on the original platforms, and some widgets may fail to play media while their source links still work.

A real browser inspection of https://black-eye-fight-news.onrender.com/#social found 87 recent posts across 5 pages, working X/Instagram/Threads/Bluesky filters, original platform embeds, and fallback source links. One X video reported a platform-side playback error, but the post remained linked.

If GitHub data is newer than the Render static copy, check the Render deploy history and verify the static website's `data/fight-talk-embedded.json` timestamp; the website may need synchronization after GitHub Actions commits even when the Render auto-deploy setting is enabled.
