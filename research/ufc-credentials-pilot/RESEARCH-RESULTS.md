# UFC credentials pilot report, 22 Nov 2026

Research only. 25 approved-roster fighters, files now in `research/ufc-credentials-pilot/` (moved from `data/ufc-credentials/` on 24 Nov 2026). Not wired into any page, rating or certificate.

## How it was run (differs from the plan)
No paid API call was made. On the owner's instruction (to stay on the Claude plan, no extra spend) the research was done by Claude Code subagents with web search, then put through the same runner and validator (`--from-dir`). So:
- **Models:** pass 1 Sonnet, passes 2 and 3 Opus, as planned. Effort levels (medium, high) could not be set per call, and model version labels are the subagent tiers, not pinned `claude-sonnet-5-5` / `claude-opus-5-5` calls.
- **Counts:** no token counts or dollar cost exist. Run logs show fighters per pass only. The 1-per-fighter call design, parallel workers, checkpoints and resume were exercised on the ingest side only.
- **Pass 1:** all 25 fighters. **Pass 2:** 15, not "every flagged": every file carries `thin_sources`, so I escalated the 14 flagged `conflict` or `needs_escalation` plus Kayla Harrison (her sources were search snippets only). **Pass 3:** 6 fighters = seeded 7.5% sample (2: Bryce Mitchell, Kayla Harrison) plus every fighter with a Tier A claim (Islam Makhachev, Mackenzie Dern, Merab Dvalishvili, Valentina Shevchenko, Kayla Harrison). 25 claims audited: 24 confirmed, 1 partial, 0 refuted, 0 unreachable.

## Result (175 discipline slots)
Status: verified 24, claimed 33, none_found 1, unknown 117. Claims by tier: A 20, B 101, C 33. Flags: thin_sources 22, conflict 5, needs_escalation 1, identity_unclear 0.

Legend: V verified, c claimed, - none_found, ? unknown; letter = best claim tier in that discipline.

| fighter | wrestling | grappling | judo | kickboxing | boxing | bjj | sambo | flags | passes |
|---|---|---|---|---|---|---|---|---|---|
| alex-pereira | ? | ? | cC | VB | cC | cB | ? | conflict, thin_sources | 1+2 |
| aljamain-sterling | VB | ? | ? | ? | ? | cB | ? | thin_sources | 1 |
| bo-nickal | VB | cB | ? | ? | ? | cC | ? | thin_sources | 1+2 |
| bryce-mitchell | cC | cC | ? | ? | ? | cC | ? | thin_sources | 1+3+3 |
| charles-oliveira | ? | ? | ? | VB | ? | VB | ? | thin_sources | 1+2 |
| dustin-poirier | ? | ? | ? | ? | ? | VB | ? | thin_sources | 1 |
| islam-makhachev | cC | ? | cC | ? | ? | ? | VA | thin_sources | 1+3+3 |
| israel-adesanya | ? | ? | ? | VB | VB | cB | ? | conflict | 1+2 |
| kayla-harrison | ? | ? | VA | ? | ? | ? | ? | needs_escalation | 1+2+3+3 |
| khamzat-chimaev | VB | ? | ? | ? | ? | cB | ? | conflict, thin_sources | 1+2 |
| mackenzie-dern | ? | VA | ? | ? | ? | VA | ? | none | 1+2+3+3 |
| magomed-ankalaev | cB | ? | ? | ? | ? | ? | cB | thin_sources | 1 |
| merab-dvalishvili | cC | cC | cC | ? | ? | cC | VA | thin_sources | 1+3+3 |
| michael-chandler | VB | ? | ? | ? | ? | cC | ? | thin_sources | 1+2 |
| movsar-evloev | VB | ? | ? | ? | ? | ? | ? | thin_sources | 1 |
| paddy-pimblett | ? | ? | ? | ? | ? | cB | ? | thin_sources | 1+2 |
| petr-yan | ? | ? | ? | ? | VB | cC | VB | conflict, thin_sources | 1+2 |
| raul-rosas-jr | cC | cB | ? | ? | ? | cB | ? | thin_sources | 1+2 |
| sean-strickland | ? | ? | ? | ? | - | cB | ? | thin_sources | 1+2 |
| shavkat-rakhmonov | ? | ? | ? | ? | ? | ? | cB | thin_sources | 1 |
| stephen-thompson | ? | ? | ? | VB | ? | cB | ? | thin_sources | 1 |
| tatiana-suarez | VB | ? | ? | ? | ? | cB | ? | thin_sources | 1 |
| tom-aspinall | ? | ? | ? | ? | VB | cB | ? | thin_sources | 1+2 |
| umar-nurmagomedov | cB | ? | ? | cC | ? | ? | VB | thin_sources | 1+2 |
| valentina-shevchenko | ? | ? | cB | VA | VB | ? | ? | conflict, thin_sources | 1+2+3+3 |

## What the pilot showed
- **Pass 1 was shallow and sometimes wrong.** Most researchers read only the UFC page, Wikipedia and Sherdog. Pass 2 corrected real errors: Bo Nickal's first NCAA title year (2016 was a runner-up finish; titles were 2017-19), Valentina Shevchenko's boxing and judo "titles" (her sources show a runner-up finish and a youth-event result), Khamzat Chimaev's judo and sambo claims (cited pages did not say it), Charles Oliveira's unsupported fourth-degree belt, Kayla Harrison's age at promotion.
- **`none_found` was overused.** 46 of 175 slots said none_found but only 1 had searched a governing-body or database page (the rest used the UFC page, Wikipedia or Boxerbook). The validator now requires a dated search of a Tier A authority URL; 45 became `unknown`. This is why `unknown` is 117.
- **Blocked sources.** BoxRec, BJJ Heroes, ADCC, Tapology returned 403 and JudoInside looped. Tier A coverage is therefore thin outside IBJJF, IFMA, Olympedia and the JudoInside records that did load. Browser-pane fetching may reach more.
- **Two-Tier-B "verified" is weak.** Several `verified` rest on two outlets repeating the fighter's own account (for example Movsar Evloev wrestling, Dustin Poirier boxing). Consider requiring Tier A, or two outlets that are independent.
- **Pass 3 found little because it audited little:** it checked Tier A claims, which were mostly sound. Pass-1 style errors were in Tier B and C claims it did not sample.

## Precision against the owner's known answers
Not computed: no answer key was supplied. Check the table above; the five claims I would look at first are the `V` cells with only Tier B (Bo Nickal, Aljamain Sterling, Michael Chandler, Tatiana Suarez, Movsar Evloev wrestling) and the Tier A-backed ones (Kayla Harrison judo, Mackenzie Dern bjj and grappling, Islam Makhachev sambo, Merab Dvalishvili sambo, Valentina Shevchenko kickboxing).

## Not verified
Everything here is model output checked only by the validator rules and, for 25 claims, one auditing pass. No claim was checked by a human. Identity for common names was confirmed against the UFC page by the researchers, not independently. The live API path in `ufc-credentials-run.mjs` remains untested.
