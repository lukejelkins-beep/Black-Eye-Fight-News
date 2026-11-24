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

The three lanes overlap. **78 distinct fighters** have evidence files, with **158 sourced claims** across the folder. Each file identifies the sport, edition, delegation, event and source. An athlete can have a verified result while other parts of their competitive history remain open.

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

## IJF judo data screen (24 Nov)

The ijf.org event pages load their results by script, so earlier page screens saw no judo names. The same results are published as data by the IJF (data.ijf.org). Entrant lists for 131 Olympic Games, senior World Championships and Grand Slams from 2005 to 2026 were screened for all 921 names, with each entrant's place.
- Added from that data:
  - Javad Mahjoub: 2013 World Championships (Iran, lost first contest) and 2013 Moscow Grand Slam gold.
  - Iwo Baraniewski: 2019 senior World Championships (Poland, lost first contest).
  - Dione Barbosa: 2012 Rio Grand Slam bronze.
- Kayla Harrison's IJF placings match her existing record.
- Unresolved (`needs_review`): Da Woon Jung and Stephanie Egger. Same name, country and sport, but the data hides birth dates, so identity is open.
- Ruled out by weight or person: a Slovenian judoka Nina Milosevic (the UFC fighter is the Swedish-Serbian Nina Nikolija Milošević) and a Brazilian over-100 kg Gabriel Santos (the UFC fighter is a featherweight).

## Coverage remaining

The [921-row ledger](screening/roster-pass-2026-11-24.json) records the result of this pass for every fighter in each lane. **This completes the roster-wide screen of the listed sources.** Full individual credential histories across all three lanes remain open. “No verified claim in this pass” means the searches and source coverage described here did not produce a claim we could substantiate.

Coverage gaps include alternate or native-script names that did not match, Olympic trials and selectors without searchable records, Commonwealth Games before 2014, Commonwealth Youth Games, some Commonwealth non-combat sports, and national-team sources outside the countries, events, age groups and seasons inspected. Several public federation entry pages returned navigation without a usable full athlete list. The files preserve verified positives and the pending queue for those gaps. Run `node research/ufc-representative-credentials/check.mjs 01` from the repository root for the pending lane list in batch 01. 

## Overnight research run (24-25 Nov)

Owner-approved overnight run. Official results were screened with free local scripts, then strong matches were checked against the UFC bio and the source page before recording. Sources are used only where their terms don't forbid automated collection and robots.txt allows it. IJF, UWW and IBJJF forbid automated collection; IFMA and WKF block Anthropic bots. Their pages were read only one at a time to confirm a specific fighter.

**Added (14 fighter files; 17 new claims, plus 2 unresolved leads):**

| Fighter | Event | Result | Source |
|---|---|---|---|
| Ihor Potieria | 2017 FIAS World Sambo Championships (Sochi), combat 100 kg, UKR | Bronze | FIAS results page |
| Seokhyeon Ko | 2017 FIAS World Sambo Championships (Sochi), combat 82 kg, KOR | Gold | FIAS results page |
| Imanol Rodriguez | 2023 FIAS Pan American Championships, sambo 58 kg and combat 58 kg, MEX | Two golds | FIAS results data |
| Ateba Gautier | 2024 FIAS African Championships, combat 88 kg, CMR | Silver | FIAS results data |
| Yaroslav Amosov | WCSF Worlds 2014 (82 kg) and 2015 (90 kg); ECSF Europeans 2014 (82 kg, gold) and 2012 (82 kg, bronze), UKR | Two world golds | ECSF pages (Wayback copies) |
| Ion Cutelaba | 2012 ECSF European Combat Sambo Championship, +90 kg, MDA | Gold | ECSF page (Wayback copy) |
| Ikram Aliskerov | 2012 ECSF European Combat Sambo Championship, 82 kg, RUS | Gold (added to his record) | ECSF page (Wayback copy) |
| Josefine Knutsson | 2018 IFMA World Championships (Cancún), women's −51 kg, SWE | Gold | IFMA Live profile |
| Armen Petrosyan | IFMA Royal World Cup 2015 (Bangkok), −86 kg, RUS | Gold | IFMA results document |
| Shauna Bannon | 2017 World Taekwondo Championships, IRL | Competed | World Taekwondo results |
| Robelis Despaigne | 2013 and 2017 World Taekwondo Championships, CUB | Competed (added to his record) | World Taekwondo results |
| Brando Peričić | 2019 WAKO World Championships (Sarajevo), K1 +91 kg, AUS | Named in the entry list (`team_selected`) | WAKO official report book |
| Lawrence Lui | 2019 IMMAF Oceania Championships | `needs_review` (bout listing only) | IMMAF sitemap |
| Otari Tanzilovi | 2019 IMMAF European Championships | `needs_review` (bout listing only) | IMMAF sitemap |

WCSF/ECSF is a combat sambo body separate from FIAS, and the records say so.

**Ruled out:**
- Julian Marquez: a USA 58 kg sambo entrant (the UFC fighter is a middleweight).
- Juan Carlos Diaz: a Venezuelan taekwondo heavyweight.
- Natalia Silva: Athens 2004 taekwondo entrant (the UFC fighter was a child then).
- Gabriel Santos: taekwondo, kickboxing and judo entries with no link.
- David Martinez: a 94 kg kickboxer.
- Yair Rodriguez: a 2023 WAKO entrant of the same name.
- Several juniors and cadets with the same names.

**Checked, not recorded:**
- Supported only by news or databases:
  - Mason Jones: now recorded (see the 25 Nov browser pass below)
  - Puja Tomar (World Wushu, edition unknown)
  - Tofiq Musayev (sanda title, body unknown)
  - Giga Chikadze (2008 karate world title, style body)
  - Diana Belbita (2012 WAKO World Cup, open event)
  - Shanelle Dyer (2013 youth title)
  - Irina Alekseeva (2017 FIAS European silver, identity open)
  - Marcin Prachnio: now recorded (see the 25 Nov browser pass below)
  - Rei Tsuruya: now recorded (see the 25 Nov browser pass below)
- Pro or other-body titles: Joanne Wood, Istela Nunes, Tainara Lisboa, Viacheslav Borshchev.
- Not found: Satybaldiev, Ketlen Souza, Santiago Luna, Daniel Barez, William Gomis, Uros Medić, Bruna Brasil, Muin Gafurov, Nurullo Aliev, Daria Zhelezniakova, Norma Dumont, Kai Kara-France.

## Browser pass on unrecorded leads (25 Nov 2026)

Four leads from the overnight run were checked by hand in a browser, one page at a time.

| Fighter | Result | Status | Source |
|---|---|---|---|
| Mason Jones | 2012 Commonwealth Judo Championships (Cardiff), men's -60 kg, Wales | Bronze, `seed` | Official medal winners list (EJU / Fighting Films); JudoInside agrees |
| Rei Tsuruya | 2019 Cadet World Wrestling Championships (Sofia), Greco-Roman 55 kg, JPN | Competed, 21st, `seed` | UWW athlete page |
| Marcin Prachnio | 2012 IKO European Weight Category Championships (Budapest), +90 kg, POL | Silver, `seed` | IKO official results (listed as "Marchin Prachino"); a 2011 -90 kg bronze is in the almanac only |
| Stephanie Egger | 2010 European U23 Judo Championships (Sarajevo), women's -70 kg, SUI | Gold per JudoInside; not recorded here | Her record is in PR #503. JudoInside's event results and the NZZ report agree. EJU's own results page is still missing (404) |

The Commonwealth Judo Championships are a domestic championship, not the Commonwealth Games, so Jones's medal is in the national lane.

