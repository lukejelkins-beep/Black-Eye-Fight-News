# BEFN — External Athlete Achievements Research (separate future project)

**Status:** Deferred until UFCalendar-only Stage 4 UFC statistics and initial V4 baseline are established. **Not** part of the primary UFC fight-statistics research workstream. **No automatic deployment or bonus application from this document.**

## Aim and scheduling

Enrich the approved 783-athlete cohort with real, source-verified **external combat-sport achievements** after core UFC statistics are complete. Work independently of the UFC full-career collector and its budget, with no UFCalendar calls required to find NCAA/Judo/BJJ/etc credentials.

Do **not** use this research project to block the UFCalendar-only V4 skills, Last 5 / Last 10 / Career performance stats, UFC opponent graph, or baseline V4 prospect/contender release.

## Avoid 783 × every-source searches

The unit of external research is **a confirmed achievement record**, not a blind full web search for every athlete across every sporting body. Pilot first, measure cost/yield, then scale by source authority and detection signals:

1. **Input identity crosswalk:** approved UFC athlete slug, verified full name plus aliases/diacritics, country, training base and DOB when reliable. UFC identity from Stage 3 remains immutable; never merge on fuzzy name alone.
2. **Source-led bulk discovery:** where rules and access permit, use official documented searchable results/indexes of one governing body or title record at a time. Match against the 783-person crosswalk. Do not bulk republish provider databases.
3. **Lightweight initial scan:** reuse already cached verified UFC biography/credential hints and public sport-specific biographies to identify high-probability leads; dedupe hints so multiple websites quoting the same award create one candidate.
4. **Targeted primary-source confirmation:** search a specific organisation/event **only** for candidates with plausible links. Verify event class, age/belt division, year, award and name identity. Official records preferred over fan pages and social-media claims.
5. **Explicit exception queue:** common-name ambiguity, translated names, old defunct events, missing result lists or contradictory awards go to manual review. Do not endlessly retry generic queries for people with no leads.
6. **Coverage sweep:** after all strong leads, check authoritative rosters/competitive databases for unmatched approved fighters by discipline if permitted; record *sources checked, date and coverage limits*. A failed search means 'not found in the sources checked' not 'no achievement'.
7. **Pilot batches:** first ~25 representative fighters across champions, unranked veterans, recent newcomers, known elite grapplers/wrestlers and women/men's divisions. Compare research time, true-positive yield, ambiguous-name rate and reliable official source coverage. Then consider automated batches of 25–50 athletes; tune only after the pilot.
8. **Incremental update:** keep immutable identity/achievement keys and content-based change detection. Revisit only confirmed changed achievements and periodic stale/ambiguous leads instead of starting all athletes over after each UFC event.

A dedicated research ledger is appropriate; a duplicate paid UFCalendar collector is **not**. Any later scheduled research automation needs explicitly configured permitted discovery/search capability, rate limits, cost, identity QA and concurrent-write protections. The UFC collection pipeline should not invoke this workflow.

## Candidate credential taxonomy and primary verification

| Group | Exact evidence to seek | Primary authority | Use |
|---|---|---|---|
| Olympic / international wrestling | Olympic freestyle/Greco-Roman medals; UWW World medals; continental championships; senior national titles | Olympics; United World Wrestling (https://uww.org); national federations | Strong Wrestling evidence; must distinguish individual placing from participation |
| College / university wrestling | NCAA Division I/II/III individual tournament champion, All-American, participation; NAIA/NJCAA and other national equivalences | NCAA, institutions and governing bodies | Tiered Wrestling; team honours do not equal individual champion |
| Judo | Olympic medals; IJF World senior medals; Grand Slam and continental competition, plus objectively verified dan ranks | International Judo Federation (https://www.ijf.org) | Grappling/Wrestling; rank/training is distinct from competition title |
| Brazilian jiu-jitsu | IBJJF adult black-belt gi/no-gi Worlds, Pan/Europe results and belt rank | IBJJF (https://ibjjf.com) | Grappling; distinguish adult/masters, colours, weight, gi/no-gi |
| Submission grappling | ADCC World medals; ADCC Trials champions; distinct elite no-gi promotion titles | ADCC (https://adcombat.com); event providers | Grappling; do not count Trials entry as Worlds medal |
| Sambo | FIAS senior Combat/Sport Sambo World medals/titles and other graded events | FIAS (https://sambo.sport) | Combat can support multiple dimensions; Sport not automatically striking |
| Boxing | Olympic/World Boxing amateur senior medals, amateur national champions, Golden Gloves achievements, major pro boxing belts | Olympics, World Boxing, national federations, sanctioning bodies | Striking; distinguish amateur senior from junior/local or pro division |
| Kickboxing | GLORY, K-1 senior titleholders, WAKO Worlds medals | Promotion official results; WAKO (https://www.wako.sport) | Striking; note ruleset and level |
| Muay Thai | IFMA senior Worlds medals; Lumpinee/Rajadamnern stadium belts; credible professional world titles | IFMA (https://muaythai.sport); stadium/promotion archives | Striking; separate stadium, amateur, professional categories |
| Amateur MMA | IMMAF senior worlds/continental results (junior separate) | IMMAF (https://immaf.org) | Development/Prospect context; not UFC technical stats |
| Professional MMA | Prior Bellator, PFL, ONE MMA, Rizin, Cage Warriors, LFA, Invicta and other sanctioned title reigns + defences | Promotion original records | Previous MMA achievements and opponent-quality context, NOT UFC titleholder or automatic technical bonus |
| Further targeted sports | Senior elite karate, taekwondo, sanda and comparable recognised competition | World/national federation results | Consider after coverage pilot; no speculative scoring |

Prioritisation focuses on high-confidence primary results and meaningful *senior adult* competition; names, acronyms and medals may not mean the same across competitions.

## Verification ledger design

Keep achievements and attempts separate:

`athlete_id`, `names_checked`, `discipline`, `competition_org`, `competition_title`, `event_date`, `competition_tier`, `ruleset`, `age_level`, `belt_level`, `weight_class`, `placing`, `medal`, `title_reign`, `title_defences`, `primary_source_url`, `secondary_confirmation_url`, `verified_at`, `verification_status`, `unique_achievement_key`.

Track source-check attempts separately: `athlete_id`, `organisation_checked`, `query_or_index`, `checked_at`, `result`, `recheck_after`. Don't mark an athlete `checked-none` for a discipline unless the defined authoritative source coverage actually supports that conclusion; otherwise `not_found_in_checked_sources` or `unknown`.

Allowed evidence statuses: `verified`, `reported`, `disputed`, `identity_ambiguous`, `not_found_in_checked_sources`, `unresearched`. Only `verified` achievements can enter an experimental scoring bonus.

Never accept generic Google result URLs as award verification. Check the precise individual title, participant vs medal, team vs individual, adult/juvenile/master, official event class, source rights and archived evidence. Deduplicate medals/titles from the *same event* and award families. Keep genuine historic achievements even when they predate UFC.

## Scoring separate from verified achievement records

The initial UFCalendar-only V4 model gives **zero external credential adjustment**; it must not count absent credentials as negative evidence.

A *later*, independently tested model may trial fixed skill-specific bonuses, capped to an initial proposed maximum **8 points per skill**. Examples awaiting calibration: NCAA D-I individual champion +6 Wrestling; D-I All-American +4 Wrestling; Olympic judo gold +5 Grappling/+4 Wrestling; IBJJF adult black-belt world title, ADCC World title, GLORY/K-1 and Olympic wrestling medals require their own reviewed tiers. A black belt alone is a much weaker signal than a verified senior elite world title. Regional MMA championships are history/context, not measured UFC technical evidence.

No double credit for the same event or when external awards were already used in a second Prospect/Contender composite. Present achievements on the fighter card using the approved clean badge layout, with full URLs retained in internal evidence ledger rather than disruptive card calculation text.

## Release and research QA

- Do not begin separate mass credential research until UFC Stage 4 baseline is established, without explicit change of sequencing from the owner.
- Pilot 25; review credible matching precision, source coverage, data rights, research cost/time and exception backlog; then advance batches of 25–50 with source-level caching.
- Never block V4 UFC stats on an unresearched award; ratings remain usable without this stream.
- Publish only independently verified badges and a separately approved, recalibrated credential-adjusted scoring version after source, dedupe, responsive visual and live production checks.
- Keep internal notes and source attribution available for auditing; keep public cards clean and avoid unsupported claims.

**Approved sequence:** UFC fight history → UFC-only 5/10/career stats → V4 baseline and leaderboards → independent external achievement research → optional tested enrichment.
