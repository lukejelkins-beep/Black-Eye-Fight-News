# BEFN — UFC Fighter Performance Index V4: deployment and credentials expansion

**Proposed 14 November 2026 · planning only; not approved for production scoring**

Status: design candidate awaiting data audit, retrospective validation, owner approval and live QA. This document adds a *future* rollout stream; it does not supersede the approved 783-fighter 36-month eligibility roster, the Stage 3 full-career UFC collection, existing published V3 scores/categories, or any budget/security/CI guards.

## Non-negotiable constraints

- **Keep Stage 3 running:** complete the approved 783-fighter 36-month UFC activity cohort's FULL UFC career histories. The 36-month window is an eligibility rule, not a cutoff on historical bouts. Preserve saved bouts/round observations and request missing UFCalendar data only when necessary; do not repeat completed API requests.
- Preserve the approved **Last 5 / Last 10 / Career** presentation and detailed fight rows. Those are display windows, not three sets to add together; a bout must never be double-counted.
- Run algorithms in an **independent, offline, deterministic calculation stage** reading the existing cached repository data. Do not run paid API calls or score recalculations in visitors' browsers. Version all outputs and keep V3 unchanged until approved release.
- UFCalendar is the primary UFC result/statistics source. Respect separately verified historical UFC fights, provider contracts, licensing, provider quota protections, fixed identities, verified official UFC event scope and existing CI safety checks. Never use TinyFish.
- Zero is evidence, null means unavailable. Track per-metric coverage, round completeness, observed fight seconds, attempts, source, as-of date and confidence. Do not infer a statistic from absent historical data. Treat source conflicts and mismatched fighter/bout IDs as blockers.
- Do not silently assume all legacy fights have round stats: compute period-specific baselines from valid comparable samples only. Dates, divisions and opponents must be assessed at fight time, not using today's ranks retrospectively.
- All scores are **descriptive, experimental indices** until tested; they are NOT official UFC rankings, objective skill measurements, win-probability forecasts or betting advice.

## Sequenced rollout (future Stage 4 after Stage 3)

| Stage | Deliverable | Gate/acceptance |
|---|---|---|
| 3 — ongoing | Full UFC bout/result history for approved 783 athletes, reusing saved cache; source-verified individual stat fields | Coverage and lineage audit; no interruption to five-minute collector or hourly research |
| 4A — evidence audit | Field-by-field completeness by year, division, metric, fighter and sample fights; historical opponent network beyond active roster; canonical athlete/bout IDs | Publish missingness and confidence report; decide which metrics can support each period |
| 4B — credential catalogue | Collect/verify achievements listed below separately from UFCalendar fight stats, recording exact source and dates | Research ledger shows verified / explicitly checked absent / unknown / disputed; no guessed points |
| 4C — shadow V4 models | Offline scoring module producing Striking, Grappling, Wrestling, Defence, Form, Prospect, Contender and overall Ability; retain V3 in public | Deterministic tests, denominator checks, opponent links, versioned saved outputs, no API duplicate calls |
| 4D — retrospective calibration | Compare last 3, last 5, last 10 and exponentially weighted career models; test proposed coefficients and division standards | Walk-forward holdout using only information available before each bout; evaluate calibration, discrimination, instability, bias and sample reliability |
| 4E — preview | Insert *shadow* V4 ratings on non-production preview; retain existing clean V3 design and approved 5/10/career selectors | Mobile/desktop visual QA, profile-by-profile spot checks including newcomers, veteran champions, rare specialists, sparse historic data, changes of division |
| 4F — controlled release | With explicit owner approval, feature-flag V4 to a limited sample, then publish through existing CI/Render safeguards | Rollback path to V3, unchanged data pipelines, observed prod deployment hashes, live visual QA and post-release score monitoring |

The weights below are **starting hypotheses only**, to be changed only after historical comparison. Test performance stability and significance, not just whether a score sounds sensible.

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

## Verified credential expansion — research workstream

**Existing types:** NCAA Divisions I/II/III wrestling, Olympic judo, BJJ belts, ADCC medal results, sport/combat sambo, Golden Gloves. Do not delete the existing catalogue or retroactively re-score V3. Review current browser extraction/deduplication and the scoring source-verification gate, especially distinction between official medal placements vs participation.

**New types to research for all approved UFC athletes (in priority order):**

| Family | Achievements to record | Suggested primary authority | Scoring treatment to evaluate |
|---|---|---|---|
| **International wrestling** | Olympic freestyle/Greco-Roman/women's wrestling medals and participation; UWW senior worlds medals; continental and senior national titles | Olympics/UWW (https://uww.org); national governing bodies | Strong Wrestling bonus for senior elite medals; lesser participation/titles lower, no double counting |
| **Judo** | IJF world medals; Olympic judo already tracked; Grand Slam/Grand Prix/continental medals and titles | IJF (https://www.ijf.org) | Modest to strong relevant Grappling/Wrestling credit; separate medals from belt rank |
| **Competitive BJJ** | IBJJF Adult black-belt World GI/No-Gi titles and medals; Pan and European Championships; other explicitly identified belt/age brackets | IBJJF (https://ibjjf.com) | Major adult black-belt results above training belts; master's/junior/brown-belt categories distinct |
| **Professional submission grappling** | ADCC Trials titles and Worlds medals; recognised major professional grappling champion titles (verify promotion, discipline and level) | ADCC (https://adcombat.com), direct event organiser | Grappling credit, tiered beneath/alongside ADCC Worlds as appropriate |
| **Boxing** | Olympic medals; world amateur medals; national senior championships; actual pro boxing titles (scope/provenance) | Olympics, World Boxing, national amateur bodies, sanctioning organisations | Relevant Striking; separate boxing achievements from an MMA KO record |
| **Kickboxing** | GLORY, K-1 senior professional championship belts; WAKO senior worlds medals | Promotion and WAKO official records | Relevant Striking; belts not equivalent across promotions/levels |
| **Muay Thai** | IFMA senior world medals; Lumpinee/Rajadamnern stadium belts; other verifiable major senior titles | IFMA (https://muaythai.sport), stadium/promotion records | Relevant Striking; label ruleset and competitive tier |
| **Sambo extension** | Distinguish FIAS senior combat/sport world titles and medals from local/national results | FIAS official records | Combat may affect multiple skills; avoid duplicating already stored sambo achievements |
| **Amateur MMA** | IMMAF senior Worlds medals, continental gold; junior titles separate | IMMAF (https://immaf.org) | Prospect/progression *context* and modest foundation credit, not UFC-specific technical evidence |
| **Non-UFC professional MMA belts** | Prior Bellator, PFL, ONE MMA, Rizin, Cage Warriors, LFA, Invicta and other verified titles; defence/reign dates and weight classes | Individual organisation official histories/results | Historical achievement and opponent-quality context; never direct technical bonus or UFC title status |

**Secondary research only:** NAIA/NJCAA or comparable collegiate/national championships, elite karate/taekwondo/sanda accomplishments, major amateur kickboxing events, recognised national BJJ championships and regional MMA titles. Distinguish competitive tier and ruleset; do not award points merely for gym affiliation, publicity, record claims, self-reported ranks, or unverified youth/school achievements.

### Credential scoring and validation rules

- Preserve detailed achievements for readers **even if their point adjustment is zero**. Keep no public footnotes on calculation in the streamlined fighter card; internal ledger must be auditable.
- Minimum data per achievement: athlete stable ID, martial art, event/promotion and sanctioning body, discipline/ruleset, verified event date/year, age/belt tier, weight class, placing/medal/title, eligibility (senior/juvenile/master), primary link, reviewed-on date, verification status, cross-source identity resolution and non-duplicative achievement key.
- Verification statuses: `verified`, `checked-none`, `unknown`, `disputed`; the latter two are not scored. An arbitrary HTTPS link is not sufficient verification. Distinguish `credentials: []` with explicit documented verification from merely unresearched.
- Competitive medal **versus** tournament participation; individual NCAA title **versus** team championship; BJJ **black belt rank** versus adult-black-belt world title; professional championship **versus** contender bout or interim title; sanctioned **sport** versus **combat** sambo.
- Initial point examples awaiting validation: NCAA D-I individual champion +6 Wrestling; D-I All-American +4 Wrestling; D-II individual champion +4 Wrestling; Olympic judo gold +5 Grappling/+4 Wrestling; ADCC Worlds gold +7 Grappling; verified BJJ black belt +2 Grappling; national Golden Gloves +4 Striking; FIAS Combat Sambo senior world title +3 Striking/+4 Grappling/+4 Wrestling. **No automatic points assigned to newly introduced families before review and calibration.** Trial cap 8 points per dimension, subject to sensitivity analysis.
- Use the highest achievement within equivalent award families, with tightly limited incremental credit for separate verified results; avoid counting the same competition as title + gold medal + medal count. Separate credential effects from measured MMA ratings, so adding a medal never generates statistical evidence where none exists. Do not award credential points twice through Prospect/Contender and technique composites.
- Preserve historical award facts even if the fighter is no longer ranked in that discipline. Evaluate whether/how prior credentials should decay in contemporary UFC ability assessments; don't erase earned medals.
- Verified NCAA, judo and world-level accomplishments should be assessed individually using **primary** result sources, rather than extrapolated from biographies or social media.

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

**Scope of this planning update:** documentation only. No production code, public data, deployment configuration, automation prompt or existing ingestion workflow is changed by this document.
