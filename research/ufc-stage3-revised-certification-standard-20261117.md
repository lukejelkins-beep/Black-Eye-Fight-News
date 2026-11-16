# BEFN UFC Stage 3 — revised certification standard (owner-approved)

Date: 2026-11-17. Research-only, existing draft PR #207. This policy supersedes conflicting stricter source crosswalk requirements; it does **not** itself change executable validators or grant certifications.

## Eligibility and completeness

- Freeze the existing approved **783 distinct UFC fighters**; no additions, deletions, substitutions or alias duplicates.
- Certify only after each fighter's **complete official UFC career** is represented with correct fighter identity, opponent, event/date (documented timezone differences allowed), and final outcome (win/loss/draw/no-contest).
- Include official UFC contests, including TUF finals where applicable; exclude cancelled bouts, DWCS and Road-to-UFC qualifiers unless independently established as official UFC contests. Preserve draws, no-contests and rematches.
- Verify fight chronology and outcome against available official UFC listings or sufficiently reliable corroborated sources. A discrepancy between a 20-row provider history and 21 confirmed official contests cannot be silently waived; reconcile/add the missing official fight to the profile history or explicitly identify why it is represented elsewhere.

## UFCalendar-first statistical policy

- Accept **UFCalendar as the authoritative source of per-round statistical values**; no UFCStats, Greco or other numerical cross-verification required.
- **Original numeric native bout IDs, original corner IDs and original UFCStats/Greco fight-detail URL crosswalks are not required**. Match records by normalized fighter, opponent, event/date and final outcome, accounting for rematches.
- Missing individual round metrics are allowed and labelled **unavailable**, never imputed, fabricated, or represented as measured. A missing optional metric is not a career certification blocker when official fight chronology is complete.
- Retrieval flags (`roundDone`) are not statistical values; only use actual available UFCalendar data for calculations. Avoid dividing by unavailable denominators.

## Executable certification process

1. First reconcile latest successful exact-commit full-cohort audit, canonical evidence, PR #207 branch head and active work; deduplicate work across chats and scheduled tasks.
2. Update **the existing Stage 3 validator** and tests on the research branch to implement this standard. Preserve immutable cohort checks, identity/outcome/date checks, duplicate/feeder/cancelled safeguards, and fail-closed behaviour for genuinely missing UFC fights. Do not simply mark exceptions as certified.
3. Classify remaining fighters by blocker and batch easiest eligible cases. For each, reconcile official UFC chronology against cached UFCalendar profile, update canonical register **in place**, and add focused regression/mutation tests.
4. Run all relevant tests, then **successful full-cohort Stage 3 audit on the exact committed SHA**. Only count newly certified fighters after that audit; if GitHub CI is unavailable, report validated research and pending audit without increasing the certified total.
5. Record auditable checkpoint (SHA, audit URL, passed tests, certified/remaining, changed fighters, unresolved blockers, next queue) in PR #207; keep one central chat/workstream. Continue batches until limits are reached.

## Scope and controls

- Use connected GitHub and ordinary ChatGPT only. No Work, Codex, TinyFish, additional agents, paid APIs or new automations without separate authorisation.
- Existing research branch and draft PR #207 only. No merges to main, production deployment, or roster changes.
- Historical checkpoint **651/783 certified, 132 exceptions, zero ordinary fast-lane** at Wave94 audit https://github.com/lukejelkins-beep/Black-Eye-Fight-News/actions/runs/43855634441 (SHA `793c28517137320b4d7aad3a323a9d8404db036a`) is a reference only; never override a newer successful audit.

## Paul Craig specific

Official UFC career baseline: **21 contests (9 wins, 10 losses, one draw, one no-contest)**. The 20-row cached history count must be reconciled to the complete 21-bout chronology, but missing original numeric ID crosswalks or third-party disagreement on round statistics must not block certification. After validator updates and complete career representation, include him in the next eligible batch and audit.
