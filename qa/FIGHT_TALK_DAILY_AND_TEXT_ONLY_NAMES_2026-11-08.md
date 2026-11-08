# Fight Talk publishing and editorial controls (8 November 2026)

## Current automation
- GitHub Action: `.github/workflows/refresh-fight-talk.yml`
- Frequency: every 4 hours (UTC cron `17 */4 * * *`) plus runs when its script/config changes; scheduled jobs can be delayed by GitHub.
- Source code: `scripts/refresh-fight-talk.mjs`
- Author allowlist: `data/fight-talk-sources.json` (11 public account DIDs confirmed in source profile records).
- Output: `data/fight-talk-live.json` (source-linked original author posts from the last 7 days; no generated post text).
- The website's Fight Talk defaults to recent posts, supports boxing/MMA and platform filters, and retains `archive` for the 7 November issue.
- Website fetches the latest GitHub JSON directly with a cache buster; Render's own copy is the fallback. While the page remains open it rechecks every 10 minutes. A *live* label does not mean instantaneous streaming; the server collector checks every four hours.
- A source failure must not be represented as new posts: display source status, original links, and the last checked timestamp.
- GitHub Action's first successful run returned 50 posts from 11 sources with no errors (8 November 2026 Melbourne). The figures will vary on later checks.

## Platform status

**Bluesky: LIVE** — Public app.bsky.feed.getAuthorFeed API, direct original posts, post URL, author handle, public DID and avatar. Reposts excluded, relevance keywords filtered. Source content is not independently fact-checked.

**Threads (Meta): READY BUT NOT CONNECTED** — Platform design and optional Meta API collection are implemented, but another person's Threads posts require an approved Meta app with `threads_basic` and `threads_keyword_search` advanced access. Add `THREADS_ACCESS_TOKEN` as a GitHub Actions repository secret and approve the known real Threads author usernames in `data/fight-talk-sources.json` under `threads.allowlistedUsernames`. Tokens must never be stored in source files. The collector will not invent Threads posts when the API is unavailable.

**X / Instagram:** Historic source-attributed posts remain in the original archive. No general-purpose current access or API keys have been configured. The site does not mislabel those as fresh updates.

## Uniform portrait behavior

## Additional caveats
- Individual original post timestamps and URLs should be reviewed before promotion. Posts about an event may contain unverified claims by their original authors.
- No synthetic fighter photos, handles, quotes or dates were inserted.
- Preserve the website's pre-launch/editorial review notice and photo reuse restrictions.
