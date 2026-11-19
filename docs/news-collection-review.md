# News collection review (19 Nov 2026)

Why: the owner asked whether the way BEFN collects boxing, MMA, grappling and sumo stories can be improved. This is what the live data and three probe runs on GitHub showed, and what was changed or is proposed. Probe results are from GitHub's servers, not guessed.

## What the data showed
| Finding | Detail | Action |
|---|---|---|
| Heavily MMA | Of 280 stories held: 252 MMA, 23 boxing, 5 grappling, 0 sumo. | Added 8 verified feeds (below). Grappling and sumo need the steps further down. |
| Many feeds broken or moved | 11 of 19 feeds failed. NCAA moved its addresses; ONE's MMA category feed is empty. | Repaired in PR #317. |
| Quiet is not broken | ADCC's feed works; its newest post is 19 Oct. | The source health report now says BROKEN or quiet. |
| Schedule is not 15 minutes | The job is set to every 15 minutes, but the last eight runs started about an hour apart (GitHub delays scheduled jobs). Each run takes 35 to 80 seconds. | See "Decisions" below. |
| No photo on 98 of 280 stories | MMA Junkie's direct feed returns HTTP 402 (paid), so its fallback carries no photos. | 71 of those 98 now get a cleared local fighter photo (this PR). |
| Duplicates counted nowhere | A story run by five sources looked the same as one run by one. | PR #318: coverage counts and two lead stories. |

## Changes in this PR
- **Cleared local fighter photos for stories with no publisher photo.** The first fighter named in the headline, matched by full name, whole words only, from the owner-cleared register (750 fighters). Ambiguous names (two fighters, one name) are skipped. A publisher photo is never replaced. The page uses the local photo when a story has no publisher photo.
- **Eight verified feeds added.** Boxing: BoxingScene, BBC Sport, Boxing News 24, Boxing Insider, The Guardian. MMA: BBC Sport, MMA News, Cageside Press. Each answered from GitHub with current stories.
- **Approved Japanese and Spanish publisher list** in `data/news-language-sources.json`, for the owner to approve. Nothing from it is collected yet.

## Japanese and Spanish: how it would work
- Google News search (RSS) per query, in Japanese or Spanish, for each sport. Searches tested from GitHub for RIZIN, boxing, sumo, "martial arts", Pancrase, UFC, boxeo, MMA and jiu-jitsu all returned 50 to 100 fresh results, each with its publisher named.
- A story is kept only if its publisher is on the approved list. Counts of who appeared most in the test searches are what the list is based on.
- Only the headline is translated, labelled "Translated from Japanese" or "Spanish", with the original headline and a link. Never the whole article.
- Sumo news comes in through the Japanese list (NHK, SPORTS BULL, Nikkan, Sanspo, Hochi, Sports Navi). Sumo results and rankings stay in the Sumo section; this only adds a news feed.
- Caveats: Google's links are redirects, so each kind of link must be checked once before switching on. Google gives no photos or summaries, so these stories use the fighter photo or the sport placeholder. Translation needs the DeepL key and its character allowance; the free allowance rules are unclear, so a test run comes first.

## Proposed next steps (each its own PR)
1. **Japanese and Spanish collection**, from the approved list, with the headline translation, once the owner approves the list.
2. **Sumo tag** for news: classify by Japanese and English sumo terms; show on the News page and the Sumo section.
3. **Grappling depth.** The working grappling sources are thin (GracieMag, D3 Wrestle, NCAA, FloGrappling). IBJJF, KSW and Real American Freestyle publish no feed, so those stay on search-only indexing. Candidates to probe next: ADCC and IBJJF social posts, Polaris and Fury Pro press pages.
4. **Weekly health check** that raises a GitHub issue when more than a third of feeds are broken, so failures are not found by chance.

## Decisions for the owner
- Approve, trim or extend `data/news-language-sources.json`.
- **Update speed.** News is effectively hourly. Options: (a) accept hourly and show "updated X ago" honestly (no cost); (b) trigger the job every 15 minutes from Render's scheduler with a GitHub token (more fresh, needs a token and a small Render cron job; a separate PR).
