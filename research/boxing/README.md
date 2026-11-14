# BEFN Boxing Cohort — research snapshot (14 November 2026)

**Status: DRAFT FOR REVIEW; NOT AN APPROVED ELIGIBILITY ROSTER.** The Boxerbook API has **not** been queried for fight histories. No changes have been made to production, Render, main, fighter profiles, or scheduled UFC jobs.

## Initial population proposal

- Men's 13 weight classes, bantamweight (118 lb) through heavyweight; junior bantamweight and below and women's divisions are not included in this phase.
- Any boxer appearing in one or more WBA, WBC, IBF or WBO top-15 lists, The Ring top-10, or holding one of their recognised current world, interim or regular titles enters the candidate cohort.
- One boxer gets one fighter record even if listed by several bodies or in multiple weight divisions. Every organisation, ranking, division, and belt attribution remains traceable.
- Vacant/not-rated positions do not count as fighters. Retired and inactive athletes are not silently excluded: their eligibility/activity must be reviewed first.
- Unranked prospects and upcoming marquee-card fighters are proposed for a second, separate expansion rather than silently added to the ranked cohort.

## Counts

**499 provisional distinct candidates; 894 populated ranking slots out of 910 possible; 16 vacant/unfilled slots; 15 fighters appear in more than one division.** Five organisations × 13 men's divisions. Champions are additional, not substituted for the ranking lists.

| Division | Unique candidate boxers | Filled ranking positions |
|---|---:|---:|
| Heavyweight | 39 | 69 |
| Cruiserweight | 36 | 70 |
| Light Heavyweight | 37 | 69 |
| Super Middleweight | 37 | 68 |
| Middleweight | 45 | 69 |
| Super Welterweight | 42 | 68 |
| Welterweight | 42 | 69 |
| Super Lightweight | 42 | 68 |
| Lightweight | 42 | 69 |
| Super Featherweight | 38 | 69 |
| Featherweight | 39 | 69 |
| Super Bantamweight | 37 | 68 |
| Bantamweight | 38 | 69 |

Division rows are not additive because some boxers appear in multiple weight classes. The unique count is computed across all divisions and names.

## Source cut-offs and limitations

- [IBF, WBA, WBC and WBO rankings, as aggregated by BoxingScene](https://www.boxingscene.com/rankings). Individual underlying list dates: IBF **31 October 2026**; WBA **31 October 2026**; WBC **11 November 2026**; WBO **28 October 2026**. Ranking compilation updated 13 November.
- [The Ring rankings via Box.live feed](https://box.live/external-feeds/ring-feed-03062020/), dated **13 November 2026** for the 13 sampled divisions.
- These are a time-bounded research snapshot; mixed publication dates and champion status changes can disagree. Before signoff check any discrepancy with [WBA](https://www.wbaboxing.com/wba-ranking), [WBC](https://wbcboxing.com/en/ratings/), [IBF](https://www.ibf-usba-boxing.com/index.php/ratings), [WBO](https://www.wboboxing.com/rankings), and [The Ring](https://www.ringmagazine.com/fighters/rankings?org=ring).
- BoxingScene, Box.live and other aggregators can contain transliterations, out-of-date champion assignments and abbreviations; the list is not certified accurate simply because an automated comparison succeeds.

## Source files and review outputs

- `2026-11-14-ring-rankings.json` — 13 Ring top-10 lists and champion.
- `2026-11-14-sanctioning-rankings-partial.json`, `2026-11-14-sanctioning-rankings-middle.json`, `2026-11-14-sanctioning-rankings-light-and-welter.json` — 13 divisions × WBA/WBC/IBF/WBO top-15 positions and champion name snapshots.
- `2026-11-14-cohort-preview.json` — deduplicated 499 boxer candidates, original name variations, source ranks/titles, division associations and quality-control flags.
- `2026-11-14-cohort-review.csv` — sortable review table (one row per boxer) for approval.

## Identity and rankings QA to finish before cohort approval

1. Confirm boxer aliases and avoid over-merging: `Movladdin Biyarslanov = Arthur Biyarslanov` per [Olympedia](https://www.olympedia.org/athletes/133025); `Jazza Dickens = James Dickens` per [WBA](https://www.wbaboxing.com/wba-boxer-profile?id=2828); `Joshua Anton = Joshua Kevin Anton` per [Boxerbook](https://boxerbook.com/boxers/joshua-kevin-anton-b21832).
2. **DO NOT** merge `Paulo Aokuso` with `Austin Aokuso`: they are separately ranked by [Australian National Boxing Federation](https://anbf.org.au/ratings/nationalratings/). Keep `Ali Ismailov` and `Ali Izmailov` separate until independent boxer-ID evidence is checked.
3. **DO NOT** merge `Gary Antonio Russell` (122 lb) with `Gary Antuanne Russell` (140 lb). [WBA boxer profile](https://www.wbaboxing.com/wba-boxer-profile?id=9952) identifies Gary Antonio; [The Ring](https://www.ringmagazine.com/news/4wn4Rfo0CEh87O2wswRZkp) identifies Gary Antuanne.
4. Review 15 fighters listed in more than one division. Retain their historical/current ranking memberships but assign just one primary profile/weight division for display after activity verification.
5. Confirm official champion/regular/interim status and identify title holders omitted from published lists; do not treat every belt as equivalent for rankings or the later ratings algorithm.
6. Validate exceptions (retirement, duplicate spelling, inactive boxer, rank migration, suspended champion) without changing the snapshot in place; log corrections with evidence.
7. Ask for approval of the **ranked-plus-champions** cohort separately from a future **unranked prospects and marquee fights** add-on.

## Guardrails

**Do not collect Boxerbook fighter or fight-history data yet.** Written authorisation for the intended bulk data collection, database storage, caching and redistribution must be confirmed before any bulk API use. No production deployments, public profile publication or algorithm/rating changes until user approves the final boxing roster and later data-collection plan.
