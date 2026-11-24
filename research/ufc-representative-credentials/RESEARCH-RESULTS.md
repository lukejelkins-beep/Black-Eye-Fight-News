# Representative credentials research results

24 November 2026 · Pinned cohort of 921 certified UFC fighters

## Findings

| Category | Verified athletes | What the count means |
| --- | ---: | --- |
| Senior Olympic Games | 6 | Four medallists and five senior medals. |
| Other Olympic credentials only | 6 | Trials or qualifying evidence filed separately from Games participation. |
| Commonwealth Games | 1 | Michelle Montague competed for New Zealand. Her earlier selection and withdrawal are separately documented. |
| Commonwealth selection without a start | 1 | Robert Whittaker was selected for Australia and withdrew. |
| National teams | 74 | 73 verified competitors and one verified squad member without an event start in the reviewed evidence. Senior, youth and age-group events are recorded separately. |

The three lanes overlap. **78 distinct fighters** have evidence files, with **154 sourced claims** across the folder. Each file identifies the sport, edition, delegation, event and source. An athlete can have a verified result while other parts of their competitive history remain open.

## Olympic Games

The six senior Olympians are **Henry Cejudo** (gold), **Kayla Harrison** (two golds), **Robelis Despaigne** (bronze), **Gable Steveson** (gold), **Hamdy Abdelwahab** (Rio 2016), and **Javad Mahjoub** (Rio 2016 and Tokyo 2020, including the latter’s mixed team event). Abdelwahab also won Youth Olympic silver, and Mahjoub qualified and withdrew in the London 2012 cycle. The 2008 Beijing Wushu Tournament, where Muslim Salikhov competed for Russia, took place alongside the Games and was outside the Olympic medal programme. [Senior evidence and collisions](screening/senior-olympic-index.md) · [Youth Olympic evidence](screening/youth-olympic-index.md) · [IWUF event history](https://www.iwuf.org/en/competitions/other-iwuf-events/)

Domestic trials and qualifiers are supported for fighters including Aaron Pico, Bo Nickal, Tatiana Suarez, Rinya Nakamura, Kamaru Usman and Tyrell Fortune. Check the named review for the distinction between winning a trial, being eligible for one, and competing in the Games. [Pico](reviews/aaron-pico.json) · [Nickal](reviews/bo-nickal.json) · [Suarez](reviews/tatiana-suarez.json) · [Nakamura](reviews/rinya-nakamura.json) · [Usman](reviews/kamaru-usman.json) · [Fortune](reviews/tyrell-fortune.json)

## Commonwealth Games

Montague finished seventh at Birmingham 2022 in women’s freestyle wrestling at 76 kg. She withdrew after selection for Gold Coast 2018, as did Whittaker in the men’s 97 kg division. Sebastian Szalay’s junior karate gold came at the Commonwealth Karate Championships for Australia and is recorded in the national-team category. [Montague](reviews/michelle-montague.json) · [Whittaker](reviews/robert-whittaker.json) · [Szalay](reviews/sebastian-szalay.json)

## National teams

The records include world and continental events in amateur MMA, wrestling, judo, sambo, kickboxing, Muay Thai, Wushu, taekwondo, karate, grappling and athletics. The governing body’s team or result controls delegation and category. Examples include Wang Cong’s Chinese Sanda golds and world boxing silver, Dione Barbosa’s Brazilian judo bronze, Colby Covington’s Team USA grappling gold, Dricus Du Plessis’ South African junior K-1 gold, and Karl Williams’ U.S. Virgin Islands under-23 sprints. [Wang](reviews/wang-cong.json) · [Barbosa](reviews/dione-barbosa.json) · [Covington](reviews/colby-covington.json) · [Du Plessis](reviews/dricus-du-plessis.json) · [Williams](reviews/karl-williams.json)

## What was searched

- Submitted a name-based discovery query for each of the **921**, using national teams, world championships, Olympic trials, Olympian and Commonwealth Games terms. Returned sources mentioned a normalized version of the fighter’s name for 657. A named result could still be a different person. Search results served as leads and were never sufficient for a verified claim.
- Screened the entire roster against an independent senior Olympic results index from 1984 to 2026, eight Youth Olympic results indexes, the Olympedia MMA crossover directory and selected wrestling trials and qualifying material. The detailed reports record the edition coverage, method and name collisions. [Senior index](screening/senior-olympic-index.md) · [Youth index](screening/youth-olympic-index.md)
- Screened all 921 against 25 official Commonwealth Games documents, covering 7,110 pages after excluding overlaps. The files include all sports at Glasgow 2014 and Gold Coast 2018, combat-sport results at Birmingham 2022, and Glasgow 2026 judo and boxing draws. Draws and final results support different claims. [Commonwealth source ledger](screening/commonwealth-coverage.json)
- Screened the cohort against 28 IMMAF, WMMAA and FIAS sources, plus a second group of federation books covering wrestling, Wushu, Muay Thai, kickboxing and related events. The second group had 24 usable books, including three Games wrestling books. Source URLs, file hashes where available, parsed scope and exclusions are archived. [IMMAF and FIAS coverage](screening/immaf-fias-coverage.json) · [Other federation books](screening/federation-books.json)

## Coverage remaining

The [921-row ledger](screening/roster-pass-2026-11-24.json) records the result of this pass for every fighter in each lane. **This completes the roster-wide screen of the listed sources.** Full individual credential histories across all three lanes remain open. “No verified claim in this pass” means the searches and source coverage described here did not produce a claim we could substantiate.

Coverage gaps include alternate or native-script names that did not match, Olympic trials and selectors without searchable records, Commonwealth Games before 2014, Commonwealth Youth Games, some Commonwealth non-combat sports, and national-team sources outside the countries, events, age groups and seasons inspected. Several public federation entry pages returned navigation without a usable full athlete list. The files preserve verified positives and the pending queue for those gaps. Run `node research/ufc-representative-credentials/check.mjs 01` from the repository root for the pending lane list in batch 01. 
