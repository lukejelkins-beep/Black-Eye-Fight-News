# BEFN Sumo section — isolated test build

**Date:** 14 November 2026  
**Branch:** feat/sumo-section-test-20261114  
**Base for this work:** feat/sumo-api-source-20261114 (draft PR #194; API adapter)  
**Entry page:** /sumo.html  
**Production status:** NOT deployed. No production/main changes have been made by this development work.

## Approved tracked roster

This phase follows **all wrestlers currently ranked** in the three highest professional divisions, using the provider's current banzuke and wrestler roster. Lower divisions are not part of the active tracked directory. The roster is recalculated on every explicit source-snapshot build, so promotion or relegation moves a wrestler in or out of the selected cohort automatically.

As of the captured November 2026 API snapshot:

| Division | Wrestlers |
| --- | ---: |
| Makuuchi (Yokozuna, Ozeki, Sekiwake, Komusubi, Maegashira) | 42 |
| Juryo | 28 |
| Makushita | 120 |
| **Total** | **190** |

The source returned 596 rikishi before eligibility filtering. This is *not* a permanent or capped list; it is determined by current rank. The source snapshot date is embedded in JSON and shown on the pages.

## Built pages

- **Sumo homepage**: dark/cream BEFN identity, sport navigation, title banner, current roster counts, one featured wrestler from each division, Makuuchi leaders and links to the other sections.
- **Rikishi directory**: all 190 wrestlers, division filters, name/kanji/heya/birthplace search, browsable cards with current rank.
- **Rikishi profile**: every tracked wrestler gets a profile route \`sumo.html#profile/<sumoApiId>\`, source identity, height, weight, stable and birth info when provided, current basho W/L/A from the division's banzuke, and results in a card design consistent with other BEFN profiles. Three featured wrestlers currently have additional source stats and recent bout history.
- **Basho centre**: November 2026 tournament summary, all three divisional standings, previous completed matches for Makuuchi and Juryo and lower-division Makushita results. No live-status claim.
- **Banzuke**: all three ranks with East/West ordering, per-rikishi wins, losses and absences.
- **Kimarite**: technique reference, sampling explanation, and source-linked winning-method breakdown for the featured athletes.
- **Integration**: the test-branch version of \`index.html\` has a Sumo link in its main and sport navigation. The existing sport-switch JS remains unchanged and all other sports retain their routes.

## Sourced data & hard limits

- \`data/sumo/rikishi-index.json\`: 190 ranked identity/physical records out of 596 source athletes.
- \`data/sumo/preview-details.json\`: all three current banzuke and featured match/stat samples.
- Featured individual enrichment: **Onosato (Makuuchi), Wakatakakage (Juryo), Nishikigi (Makushita)**, with 18 recent results requested where the API supports them.
- No automatic polling or background refresh enabled. A controlled action on the **test branch only** can refresh snapshots; the helper makes up to 16 read-only requests per run, validates the roster, and atomically writes the result.
- Career stats, full historical banzuke progressions and opponent lists are **not complete** across all 190 athletes. These display explicit “not collected” messages, not fabricated analytics.
- Makushita typically has seven fought bouts across a 15-day basho. The preview does **not** map sequential Makushita bout records onto consecutive calendar days.
- Wins and losses, absences, forfeits and unplayed matches remain distinct. Techniques are counted only where the wrestler is the winner; forfeits do not count as a wrestling technique.
- No fighter photographs have been imported: illustrated silhouette placeholders are intentional until image permissions are confirmed.
- The API provider requests webmaster contact from users planning a website. Public republishing and bulk automated collection should remain pending a use-terms clarification and source spot-checks against the official Japan Sumo Association.

## How to review

From a checkout of this branch, serve the repository with any static HTTP server; for example:

\`\`\`bash
python3 -m http.server 8000
# Then open http://localhost:8000/sumo.html
\`\`\`

Do not open the HTML as \`file://\`, because JSON snapshots are loaded with \`fetch()\`.

Navigate Overview → Rikishi → Profile, try division filters, compare the current Makuuchi/Juryo/Makushita banzuke, and inspect mobile layouts.

## Automated tests

- Source adapter: \`node --test tests/test-sumo-api-source.mjs\`.
- Sumo data and preview: \`node --test tests/test-sumo-data.mjs\`.
- Syntax: \`node --check assets/sumo.js\` and \`node --check assets/sumo-data.mjs\`.
- Dedicated action: \`.github/workflows/sumo-section-qa.yml\`; has no deployment steps.

**Next release gates:** licensed imagery/provider contact; fuller 190-person stats/match collection within provider limits; proper official JSA reconciliation; browser-based cross-device QA; optional independent Render test service; explicit user production approval. Do not merge this work as part of unrelated UFC profile certification or boxing changes.
