# UFC Olympic, Commonwealth and national-team research

This folder gives Claude Code and other reviewers a shared process for researching 921 BEFN-certified UFC fighters. It records three independent lanes: Olympic credentials, Commonwealth Games credentials and national-team representation in any sport.

[Current research results and source coverage](RESEARCH-RESULTS.md) · [921-row screening ledger](screening/roster-pass-2026-11-24.json)

## Scope and files

- [`cohort.json`](cohort.json) pins 780 individual certificates from the frozen cohort and 141 from the fixed extension. The [certificate file](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/blob/7a35f2aaeb9a7252e5c4783882faae60b1c3af77/data/ufc-v4-certified-careers.json) defines membership. [Form](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/blob/7a35f2aaeb9a7252e5c4783882faae60b1c3af77/data/ufc-fighter-form.json) supplies display names. The rolling cohort is outside this snapshot. Some rolling records overlap and should never be added to the total.
- Use the canonical certificate slug. `statsSlug` is a profile lookup alias where the keys differ. Check “Bruno Silva” and other shared names against the UFC record. A numeric suffix can identify a real fighter. Keep it in the record even if omitted for a name search.
- [`discovery.md`](discovery.md) documents the first screen, seeds and open checks. `reviews/<slug>.json` saves one record per fighter, with evidence and state per lane. Missing lanes are unreviewed.
- `check.mjs` validates the snapshot and reviews offline. It reports each lane separately and lists pending work by batch. It validates records, while reviewers verify the source claims.

## Work one batch

```bash
node research/ufc-representative-credentials/check.mjs
node research/ufc-representative-credentials/check.mjs 01
```

1. Assign one reviewer to an unclaimed batch in the research PR or review thread. The 37 stable batches contain 25 fighters each, with 21 in the last batch. Read existing reviews and BEFN credentials before searching. Preserve verified claims and add the missing lanes to the same file. Keep concurrent work on distinct batches.
2. Open the fighter’s official UFC or UFCStats identity page. Search full names, earlier surnames, native-script names and plausible transliterations. Search the sources for each lane independently. Resolve a match using supporting details beyond the name, such as sport, era, age group, weight class or a bio linking the two careers. Use the delegation listed for that event, which can differ from the UFC flag, country of birth or eligibility. Keep disagreements and same-name candidates pending until resolved.
3. **Olympic.** Check the IOC results or athlete index and the relevant federation, national federation or National Olympic Committee. Search Games results as well as trials, official qualification, reserve, coaching and Youth Olympic Games records. An actual result or bout establishes participation. A start list, quota, announced selection, training squad, or “Olympic-level” wording does not establish a start. Check all relevant editions and individual and team events. Use the official edition, such as Tokyo 2020.
4. **Commonwealth.** Check Commonwealth Sport results books and the appropriate games delegation or federation. Look at selection and withdrawal announcements as well as results. Separate senior Games, Youth Games, qualification, reserves and coaching. Gold Coast 2018 and Birmingham 2022 are editions. Domestic Commonwealth championships and the Games are different competitions.
5. **National teams.** Check federation results and official national-team rosters, selection notices or competition books. A named result in an official national delegation can verify that the athlete competed for that delegation. Keep senior, U23, junior, cadet and youth separate. Record named selection or squad membership separately from competition starts. A national title, country flag, ancestry, UFC nationality, a club result, entry in an open tournament or competing on a reality show team does not prove representative selection. A Games start may support a national-team record when the source establishes representation of that national delegation. A refugee, independent or neutral delegation is recorded as such. Avoid duplicate achievement totals across lanes.
6. Save direct links, exact descriptions in your own words, and the date of each lane search. Recheck Olympic and Commonwealth starts, medals, senior national-team claims, and conflicts with a second reviewer. Sample checked lanes with no evidence. Commit each finished batch on the research branch and include lane counts, unresolved rows and sources that could not be checked. Owner approval is required before merging to main.

## Record format

Use an existing `reviews/<slug>.json` as a template. Each file has `slug`, an `identity` with `url` and a brief `summary`, and `lanes` with only the lanes that have been started. Lane IDs are `olympic`, `commonwealth` and `national`. Each has `state`, `checkedOn` (ISO date), `checks` and `claims`. Use `note` for an unresolved lead.

| Lane state | Meaning |
| --- | --- |
| Missing | No individual search recorded for that lane. A roster-wide list screen does not change this state. |
| `seed` | One or more claims were verified, and the full individual search remains open. |
| `reviewed` | The individual lane search is complete. An empty claim list means “no evidence found as of this search.” |
| `needs_review` | Source unavailable, credible conflict or unresolved identity. State what would resolve it. The lane stays in the queue. |

Checks use `type` (`index`, `federation_or_team` or `discovery`), `name`, `url` and `outcome` (`supports_claim`, `no_match`, `ambiguous` or `unavailable`). For a completed lane, include a successful index check and a successful federation or team check, even if neither turned up a match. Use source page URLs, with any search variants or date limits in the lane note.

| Lane | Claim kinds |
| --- | --- |
| Olympic | `games_participation`, `trials`, `trials_qualified`, `qualifier`, `qualified_no_start`, `alternate`, `coach`, `youth_games`. |
| Commonwealth | `games_participation`, `selected_no_start`, `qualifier`, `alternate`, `coach`, `youth_games`. |
| National | `team_appearance`, `team_selected`, `squad_member`, `alternate`, `coach`. |

Each claim has `kind`, `edition` (or official competition and year), `sport`, `event`, `delegation`, `category` (`senior`, `under_23`, `junior`, `cadet`, `youth`, `open` or `unspecified`), `result`, `medal` and one or more `sources`. Each source has `name`, `url` and `authority` (`games`, `federation` or `delegation`). A medal must be explicitly documented for that competition. Use `none` for a sourced nonmedal result, or null for an unknown award or a claim outside a competition appearance. The validator counts senior Games medals separately from youth or national competition medals.

A batch is complete when its three lanes are reviewed for every fighter. Keep unresolved lanes visible and report the actual denominator. Research results remain in this folder pending review. Save only public sporting facts and source links, with no copied datasets, credentials or private details. The folder is outside the site build and does not use paid data, modify certification or ratings, or start a scheduled job.

## Starting sources

- **Olympics.** Use official results, event books and federation records. Olympedia and promotion features can surface candidates. Confirm each result independently. [IOC results guidance](https://www.olympics.com/ioc/faq/sports-programme-and-results/where-can-i-find-the-medallists-and-results-of-the-olympic-games) · [United World Wrestling](https://uww.org/) · [International Judo Federation](https://www.ijf.org/) · [World Taekwondo results](https://results.worldtaekwondo.org/)
- **Commonwealth.** Use record books and each games association’s results or named announcements. [Commonwealth Sport record books](https://www.commonwealthsport.com/results/record-books) · [Commonwealth Games Australia](https://commonwealthgames.com.au/) · [New Zealand Olympic Committee](https://olympic.org.nz/)
- **National teams.** Use the sport’s relevant federation and official event results. Confirm age group and whether the person was selected or actually competed. [BEFN credentials research](../../docs/ufc-credentials-pipeline.md)
