# NCAA wrestling credentials: American UFC fighters, pass 1 (research, 24 Nov 2026)

**Research only. Nothing here is shown on a page, used in a rating or treated as a certificate.** Pass 1 covered the 198 American profile fighters (flags file) not in the 25-fighter pilot, wrestling only, run in-session with research sub-agents (no API spend) and ingested through the credentials validator (`scripts/ufc-credentials-run.mjs --from-dir`, run `us-ncaa-1`).

**Coverage is thin.** The session's shared web-search budget ran out partway through every batch, so many fighters got one search. "Unknown" therefore means *not found yet*, not *checked and none*: no fighter is marked none_found. A second pass is planned for the fighters listed at the end.

## NCAA wrestling verified (12)

Verified = a Tier A record (NCAA results, or the school's own reviewed athletics roster for team participation only) or two independent Tier B outlets.

| Fighter | Division | Results recorded | Tiers | Flags |
|---|---|---|---|---|
| Andre Petroski | D-I/D-II | on the team | A | thin_sources |
| Curtis Blaydes | D-I | on the team | B | - |
| Dan Ige | D-III | on the team | A | thin_sources |
| Gable Steveson | D-I | NCAA finalist, NCAA champion | A, B | thin_sources |
| Justin Gaethje | D-I | on the team, All-American | A, B | thin_sources |
| Mansur Abdul-Malik | D-I | on the team | A | - |
| Miles Johns | D-II | on the team | A | thin_sources |
| Pat Sabatini | D-I | on the team | A | - |
| Richie Miranda | D-II | on the team | A | thin_sources |
| Ryan Loder | D-I | All-American | B | thin_sources |
| Terrance McKinney | D-II | on the team | A, B | - |
| Tyrell Fortune | D-II | on the team, NCAA champion | B | conflict |

## NCAA wrestling claimed, not yet verified (12)

| Fighter | Division | Results recorded | Tiers | Flags |
|---|---|---|---|---|
| Bruce Whitehead | D-III | on the team | C | thin_sources |
| Cody Brundage | D-II | on the team | B, C | thin_sources |
| Dakota Hope | D-II | on the team | C | thin_sources |
| Jacobe Smith | D-I | on the team, All-American | A, B | thin_sources |
| Jim Miller | D-I | on the team | C | thin_sources, needs_escalation |
| John Castaneda | D-II | on the team | C | thin_sources |
| Josh Hokit | D-I | on the team, All-American | C | thin_sources, needs_escalation |
| Luis Gurule | D-II | on the team | C | thin_sources |
| Luke Fernandez | D-III | on the team | B | thin_sources |
| Mark Choinski | D-III | on the team, All-American | B, C | thin_sources |
| Tim Elliott | D-II | All-American | C | thin_sources, needs_escalation |
| Torrez Finney | D-I | on the team | B | thin_sources |

## Junior college (NJCAA / California JC) or NAIA only, not NCAA (11)

Alex Perez, Austin Vanderford, Chepe Mariscal, Denzel Freeman, Jamall Emmers, Josh Emmett, Kai Kamaka III, Kelvin Gastelum, Michael Johnson, Ryan Kuse, Thomas Petersen

## High school wrestling only found (33)

Aaron Pico, Anthony Wint, Austin Bashi, Belal Muhammad, Calvin Kattar, Cody Durden, Dominick Reyes, Donte Johnson, Drakkar Klose, Drew Dober, Edmen Shahbazyan, Elijah Smith, Ezra Elliott, Grant Dawson, Jalin Turner, Jean-Paul Lebosnoyani, Joaquin Buckley, Joe Pyfer, Jordan Leavitt, King Green, Kody Steele, Kyler Phillips, Matt Frevola, Mickey Gall, Miesha Tate, Mike Davis, Montel Jackson, Nick Klein, Punahele Soriano, Ricky Simon, RJ Harris, Steven Nguyen, Tommy McMillen

## Second pass (24 priority + unknowns)

Priority: every NCAA claim not yet verified (find the school roster or NCAA bracket), and every fighter flagged needs_escalation: Alexander Hernandez, Austin Bashi, Austin Vanderford, Bassil Hafez, Bruce Whitehead, Charles Johnson, Cody Brundage, Cody Garbrandt, Dakota Hope, Donte Johnson, Jacobe Smith, Jean-Paul Lebosnoyani, Jim Miller, John Castaneda, Josh Hokit, Josiah Harrell, Luis Gurule, Luke Fernandez, Mark Choinski, Michael Johnson, Neil Magny, Thomas Gantt, Tim Elliott, Torrez Finney.

Then the 128 fighters still unknown, a few agents at a time so the search budget lasts. Also: confirm `anthony-romero-3` is the American fighter (the page found was a Canadian debutant); review niuhuskies.com (Northern Illinois) and gculopes.com (Grand Canyon) as official athletics hosts (blocked automated checks on 24 Nov); Tyrell Fortune's NJCAA title years conflict (2010/2011 vs 2009/2011).
