# Phase 2 plan: live news and Fight Talk

Status: **proposal, waiting for the owner's OK.** Nothing here is built yet. It follows phase 1 (the shared look and navigation).

## Goal
News and Fight Talk feel live: new stories and posts show up within minutes, the front page leads with the best story, and every item says where it came from and when. No item is shown without a source link and a source date.

## What exists today (checked 19 Nov 2026)
- **News.** `refresh-news` reads 19 publisher feeds (boxing, MMA, grappling) every 15 minutes into `data/news-live.json`: 280 articles, 56 result reports, duplicates removed. Some feeds (RIZIN, KSW, IBJJF and others) come through Bing News searches, which are less reliable than the publishers' own feeds.
- **Fight Talk.** `refresh-fight-talk` runs every 30 minutes into `data/fight-talk-live.json`: 320 posts over a 28-day window from 23 pinned sources and a 215-fighter roster. Posts are original public embeds with links back to the source.
- **Paid X collector.** Capped by a software ledger at US$1.80 a month (US$0.26 used so far in November). The ledger is not a provider-enforced cap, so a small prepaid balance with auto top-up off stays the real limit.
- **Meta embeds.** `refresh-meta-embeds` runs every 10 minutes.

## Proposed work (each step is its own PR; none merges without "Merge N")
1. **Source health report.** One page for the owner showing each news source: last success, last new item, items in 7 days, and failures. Retire feeds that have been silent for 30 days, and replace Bing-search feeds with official feeds where one exists. No visible site change.
2. **News page, lead story and ranking.** One lead story, then a tight list. Ranking uses source date, source quality and how many sources carry the story; fights and events on the Fights page get their related stories linked. Live text headings, no image headings.
3. **Related news on cards.** Fight and fighter pages show the latest three stories that name them, matched by the same name rules the results importer uses. Only exact or close-spelling matches; no guessing.
4. **Fight Talk page.** Rolling feed by fighter, promotion and sport, with the same filter labels as the Fights page. Each post shows its platform, source date and a link to the original. The same Meta/X embeds as now.
5. **Freshness and polling.** The page re-checks its data every few minutes while open, and shows "updated 4 min ago". Cloudflare caches for about 5 minutes, so "live" means within about 10 minutes, not instant.
6. **Schedule review.** After a week of real use, set each job's frequency from the source health report, not from guesses.

## Costs and limits
- RSS news costs nothing beyond GitHub Actions minutes.
- Paid X stays inside the existing US$1.80 a month ledger; nothing in phase 2 raises it. Any increase needs the owner's explicit OK.
- No scraping of sites that block it, and no workarounds for blocked sources.
- No copying of article text: headline, source name, date, a short summary where the feed supplies one, and a link.
- Social posts are shown as the platforms' own embeds or links, never rewritten.

## Decisions needed from the owner
1. **Which languages and regions?** English only for now, or include Japanese and Spanish sources (RIZIN, Mexican boxing)?
2. **Social sources:** keep X, Threads and Bluesky as they are, or add or drop any?
3. **Lead story rule:** newest, or most-covered, or hand-picked by you with an automatic fallback?
4. **Alerts:** do you want a notification when a major story breaks (title fight announced, withdrawal, result)? This would be a separate, later step.

## Not in phase 2
Stats snapshots (phase 3), per-bout analysis (phase 4), any change to Sumo.

## How it is checked
Each step is previewed first, checked in a real browser at 390 px and 1280 px, and its PR says what was and was not verified.
