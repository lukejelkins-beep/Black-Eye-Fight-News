# Decisions (newest first)

Format: date — decision — who — where it shows up.

## 2026-11-17
- Sumo navigation is four items: Results, Rankings, Rikishi, Techniques. Overview page removed; Results is the front page. — Owner approved — Sumo preview, PR #259.
- Every Sumo page uses one header pattern (dark band, red edge, uppercase title, one context line). — Owner approved — PR #259.
- Sumo preview refreshes every 30 minutes on possible basho days and daily all year; it picks up each new basho from the calendar and redeploys through a Render deploy hook. — Owner approved — PRs #260, #262, #265, #266.
- Wrestlers new to the tracked divisions are onboarded automatically from the Sumo API; they are labelled as awaiting independent certification and show a photo placeholder until a portrait is approved. — Owner approved — PRs #263, #264.
- The tracked cohort size is taken from the roster, never a fixed 190. — Claude, merged with the above.
- Career totals and head-to-head records are updated from each completed bout during a basho. — Owner approved — PR #265.
- Merging to `main` or the Sumo preview branch needs the owner's explicit "Merge N". — Owner standing rule.
- Design direction in DIRECTION.md and the roadmap in REVIEW-2026-11-17.md are **proposed**, not yet approved.
