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

## Wide judo and wrestling screens (25 Nov 2026)

The owner has permission from the IJF and UWW (25 Nov). The runner's wide screens covered 556 IJF competitions from 2005 to 2026 (Olympics, Worlds at every age, Grand Slams, Grand Prix, continental championships and opens) and 220 UWW result books from 2014 to 2026 (senior, U23, U20 and U17 Worlds, continental championships and World Cups). Matches were checked against each fighter's UFC profile before recording.

| Fighter | New evidence | Status |
|---|---|---|
| Luana Pinheiro | 2013 IJF Grand Prix Qingdao, women's -52 kg, BRA, 7th | `seed` |
| Alexander Romanov | 2018, 2020 and 2023 European Championships, and 2019 Worlds, freestyle 125 kg, MDA (8th to 12th); 2014 World University Championships, 5th; 2021 Olympic qualifier, 12th | `seed` (national and Olympic qualifier) |
| Gable Steveson | 2015 and 2016 Cadet World champion (100 kg); 2017 Junior World champion (120 kg); 2018 Junior Worlds, 8th; 2021 Pan-American champion (125 kg), USA | added to his record |
| Pavel Andrusca | 2021 U20 European bronze (61 kg), his second, as his UFC bio says; 2021 and 2022 U20 Worlds; 2022 U23 Europeans, MDA | added to his record |
| Muhammad Mokaev | 2018 Junior Europeans (12th) and 2021 U23 Worlds (9th), freestyle 61 kg, GBR | added to his record |
| Thomas Gantt | "Thomas Gantt Jr" (USA), 2021 Pan-American champion at 79 kg and 2019 World Cup team | `needs_review` (identity) |

**Already recorded:** Kayla Harrison, Aaron Pico, Rinya Nakamura, Tyrell Fortune, Rei Tsuruya, Javad Mahjoub, Dione Barbosa, Iwo Baraniewski and Stephanie Egger.

**Ruled out (same names):** Jesse Butler (a -81 to -100 kg judoka still competing in 2025; the UFC fighter is a bantamweight), Javier Reyes (Ecuadorian judoka; the UFC fighter is Colombian), José Henrique (the match was a Cuban "Jose Souza"), Gabriel Santos (+100 kg judoka), and wrestlers Alex Pérez Cimarra (ESP), Charles Johnson Calawen (PHI), Esteban David Martínez (COL), Daniel Felipe dos Santos (BRA, 2026), Julia da Silva Joaquim, Lázaro Daniel Hernández Luis (CUB), Jodalys Santiago Luna (PUR) and Manuel Torres (VEN).

**Unresolved:** Daniel Santos (a BRA -66 kg judoka who medalled at 2013-14 Pan-American Opens; the UFC fighter is a Brazilian featherweight, but nothing links them), Irina Alekseeva (RUS U17 wrestling 2015-16; identity open), José Daniel Medina (ARG U20 wrestling 2014) and Luana Santos (a 40 kg U17 Pan-American entry in 2014).
