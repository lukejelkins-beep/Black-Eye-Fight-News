# NCAA wrestling credentials research results

24 November 2026 · American and Canadian UFC fighters

**Research only. Nothing here is shown on a page, used in a rating or treated as a certificate.** Wrestling only. Run in-session with research sub-agents (no API spend) and ingested through the credentials validator (`scripts/ufc-credentials-run.mjs --from-dir`): pass 1 `us-ncaa-1` (198 Americans not in the 25-fighter pilot), pass 2 `us-ncaa-2` (26 priority re-checks), unknowns round 1 `us-ncaa-3a` (31 fighters), unknowns round 2 `us-ncaa-3b` (the other 90 American unknowns), Canadians `ca-ncaa-1` (20 fighters).

"Unknown" means not found yet, not checked-and-none: nobody is marked none_found, because that needs an NCAA or governing-body source actually searched.

## Americans: NCAA wrestling verified (22)

Verified = a Tier A record (NCAA results, or the school's own reviewed athletics roster, for team participation only) or two independent Tier B outlets.

| Fighter | Division | Results recorded | Tiers |
|---|---|---|---|
| Andre Petroski | D-I/D-II | on the team | A |
| Cody Brundage | D-II | on the team | A, B |
| Curtis Blaydes | D-I | on the team | A |
| Dan Ige | D-III | on the team | A |
| Ethyn Ewing | D-II | on the team | A, B |
| Gable Steveson | D-I | NCAA finalist, NCAA champion | A, B |
| Jacobe Smith | D-I | on the team, All-American | A, B |
| Josh Hokit | D-I | on the team, All-American | A, B |
| Justin Gaethje | D-I | on the team, All-American | A, B |
| Luis Gurule | D-II | on the team | A |
| Luke Fernandez | D-III | on the team | A, B |
| Mansur Abdul-Malik | D-I | on the team | A |
| Mark Choinski | D-III | on the team, All-American | B |
| Miles Johns | D-II | on the team | A |
| Pat Sabatini | D-I | on the team | A |
| Richie Miranda | D-II | on the team | A |
| Ryan Loder | D-I | All-American | B |
| Terrance McKinney | D-II | on the team | A, B |
| Thomas Gantt | D-I | on the team, All-American | A, B |
| Tim Elliott | D-II | on the team, All-American | A, B |
| Torrez Finney | D-I | on the team | A, B |
| Tyrell Fortune | D-II | on the team, NCAA champion | A, B |

## Americans: NCAA claimed, not yet verified (3)

Dakota Hope, Jim Miller, John Castaneda

## Americans: junior college / NAIA / other wrestling only, not NCAA (16)

Aaron Pico, Alex Perez, Anthony Romero, Austin Vanderford, Bruce Whitehead, Chepe Mariscal, Cody Garbrandt, Denzel Freeman, Jamall Emmers, Josh Emmett, Kai Kamaka III, Kelvin Gastelum, Michael Johnson, Ryan Kuse, Thomas Petersen, Victor Henry

## Americans: high school or youth wrestling only (48)

Alexander Hernandez, Anthony Wint, Austin Bashi, Belal Muhammad, Calvin Kattar, Charles Johnson, Charlie Campbell, Cody Durden, Danny Silva, Dominick Reyes, Donte Johnson, Drakkar Klose, Drew Dober, Edmen Shahbazyan, Elijah Smith, Eric Nolan, Ezra Elliott, Gauge Young, Grant Dawson, Jalin Turner, Jean-Paul Lebosnoyani, Jeremy Stephens, Joaquin Buckley, Joe Pyfer, Jordan Leavitt, Josiah Harrell, King Green, Kody Steele, Kyler Phillips, Mackenzie Stiller, Mario Bautista, Matt Frevola, Mickey Gall, Miesha Tate, Mike Davis, Miranda Maverick, Mitch Raposo, Montel Jackson, Nate Landwehr, Neil Magny, Nick Klein, Punahele Soriano, RJ Harris, Ricky Simon, Rose Namajunas, Steven Nguyen, Tommy McMillen, Ty Miller

## Americans: still unknown (109)

Round 1 of the unknowns (31 fighters: UFC.com bio, Wikipedia and one search each) found no NCAA wrestler, so the owner stopped the sweep there (24 Nov).

Round 2 (`us-ncaa-3b`, 24 Nov) re-checked the other 90 American unknowns, looking for the fighter's college and that school's wrestling roster rather than repeating round 1 (at most 2 searches per fighter, 3 agents at a time). Result: one NCAA wrestler, Ethyn Ewing (King University, Division II, 2016-17 roster at 149 lb as a redshirt). His record rests on the King roster page (Tier A since the owner approved adding kingtornado.com to the reviewed hosts, 24 Nov) and his UFC.com bio, which says he wrestled one year at King. Seven moved to high school only (claimed, single source): Jeremy Stephens, Mackenzie Stiller, Miranda Maverick, Mitch Raposo, Nate Landwehr, Rose Namajunas, Ty Miller. The other 82 stay unknown. Most have no college, a non-wrestling college sport (for example football, basketball, softball, swimming, track) or a school with no varsity wrestling. They stay unknown rather than none_found because no NCAA database page was opened for them. Same-name college wrestlers were ruled out for Christian Edwards (UNC Pembroke) and Charles Radtke (a Caleb Radtke at UW-Platteville). Three leads were followed up (`us-ncaa-3c`, owner-approved, 24 Nov), and none changed a status. Marcus McGhee: no Glendale Community College (Arizona) wrestling roster names him; Arizona community colleges had no NJCAA wrestling, and Glendale's club was in the NCWA club league. Tre-ston Vines: the state-title Vines wrestled for Thompson High School in Alabaster, a different, younger person, and nothing names Tre-ston. Mitch Raposo: no MIAA or local result names him, so his high school title stays self-reported (claimed). The MIAA champions history list on miaa.net was not opened. Alik Lorenz (Northern Iowa graduate) is not on any UNI wrestling roster 2014-15 to 2017-18.

## Canadians (20): NCAA 0 verified, 0 claimed

Other wrestling (provincial / national, from their UFC profiles only): Aiemann Zahabi, Jasmine Jasudavicius. High school only: Kyle Prepolec, Lance Gibson Jr.. Unknown: 16. Canadian university wrestling (U SPORTS) and Canadian titles are recorded as "other", never as NCAA.

## Reviewed official athletics hosts

A college roster counts as Tier A for team participation only when its host is in [`_school-athletics-hosts.json`](_school-athletics-hosts.json): 21 hosts, each homepage checked 24 Nov. King University was added with the owner's approval. Fresno State (gobulldogs.com) and Chattanooga (gomocs.com) were added in the overnight run, because each homepage title names it as the school's official athletics website. That raised the roster claims of Josh Hokit and Torrez Finney to Tier A. No host is pending.
