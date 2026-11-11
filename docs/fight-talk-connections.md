# Fight Talk connections and source coverage (11 November 2026)

Fight Talk displays original X, Instagram, Threads and Bluesky posts using native platform embeds where available. The public Live view defaults to newest-first with 20 posts per page, without likes/comments thresholds or engagement ranking. Older directly linked originals remain in the four-week Highlights view.

## Ten-minute checks

Two GitHub Actions workflows are scheduled at staggered ten-minute intervals. 'Refresh live Fight Talk' checks named author timelines via approved platform APIs (and public Bluesky). 'Discover official Instagram, Threads and X post embeds' looks for public original links cited by approved fight publishers and tests post-link eligibility. This publisher-link fallback is not the same as access to a fighter's complete account feed. GitHub Actions is best-effort and may run behind schedule. The browser also refreshes its feed JSON every ten minutes while Fight Talk is open. The workers retain valid existing posts and don't manufacture captions, author accounts or dates.

## Coverage roster

The tracked fighter roster in data/fight-talk-roster.json contains 215 unique champions, contenders and prospects drawn from the website. It records documented profile mappings, including evidence, without assuming a social handle from a fighter's name. At the latest check, 79 of the 215 had at least one mapped X or Instagram profile. The source configuration contains 44 X and 120 Instagram source accounts, including fighters and promotions. Some directory-linked handles still require live platform authentication to confirm the author. A configured handle is not proof of live API access, and an athlete with an empty profiles map has not yet had their account identified.

## Platform limits

* X: the current scheduled collector reports X_BEARER_TOKEN not supplied. Profile lookup and timelines require permitted X API access, with any platform charges/rate limits handled by the account owner.
* Instagram: a token is present, but the last check failed to locate a usable linked Instagram professional account for Business Discovery. A business or creator Instagram account, the appropriate Facebook Login/Page-linked access and the professional Instagram asset ID (INSTAGRAM_USER_ID secret) are required to read third-party professional account media. Instagram Login alone is insufficient for this collector. Public personal accounts are not available through that route.
* Threads: existing public source-linked post embeds are visible, but unattended account search depends on separate Meta API permissions.
* Bluesky: public DID-pinned author feeds are the currently confirmed automated source.

Original post permalinks and post dates must be verified before editorial selection; publication dates of reports linking a post must never be used as the post's own date. No third-party login-wall scraping or fabricated posts. The private newsletter is a separate project and is not published on the site.

## Source-register expansion — 9 November 2026

A full internal roster lives at `data/fight-talk-roster.json`; this distinguishes tracked fighters from athletes whose accounts need further evidence. The initial X and Instagram watchlists are not a claim to have authenticated timeline access for every fighter. The linked-account identity remains permission-dependent, and stale handles can be corrected by updating the evidence source. X direct originals found in published fight coverage now use the timestamp encoded in X's snowflake ID when it is valid; coverage publication times do not masquerade as original post dates. Instagram authors are named as tracked fighters only when official oEmbed author URLs match a pinned account.

### Newly documented official links

- Adam Azim: Instagram adam.azim1 — Official boxer website https://www.adamazimboxing.com/ links to https://www.instagram.com/adam.azim1/
- Josh Kelly: Instagram joshkelly07 — Josh Kelly LinkedIn https://uk.linkedin.com/in/josh-kelly-boxer links to Instagram @joshkelly07
- Josh Kelly: X JOSHPBK — Boxer's original X profile https://x.com/JOSHPBK ; profile links to Instagram @joshkelly07
- BOXXER: Instagram boxxer — Official BOXXER Linktree https://linktr.ee/Boxxer links to https://www.instagram.com/boxxer/
- Most Valuable Promotions: Instagram mostvaluablepromotions — Official MVP Linkme https://link.me/mostvaluablepromotions and https://linktr.ee/themostvaluable
- Most Valuable Promotions: X MostVpromotions — Official MVP promotional release https://pwinsiderxtra.com/ViewArticle.php?id=40034&p=1 identifies @MostVpromotions on X
- Misfits Boxing: Instagram misfitsboxing — Official verified profile https://link.me/misfitsboxing and https://linktr.ee/mf_boxing

## Automatic identity discovery (November 2026)

`discover-fighter-profiles.yml` runs twice daily. It checks the complete site roster against Wikidata's X (P2002), Instagram (P2003) and Threads (P11892) identifiers; rotates requests for fighters with nonstandard article names; and looks for explicit Person `sameAs` identities on official UFC, Matchroom and Top Rank athlete pages. This is **profile lookup**, not a social timeline reader. Conflicting identities are quarantined in `data/fight-talk-profile-discovery.json`. The job is deliberately throttled on Wikimedia HTTP 429 responses. Successful discoveries populate `data/fight-talk-roster.json`, `data/fight-talk-sources.json`, and the Threads author allowlist. Source metadata such as Wikidata handles can be stale; API reads or original post oEmbeds still have to verify author identity.


## Official embedded-post display (11 November 2026)

The website renders source-linked public original post URLs through the official client-side widget scripts, not Meta's authenticated content-search APIs:

* Instagram: native \`instagram-media\` blockquotes + \`instagram.com/embed.js\`; profile-prefixed URLs are reduced to canonical post or Reel URLs.
* Threads: native \`text-post-media\` blockquotes + \`threads.com/embed.js\`.
* X: native \`twitter-tweet\` blockquotes + \`platform.twitter.com/widgets.js\`.
* Bluesky: official AT-URI/CID post blockquotes + \`embed.bsky.app/static/embed.js\`. The Bluesky collector now records the CID; older posts resolve missing CIDs from the public getPosts endpoint in small batches.

All original posts are displayed at natural widget size, including post media and links when available. No synthetic summaries are used as post text. If an original platform blocks embedding or an author deletes a post, the visitor retains the original-source link; only verbatim text already retrieved from the original platform is presented as a fallback. The four post sources remain tracked by existing editorial discovery workflows. **These embeds do not grant automatic account discovery, search or retrieval privileges.** Direct public embeds do not require the Meta content API App Review submission. Third-party embed scripts will send visitor requests to their respective platforms.


## Extended sourcing and 10-minute target (11 November 2026)

The tracked source pool now contains 131 X handles and 208 Instagram handles, plus the Threads allowlist and DID-pinned Bluesky feeds. This is a **watchlist**, not proof of authenticated timeline access. Media and industry coverage includes boxing/MMA publishers, independent reporters, event promoters, sanctioning bodies and managers. Handles carry an evidence URL and are never inferred from someone's name.

The live Bluesky public API collector and browser data refresh are scheduled every ten minutes. Trusted publisher original-post link discovery is also scheduled every ten minutes, with all official homepages and the newest eight articles checked in each run, plus a rotating slice of older articles. Every ~50 minutes the five slices have been attempted. The site deduplicates original post URLs and retains 28 days of history. Scheduled GitHub Actions can start late or even be dropped during high load, so ten minutes is a **target**, not a guarantee or SLA. X's paid API timeline reads remain disabled entirely (US$0 of the US$2 cap), and no automated browser scraping of authenticated social feeds is performed.
