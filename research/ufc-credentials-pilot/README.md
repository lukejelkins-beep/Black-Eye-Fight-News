# UFC external credentials pilot (25 fighters)

Research only, outside the site build. This is the 25-fighter, all-discipline pilot of the credentials pipeline (#412, 22 Nov 2026). It moved here from `data/ufc-credentials/` on 24 Nov 2026. [Pilot report](RESEARCH-RESULTS.md) · [Pipeline rules](../../docs/ufc-credentials-pipeline.md) · [NCAA wrestling research](../ufc-ncaa-credentials/README.md)

- `<slug>.json` holds one record per fighter, with all seven disciplines (wrestling, grappling, judo, kickboxing, boxing, BJJ, sambo).
- `_pilot.json` is the 25 fighters, with the owner-check notes. Those notes are never sent to a model and are not evidence.
- `_skip-duplicate-identities.json` holds extra slugs to skip, read from this folder when a run writes here.
- `_runs/pilot-{1,2,3}-subagents/` holds the three passes' checkpoints and run logs.

Rerun the pilot (plan-only or API) with `node scripts/ufc-credentials-run.mjs --pass N --pilot ...`. Pilot runs write to this folder by default.
