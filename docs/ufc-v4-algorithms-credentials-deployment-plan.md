# BEFN — UFC Fighter Performance Index V4: deployment and credentials expansion

**Approved direction 14 November 2026 · UFC-first delivery, external achievement research deferred**

Status: V4 direction authorised by site owner. Build and validate the UFCalendar-only UFC statistical foundation first. A separate, subsequent achievements research project may enrich V4 later. Specific unvalidated coefficients, classifications and production release remain QA-gated. This plan does not supersede the 783-fighter approved cohort, Stage 3 history collector or existing budget/deployment protections.

## Non-negotiable constraints

- **Keep Stage 3 running:** complete the approved 783-fighter 36-month UFC activity cohort's FULL UFC career histories. The 36-month window is an eligibility rule, not a cutoff on historical bouts. Preserve saved bouts/round observations and request missing UFCalendar data only when necessary; do not repeat completed API requests.
- Preserve the approved **Last 5 / Last 10 / Career** presentation and detailed fight rows. Those are display windows, not three sets to add together; a bout must never be double-counted.
- Run algorithms in an **independent, offline, deterministic calculation stage** reading the existing cached repository data. Do not run paid API calls or score recalculations in visitors' browsers. Version all outputs and keep V3 unchanged until approved release.
- UFCalendar is the primary UFC result/statistics source. Respect separately verified historical UFC fights, provider contracts, licensing, provider quota protections, fixed identities, verified official UFC event scope and existing CI safety checks. Never use TinyFish.
- Zero is evidence, null means unavailable. Track per-metric coverage, round completeness, observed fight seconds, attempts, source, as-of date and confidence. Do not infer a statistic from absent historical data. Treat source conflicts and mismatched fighter/bout IDs as blockers.
- Do not silently assume all legacy fights have round stats: compute period-specific baselines from valid comparable samples only. Dates, divisions and opponents must be assessed at fight time, not using today's ranks retrospectively.
- All scores are **descriptive, experimental indices** until tested; they are NOT official UFC rankings, objective skill measurements, win-probability forecasts or betting advice.

## UFC-first rollout — Stage 4, followed by separate Stage 5 research

Owner's explicit decision (14 November 2026): **move towards V4 now; complete UFC-only fight/statistical profiles using UFCalendar and existing saved evidence before starting the other-achievement research as an independent project**. External credential completion is **not a dependency** of initial V4 scores, leaderboards, or UFC fighter profile release.

The saved GitHub Stage 3 audit at 2026-11-14 ~01:04 UTC reported: **783 approved, 783 with saved UFC history, 6,688 saved history rows, 4,504 distinct native UFC IDs, 4,492 indexed and 4,490 with paired core round metrics**. All **482** athletes with five known bouts had five measured bouts; all **285** with ten known bouts had ten measured bouts. **780** fighters had at least one measured recent bout. Only **3** full career timelines carried explicit provider-complete certification and **144** numeric identity crosschecks were completed. Treat provider certification separately from statistical sample coverage; do not infer absent results for fighters with fewer than five UFC appearances. These are a dated snapshot, not guaranteed live counts.

| Phase | UFC-first deliverable | Gate |
|---|---|---|
| **Stage 3 — existing, ongoing** | Collect/reconcile full UFC careers for approved 783; prioritise 12 remaining native-ID manual-review exceptions and the unconfirmed career completeness checks. Use cached results and checks before calling UFCalendar again. | No history truncation, duplicate API work, feeder contamination, or altered existing automation |
| **4A — canonical UFC dataset** | Deduplicate all saved official UFC bouts by confirmed native bout ID, with both corners' results, finish clock, event, division, round metrics and source. Join once to each approved fighter by canonical identity; preserve independently verified official UFC histories and conflicts. | End-to-end audit by fighter and unique bout; complete/partial/unverified flags, no zero substitution |
| **4B — UFC-only statistics** | Compute latest 5, latest 10 and career performance for EVERY eligible fighter using actual completed UFC fights and per-metric denominators. Include coverage by year/era, per-corner stats, KO/TKO and submission wins, knockdowns, takedown attempts/success/defence, striking, control and observed seconds. | Test missing/fewer-than-5 cases, short finish rates, historical gaps and division mismatches |
| **4C — shadow V4 UFC-only ratings** | Independently calculate Striking, Grappling, Wrestling, Defence, Recent Form, Prospect, Contender and a candidate overall Ability index using ONLY UFC record, result, opponent and UFCalendar-derived metrics. **No external achievement points**. | Snapshot version, deterministic idempotent tests, separate run from data ingestion, no API calls |
| **4D — historical validation** | Compare 3/5/10/decayed full-career alternatives, opponent adjustments, shrinkage, division/era normalisation and thresholds on past as-of snapshots. Investigate Glicko-style career rating without assuming predictive validation. | Walk-forward checks; score stability; sparse-data/outlier audits; differential reports for all 783 |
| **4E — staged publication** | Retain the existing profile layout and Last 5/Last 10/Career UI; preview, CI, responsive and live Render QA; phased V4 UFC-only publication under rollback feature flag. | Model coefficients and production switch receive explicit final approval after validation |
| **Stage 5 — separate project** | Research NCAA, Olympic, judo, IBJJF, ADCC, international wrestling, kickboxing, Muay Thai, boxing, sambo, IMMAF and previous professional MMA titles in a distinct offline research ledger/worker. | Starts after UFC-only baseline is established, independently verified; achievements never block core statistics |
| **5B — optional enrichment** | Test credential bonus schedule against performance data, avoid double counting and show verified achievements in profiles; apply scoring adjustment only when separately validated. | Distinct code version and production sign-off; non-UFC MMA belts are historical competition context, not automatic technical skill bonuses |

### Efficient scaling to 783 profiles

1. **Collect per unique fight, not per fighter:** a single native UFC fight ID is authoritative for both fighters. Cache all parsed round fields once; no separate per-fighter stat calls.
2. **Audit existing inventory first:** produce a fighter-by-fighter coverage matrix with number of known UFC fights, career completeness/certification evidence, native-ID links, last 5/10/career stat-covered fights, observed seconds and missing metric fields. Missing 5/10 window because an athlete only has 2 UFC fights is not a data defect.
3. **Classify acquisition work:** (A) already cached and usable (derive immediately); (B) missing but fetchable known UFC fight ID (queue once); (C) provider history completeness/identity uncertain (separate one-time targeted crosscheck); (D) conflicting/unsupported historic fields (manual exception; do not endlessly retry).
4. **Prioritise impact:** identity corrections first; then newest five; then fights six–ten; then uncovered older career bouts. Shared fights across two approved fighters win ties. Do not re-fetch complete bout observations.
5. **Use aggregate statistics correctly:** significant strikes/min = sum landed / summed *observed cage minutes* for bouts with valid numerator/denominator; takedowns/15 and knockdowns/15 likewise; accuracy/defence = summed successes / summed verified attempts. Reuse the same source facts for the 5/10/career windows with per-stat coverage counts.
6. **Continuous maintenance:** existing scheduled UFCalendar collector remains sole paid-data ingester. An independent downstream script rebuilds versioned UFC-only stats when saved input hashes change; recalculate the affected athletes/opponent network only, with a periodic full consistency audit. No added competing five-minute workflow.
7. **Separate scoring from collection:** source observations immutable; V4 interpretation may be recalibrated without querying UFCalendar again. Keep V3 scores live until V4 feature flag approval.

The future achievement project specification lives in [ufc-external-achievements-research-project.md](ufc-external-achievements-research-project.md). No research API/integration, website, automation or production classifier changes are authorised merely by approving this plan.

## Performance-index candidate model

Use per-bout UFC statistics, observed cage exposure and point-in-time opponent ratings with comparable divisional/era benchmarks. Candidate technical sub-index coefficients (normalised to 100; omit a score when required signal is absent, rather than redistributing nearly all weight to a single weak signal):

| Index | Proposed component shares |
|---|---|
| **Striking** | significant-strike differential 30%; accuracy 15%; output 10%; knockdowns per 15 minutes 25%; KO/TKO finishing impact 20% |
| **Grappling** | submission finishes 35%; submission attempts/threats 25%; reversals/scrambles 20%; *verified* effective ground position 20% (do not fabricate if unavailable) |
| **Wrestling** | takedowns per 15 minutes 30%; takedown accuracy 20%; net control 20%; takedown defence 20%; reversals 10% |
| **Defence** | opponent-adjusted strikes absorbed 30%; strike defence 25%; takedown defence 20%; control conceded 15%; knockdowns absorbed 10% |
| **Recent Form** | opponent-adjusted results 40%; observed performance trend 25%; quality of victories/finishes 20%; consistency and activity 15% |

- Benchmark within division and comparable era only where there is adequate coverage; define fallback and 'unrated' logic explicitly. Prevent 100% takedown defence from zero opponent attempts and rare short-fight rate outliers.
- Candidate technical recency weighting for the full chronological career: `weight(i) = 2 ** (-i / 5)`, `i=0` newest; test alternatives (three-, five-, ten-fight windows, time-based decay, change-points) rather than assume this is optimal.
- Use empirical shrinkage/credible intervals so a fighter with one 40-second finish does not leap to an implausible extreme. Expose evidence confidence internally and in a subtle reader-facing sample indicator as appropriate.
- Keep correlated features in check: a single KO can affect the striker dimension and the result component but should not become the same large additive bonus repeatedly. Assess coefficient sensitivity with ablations.

### Independent Prospect, Contender and overall assessments

- **Prospect (candidate):** trajectory 25%; measured skills 25%; opponent-adjusted results 20%; UFC/pro foundation 15%; verified credentials 10%; improving finishing ability 5%. No division quota, strict age cap, automatic loss exclusion or arbitrary 9-UFC-fight ceiling.
- **Contender (candidate):** quality of opposition 40%; current form 25%; measured technical performance 20%; sustained UFC level 10%; high-quality finishes 5%. Preserve a meaningful verified opponent-quality gate; no 'four UFC wins means contender' shortcut.
- **Overall UFC Ability (candidate):** opponent-adjusted UFC career rating 65%; technical performance 25%; recent form 10%. Trial Elo/Glicko-2-like models **offline** using full historical opponents and chronological result updates; inspect sensitivity to sparse UFC schedules, inactivity, division changes and limited opponent histories before committing. Do not imply that standard Glicko-2 assumptions are validated for MMA.
- **Titleholder status** is separately verified, dated and displayed. UFC belts/reigns are *not* an extra skill score purchase. Independent professional MMA belts are historical competitive credentials, not proof of a specific striking or wrestling skill.
- Capture and evaluate all eligible athletes; labels remain algorithm-driven with no fixed counts per weight class. Show Unassessed if necessary source or minimal evidence is missing.

## External achievements — deferred, independent research project

Do **not** hold back the UFCalendar-derived UFC statistical foundation, V4 technical metrics, baseline Prospect/Contender classifications or leaderboards while researching external credentials. Begin this project only after the UFC-first stage is sufficiently established.

See [separate external achievements research project](ufc-external-achievements-research-project.md) for collection phases, source priorities, verification schema, organisational batching and optional post-baseline scoring experiments. Keep achievements/source provenance independently stored. Do not infer a missing credential to be absent, or award bonuses because a biography mentions a rank without verification. No change to V3 credential scores in this phase.

## Test and deployment gates

1. Frozen 783-roster fixture, complete UFC career chronology and re-run idempotence, deduplication, title-ruleset edge cases, sample denominators and missing data tests.
2. Walk-forward as-of snapshots and division/era comparison, not look-ahead rankings. Report predictive calibration where attempted, rank stability, coverage and transparent uncertainty by division and date.
3. Representative cases: debut one-round KO, active veteran dating to 2008, Olympic wrestler with weak MMA takedown stats, BJJ black belt without UFC submissions, excellent wrestler without NCAA credentials, recent champion on a losing streak, former regional champion and UFC contender without official rank, split/division changes, short control samples.
4. Side-by-side V3/V4 score and category diffs for all approved 783 athletes. Exceptions/large movements reviewed before approval; no quotas.
5. Present proposed weights, observed validation results, affected fighter labels and any unavailable historical metric limitations to the site owner for **explicit production sign-off**.
6. Feature-flagged production merge only after passing CI, deployment-asset consistency check, responsive fighter-card screenshot QA and post-deploy live verification. Back out V4 while preserving verified data if errors arise.

## Primary research references

- United World Wrestling historical event results: https://cms.uww.org/event/senior-world-championships?section=results
- IJF ranking and event information: https://ijf.org
- IBJJF athlete ranking/competition tiers: https://ibjjf.com/athlete-ranking-info
- ADCC World Championship official results: https://adcombat.com/adcc-world-championship-2026-brackets-day-2-full-results/
- International Federation of Muaythai Associations: https://muaythai.sport/organisation/about-us/
- IMMAF senior/junior ranking distinctions: https://immaf.org/athletes/rankings/
- Glicko-2 methodological reference: https://www.glicko.net/glicko/glicko2.pdf

**Scope of this planning update:** UFC-first direction approved, documentation only. No production model code, public fighter data, automation or UFCalendar ingestion workflow is changed by this plan commit.
