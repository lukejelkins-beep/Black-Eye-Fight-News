# Continuous UFC profile research – BEFN

The existing budgeted workflow \`.github/workflows/ufcalendar-rich-backfill.yml\` collects UFCalendar bouts, profiles and career research. Do **not** duplicate these API requests: its cap protects against monthly overage.

## Two independent workers

1. **GitHub Actions queue compiler**: \`.github/workflows/build-ufc-profile-queue.yml\`, scheduled at five-minute intervals on \`main\`. Reads existing saved UFCalendar UFC bout records; never calls an external API; writes \`data/ufc-profile-research-queue.json\` only when the candidate list changes. GitHub scheduled runs are best-effort and may be delayed. The list is *not* an official active UFC roster.
2. **ChatGPT recurring AI researcher**: the existing hourly \`Complete UFC fighter profiles\` task should first read the candidate queue, identify the next unreviewed fighters, check each athlete's CURRENT UFC membership and dated official rankings, independently research primary sources for non-API credentials (NCAA, Olympic judo, ADCC, IBJJF/BJJ, Combat Sambo, Golden Gloves), and produce individually evidence-backed fighter profiles. It must not invent titles, medals, belts or statistics. A cited claim is not automatically a verified claim.
3. **Publish gate**: save fully researched and validated athletes in \`data/ufc-ranked-profiles.json\`, \`data/ufc-contender-profiles.json\`, \`data/ufc-prospect-profiles.json\` or \`data/ufc-roster-profiles.json\`. Each file has \`schema:1\`, \`scope:"ufc-only"\`, \`reviewedOn: "YYYY-MM-DD"\`, and a \`fighters\` object of fully reviewed profiles. Each athlete needs \`id\`, \`name\`, \`organisation:"UFC"\`, \`sport:"MMA"\`, \`category\`, \`record\`, \`division\`, \`source\` pointing to a real UFC biography, \`review:{checkedAt,credentialsChecked:true,notes:[...]}\`, \`latest\` verified UFC results, and \`credentials:[]\` (explicitly empty if none verified). Optional \`verifiedStats\` must cite a UFC-only denominator, a dated snapshot and leave missing numerical properties absent/null. The UI loader adds only reviewed profiles; the existing card-model and profile validator enforce scoring integrity.

No verified current official ranking is currently stored in this queue; do not label candidates ranked merely because they were on a UFC card. Preserve the latest main branch feeds during parallel updates. No user tokens or provider raw-response databases in the public site.

## Not supported without separate setup

GitHub Actions cannot invoke ChatGPT's recurring research task. An autonomous AI researcher running entirely inside GitHub would need an AI model API, explicit authorisation and securely stored key, a source-search provider, rate/cost controls and verification safeguards. None of those credentials should be guessed or silently provisioned. This implementation uses the already-authorised hourly ChatGPT researcher and GitHub for the persistent, frequent data queue.


## New booking and post-fight reconciliation

- \`data/upcoming-cards.json\` is now scanned for every UFC MMA pairing within the next 60 days. Anyone not in a complete source-reviewed cohort enters \`newCardEntrants\` in \`data/ufc-profile-research-queue.json\`; that event pairing remains *unverified* until checked against its source. This does **not** publish a provisional profile.
- The saved paid UFCalendar UFC/PFL backfill already collects completed bouts and round statistics within its existing monthly ceiling. It now runs \`scripts/build-ufc-profile-queue.mjs\` and \`scripts/build-ufc-postfight-metrics.mjs\` before its normal commit. The independent five-minute scheduled queue workflow also runs both scripts as a fallback; GitHub's cron schedule is best effort, not a guaranteed live polling rate. Neither script makes its own external API requests.
- \`postFightRefreshCandidates\` lists previously reviewed UFC fighters with completed UFC fights newer than the latest bout recorded in their published profile. The hourly AI researcher must independently reconfirm the official result, record and last five UFC bouts, review any changed rankings or credentials, reconcile rates and ratings, and run desktop/mobile visual QA before publishing changes to career/ratings.
- \`data/ufc-postfight-metrics.json\` exposes source-derived *tracked sample* strike totals, absorbed counts, significant-strike and total-strike differentials, knockdowns, takedowns, submission attempts and control time, with **per-metric** bout coverage. The website's \`assets/fighter-insights.js\` renders these in reviewed fighter profiles and a matchup statistics panel. Every completed bout ID contributes at most once. Incomplete rounds, conflicting source metrics and unverifiable bout clocks are excluded, not replaced with zero.
- The source-derived tracked-sample panel updates automatically after collection and data publication. It is **not** the fighter's full career total and must not automatically overwrite independently validated career-wide UFC statistical rates. The research task handles those broader reconciliation decisions.
- Validate with \`node --test tests/test-ufc-profile-queue.mjs\`, \`node --test tests/test-ufc-postfight-metrics.mjs\`, and the per-profile source/card + Playwright desktop/mobile QA. Screenshots and reports are saved as CI artifacts. Failed QA blocks treating an individual profile as verified.


## Prospect and Contender algorithm v2 (12 Nov 2026)

Classification is determined **individually across the complete verified UFC catalogue**. There are no top-N quotas or division caps. The source of truth is \`assets/ufc-prospect-contender.js\`, tested with \`tests/test-ufc-prospect-contender.cjs\`.

**Two distinct, independent editorial indices (each 0–100):**

| Factor | Contender Index | Prospect Index |
|---|---:|---:|
| Demonstrated quality of UFC opponents | 25% | — |
| Recent form / recency-adjusted UFC results | 25% | 30% |
| Established UFC experience or UFC progression | 15% | 20% |
| Independently verified UFC-only skill statistics | 20% | 15% |
| UFC finishes (KO/TKO/submissions) | 10% | 15% |
| Professional record / foundation | — | 15% |
| Verified credentials (separate, capped) | 5% | 5% |

The finishing share is deliberately smaller in the contender index than the prior v1: finishes are already correlated with wins and with the separate UFC skill scores. The skill component uses the **base statistics rating**, before external credentials, to prevent awarding the same credential twice. Small numerical samples have reduced influence. Missing numerical fields are NOT assumed to be zeros; the user interface shows evidence gaps separately. Relative-to-division normalisation is not claimed until sufficient comparable complete samples exist.

**Opponent strength is a classification gate, not merely a bonus.** An athlete can qualify as Contender through:
- A fresh, verified **official UFC top-15 rank** (source dated within 45 days), plus meaningful recent results and a Contender Index of at least 55; or
- At least one **source-dated UFC win over a top-15-ranked opponent at fight time**, sufficient UFC experience and a Contender Index of at least 60; or
- Two separately sourced wins over established UFC veterans (each with at least 4 prior UFC wins and 6 UFC fights at the bout date), sustained positive form, and a Contender Index of at least 67.

An unsourced claim that an opponent was "ranked", or a modern rank projected backwards, earns zero opponent-quality credit. Four wins alone **never** automatically makes a contender. The winning form thresholds and the opponent-rank evidence must also pass; labels are editorial, not official rankings.

**Prospect** is a non-contender with a developing UFC career (at most nine completed UFC appearances), verified professional experience, a meaningful recent positive trajectory, and Prospect Index at least 50. A loss does not automatically demote a prospect. A fighter who arrives at the UFC at 34 can qualify; no arbitrary age cap is used. Other fully reviewed athletes are **Roster**, and missing required UFC records produce **Unassessed**. Champions are separate dated titleholder records.

**Evidence confidence:** Limited / Moderate / High, displayed independently of the two scores. Missing opponent-quality confirmation is noted explicitly; it is not proof that a fighter has never beaten ranked opposition. The two score thresholds are initial editorial heuristics, not predictive models. Validate against more examples and actual future outcomes before claiming predictive performance.

**Worked source-linked November 7, 2026 examples:** José Souza, Austin Bashi, Lucas Fernando and Elijah Smith are Prospect with their currently verified evidence. The earlier automatic "Contender" label for Elijah Smith was premature: four UFC wins and three finishes are encouraging, but the supplied record does not establish a dated ranked win. This classification can change as missing opponent-quality evidence is verified.

**Required QA:** rerun \`node tests/test-ufc-prospect-contender.cjs\`, \`node tests/test-ufc-profile-card-qa.cjs\`, remaining Node model tests, and the Playwright mobile/desktop screenshot workflow. Every newly sourced fighter and every post-fight update is reclassified. Profile cohort filenames are storage organisation, not labels; validation requires the published category to match the algorithm.

## Mandatory production QA after publishing a UFC profile

The **local** GitHub Actions workflow \`.github/workflows/validate-ufc-profiles.yml\` runs source-data integrity tests and visual preview checks before a profile can be considered ready. It is NOT evidence that the profile has reached Render.

\`.github/workflows/verify-live-ufc-profiles.yml\` separately verifies the actual public site at \`https://blackeyefightnews.com.au\`. It runs after successful local validation workflows and at least hourly, and can be manually dispatched. The browser test \`tests/test-ufc-profile-visual.mjs\` is shared between local and production modes.

A production check is **passing only if ALL** of the following hold for every independently reviewed UFC fighter on the checked GitHub \`main\` snapshot:

1. The public homepage responds successfully and *all five* live cohort JSON files contain the current individually reviewed source records (id, name, source-audited UFC-only history, professional record, stats, official rank evidence, credentials, notes and editorial category). This prevents calling a stale Render deployment complete.
2. The published profile successfully loads in a **real headless Chromium browser**. The dialog opens to the correct fighter and displays the exact record, division, category, five rating dimensions, sources and recent-fight rows.
3. Both **desktop 1366×900** and **mobile 390×844** views are tested for horizontal overflow/clipping, close controls and screenshots.
4. Broken or absent fighter portraits are recorded as a **failure on production**, not silently ignored. Missing external portrait licences and independently source-verified identity continue to require editorial review, even if the image HTTP response is successful.
5. Automated report and per-profile screenshots are uploaded with the live QA run. Any failed step is a blocker, not an implicit approval.

GitHub Actions/Render deploys are asynchronous. A fresh GitHub commit is not proof that production has deployed. The production job waits for the public cohorts to agree before examining browser UI; if production is stale, the job fails and reports precisely which records have not appeared. This is a **detection/verification gate**, not a Render deployment hook or rollback system; do not assert the public release is verified until its live QA actually passes. In particular, no automated DOM screenshot suite can guarantee editorial truth or pixel-perfect aesthetics without an additional independent reviewer examining artifacts and linked primary sources.

Investigate and fix failures at their origin (data, JavaScript, CSS, image URL, or deployment integration), then rerun local and production tests. Do not overwrite a newer production profile with stale data merely to make a check pass.


## Mixed-version production prevention

**Root cause confirmed on 12 November 2026:** A previously deployed \`index.html\` had no \`data-befn-recent-results\` attribute, even when the reviewed cohort JSON files matched GitHub. An unqualified browser test reported all fighters' recent results as wrong. Deployment readiness now hashes and compares public production bytes against the exact current checkout for \`index.html\`, \`assets/fighter-insights.js\`, \`assets/ufc-prospect-contender.js\`, \`assets/fighter-power-index.js\`, \`assets/fighter-power.css\`, and all existing reviewed UFC cohort JSON files before opening any fighter. A partial deploy, stale CDN HTML, or outdated classifier fails as **PRODUCTION OUT OF DATE** rather than a false fighter-record mismatch.

\`scripts/ufc-qa-freshness.mjs\` and \`tests/test-ufc-qa-freshness.mjs\` cover a scenario where the latest reviewed fighter JSON is live but the HTML/JS isn't. The Playwright test also deliberately loads an invalid image for a published athlete and requires a visible, accessible \`Photo unavailable\` fallback on both mobile and desktop. These are deterministic regression tests: they don't depend on a third-party image CDN failing by chance. A real, rights-verified portrait must still load correctly.


## Five-worker research efficiency and production audit (13 Nov 2026)

The top-level candidates array is a 120-item PREVIEW ONLY. The full research pool is exposed, without truncation, in historicalByWorker.A-F, .G-L, .M-R and .S-Z. These workers exclude newCardEntrants and postFightRefreshCandidates, exclusively reserved for the priority worker. All names in these queues remain unverified until separately source checked.

Each worker persists findings to its own file in data/ufc-research-workers (a-f.json, g-l.json, m-r.json, s-z.json, priority.json). Each file has separate athlete entries with name, status, lastCheckedOn, sourceUrls and concrete blockers or nextAction. A blocked athlete should not consume the next hourly run unless new evidence resolves its blocker; worklogs do NOT publish profiles. Complete one fully verified profile per run before starting another, with independent official UFC membership checks, career UFC record and last up to five UFC completed bouts, externally verified credentials, dated ranking evidence, and deterministic V2 classification. Preserve all five-fight source rows, separate from the possibly smaller tracked round-statistics sample. A UFC newcomer with fewer than five completed UFC fights legitimately has fewer history rows.

The free Audit UFC research pipeline GitHub Actions job now runs hourly, produces a JSON report and GitHub summary, and distinguishes reviewed cohort count from actual full-five verification and unresolved UFC-only career records. Every worker must report verified completed athlete names, source checks, GitHub changes and live Render QA separately. Only the Verify live UFC fighter profiles workflow after a current Render build can confirm production UI readiness. A new preflight compares deployed HTML, JS, CSS and reviewed cohort bytes before installing Chromium; old production files fail fast as deployment issues, not erroneous fighter facts. No extra paid APIs are used for these checks.
