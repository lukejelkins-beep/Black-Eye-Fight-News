# UFC certification exceptions: the 31 with confirmed missing history (research, 23 November 2026)

**Research only. No certificate, lane, count, stats file or register entry is changed by this note.** It reads the 36 certification exceptions from the offline Stage 3 queue on `main` (747 certified, 0 fast lane, 36 exceptions) and compares the 31 flagged `source_confirmed_missing_history` with the free UFCStats round-by-round export (`ufc_fight_results.csv` and `ufc_event_details.csv` from the Greco1899/scrape_ufc_stats export, the same free source the tape builder uses). Matching: same fighter and opponent, date within a day.

## Result
- **30 of the 31 missing bouts across 28 fighters are no-contests** (UFCStats outcome `NC`: "Overturned" or "Could Not Continue"). The stats build drops a bout with no recorded result, so none of them is in BEFN's fight history. This is the same cause as the 17 certified fighters fixed in #427; those were carried from the certificates because the register lists their no-contests, but these 28 fighters have no register entry.
- **One more is not a missing bout:** Yair Rodriguez v Patricio Freire (UFC 314, win) is in BEFN under the alias "Patricio Pitbull". With that alias his only missing bout is a no-contest (v Jeremy Stephens, 2019).
- **Three fighters have no difference at all** with UFCStats: Zhu Kangjie (1 fight), Rei Tsuruya (4) and Yizha (4). Their exceptions are about Road to UFC and feeder-series scope, which the queue code keeps deferred (identity and event-scope questions, not missing fights).
- **No fighter has more than two missing bouts** (Dan Argueta and Pedro Munhoz have two no-contests each). BEFN has no bout that UFCStats lacks, apart from the Freire alias.

## Per fighter

| Fighter | BEFN fights | UFCStats fights | What BEFN lacks |
|---|---:|---:|---|
| Zhu Kangjie | 1 | 1 | nothing (scope or identity case) |
| Dan Argueta | 4 | 6 | 2023-09-23 v Miles Johns (no-contest, ufc fight night: fiziev vs. gamrot); 2023-06-17 v Ronnie Lawrence (no-contest, ufc fight night: vettori vs. cannonier) |
| Rei Tsuruya | 4 | 4 | nothing (scope or identity case) |
| Yizha | 4 | 4 | nothing (scope or identity case) |
| Victor Henry | 6 | 7 | 2023-10-21 v Javid Basharat (no-contest, ufc 294: makhachev vs. volkanovski 2) |
| Édgar Cháirez | 7 | 8 | 2023-09-16 v Daniel Lacerda (no-contest, noche ufc: grasso vs. shevchenko 2) |
| Mason Jones | 7 | 8 | 2021-06-05 v Alan Patrick (no-contest, ufc fight night: rozenstruik vs. sakai) |
| Roosevelt Roberts | 9 | 10 | 2020-09-12 v Kevin Croom (no-contest, ufc fight night: waterson vs. hill) |
| Jamahal Hill | 10 | 11 | 2020-05-30 v Klidson Abreu (no-contest, ufc fight night: woodley vs. burns) |
| Nassourdine Imavov | 11 | 12 | 2023-06-10 v Chris Curtis (no-contest, ufc 289: nunes vs. aldana) |
| Brian Ortega | 14 | 15 | 2014-07-26 v Mike de la Torre (no-contest, ufc on fox: lawler vs brown) |
| Daniel Pineda | 13 | 14 | 2021-06-26 v Andre Fili (no-contest, ufc fight night: gane vs. volkov) |
| Kyung Ho Kang | 13 | 14 | 2013-03-02 v Alex Caceres (no-contest, ufc on fuel tv: silva vs. stann) |
| Nicolas Dalby | 14 | 15 | 2020-07-25 v Jesse Ronson (no-contest, ufc fight night: whittaker vs. till) |
| Yair Rodriguez | 15 | 16 | 2025-04-12 v Patricio Freire (W); 2019-09-21 v Jeremy Stephens (no-contest, ufc fight night: rodriguez vs. stephens) (the win is in BEFN as "Patricio Pitbull") |
| Jared Gordon | 18 | 19 | 2023-04-22 v King Green (no-contest, ufc fight night: pavlovich vs. blaydes) |
| Eryk Anders | 19 | 20 | 2021-03-13 v Darren Stewart (no-contest, ufc fight night: edwards vs. muhammad) |
| Pedro Munhoz | 20 | 22 | 2022-07-02 v Sean O'Malley (no-contest, ufc 276: adesanya vs. cannonier); 2014-10-04 v Jerrod Sanders (no-contest, ufc fight night: macdonald vs saffiedine) |
| Rani Yahya | 20 | 21 | 2014-04-11 v Johnny Bedford (no-contest, ufc fight night: minotauro vs nelson) |
| Curtis Blaydes | 21 | 22 | 2017-02-04 v Adam Milstead (no-contest, ufc fight night: bermudez vs. the korean zombie) |
| Alex Morono | 23 | 24 | 2017-02-04 v Niko Price (no-contest, ufc fight night: bermudez vs. the korean zombie) |
| Jon Jones | 23 | 24 | 2017-07-29 v Daniel Cormier (no-contest, ufc 214: cormier vs. jones 2) |
| Andre Fili | 27 | 28 | 2021-06-26 v Daniel Pineda (no-contest, ufc fight night: gane vs. volkov) |
| Drew Dober | 27 | 28 | 2015-03-21 v Leandro Silva (no-contest, ufc fight night: maia vs laflare) |
| Alex Caceres | 29 | 30 | 2013-03-02 v Kyung Ho Kang (no-contest, ufc on fuel tv: silva vs. stann) |
| Tim Means | 29 | 30 | 2016-12-30 v Alex Oliveira (no-contest, ufc 207: nunes vs. rousey) |
| Dustin Poirier | 31 | 32 | 2017-05-13 v Eddie Alvarez (no-contest, ufc 211: miocic vs. dos santos) |
| King Green | 31 | 32 | 2023-04-22 v Jared Gordon (no-contest, ufc fight night: pavlovich vs. blaydes) |
| Jeremy Stephens | 35 | 36 | 2019-09-21 v Yair Rodriguez (no-contest, ufc fight night: rodriguez vs. stephens) |
| Charles Oliveira | 36 | 37 | 2011-06-26 v Nik Lentz (no-contest, ufc live: kongo vs barry) |
| Jim Miller | 47 | 48 | 2013-04-27 v Pat Healy (no-contest, ufc 159: jones vs sonnen) |

## What this means for certification

Each of these 28 careers looks one or two no-contests away from matching UFCStats. That is **evidence, not a certificate**. Under AGENTS.md a career is certified only by the independent register plus a passing strict Stage 3 audit, with source-linked bouts for the whole career. Turning these into certified careers would mean writing register entries (UFCStats fight links, with the no-contests as official bouts) for each fighter and running the audit, which is research-lane work with its own owner rules (check the queue and open PRs first, one researcher per fighter).

## What this does not change

The 36 exceptions, the 783 cohort and every lane are as before. Two further notes found while reading the queue: `bruno-silva` and `hyunsung-park` in the exceptions are the collector's slugs for two fighters already certified under `bruno-gustavo-da-silva` and `park-hyun-sung`, so the 783 slugs hold 781 distinct people; and `waldo-cortes-acosta-2` (15 fights) is an exception with no certificate while `waldo-cortes-acosta` is not in the cohort.

Reproduce: run the two Stage 3 steps CI runs (`node scripts/ufc-36-month-stage3-progress.mjs`, then `node scripts/ufc-v4-certification-queue.mjs`), download the two CSV files, and compare each exception's stats file with the export.
