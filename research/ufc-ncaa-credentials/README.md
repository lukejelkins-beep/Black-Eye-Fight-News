# UFC NCAA wrestling credentials research

Research only, outside the site build. Nothing here is shown on a page, used in a rating or treated as a certificate. [Current results](RESEARCH-RESULTS.md) · [Pipeline rules](../../docs/ufc-credentials-pipeline.md) · [Pilot (all disciplines, 25 fighters)](../ufc-credentials-pilot/README.md)

## Scope and files

- The roster is every BEFN-certified UFC fighter: the frozen 783, the 141-fighter extension and the weekly rolling cohort (`loadRoster` in `scripts/ufc-credentials-run.mjs`). The three confirmed duplicate slugs (`bruno-silva`, `hyunsung-park`, `carlos-hernandez-7`) are skipped. Their fighters are researched under the certified slug.
- `<slug>.json` holds one record per fighter, in the pipeline's schema. Only the wrestling discipline was researched here. The other six disciplines stay `unknown`.
- `_runs/<run id>/` holds the checkpoint and run log of each ingest. The runs so far are:
  - `us-ncaa-1`: 198 Americans not in the pilot.
  - `us-ncaa-2`: 26 priority re-checks.
  - `us-ncaa-3a`: 31 unknowns.
  - `ca-ncaa-1`: 20 Canadians.
  - Three small follow-ups (`us-ncaa-1-blaydes-rehost`, `us-ncaa-2-romero`, `us-ncaa-lorenz`).
- `_school-athletics-hosts.json` is the reviewed list of official college athletics sites. Each homepage was checked to call itself the school's official athletics website. `pendingReview` lists hosts that blocked the check.
- Fighters were chosen by the flag in `data/ufc-fighter-countries.json`, which marks the country shown on UFC telecasts, not citizenship.

## NCAA rules

- An NCAA claim uses level `ncaa_d1` or `ncaa_other`. It carries `ncaa_division` (I, II or III in that season) and `ncaa_result`:
  - `participant`: on the team.
  - `all_american`: top eight at the NCAA championships.
  - `finalist`
  - `champion`
- Junior college (NJCAA, California JC), NAIA, U SPORTS and Canadian titles are level `other`, never NCAA. Schools move between divisions and associations, so check the season. For example, Lyon College was NAIA until it joined NCAA Division III in 2025.
- A college's own athletics roster or bio is Tier A **for team participation only**, and only when its host is on the reviewed list. A `.edu` host alone is not enough. All-American, finalist and champion need ncaa.com / ncaa.org or two independent outlets.
- "Unknown" means not found yet. `none_found` needs an NCAA or governing-body source actually searched and listed in `sources_checked`.

## Running

Plan-only: write prompts, answer them with research sub-agents, then ingest the replies. This makes no API calls.

```bash
node scripts/ufc-credentials-run.mjs --pass 1 --slugs a,b --max-calls 100 --disciplines wrestling \
  --out research/ufc-ncaa-credentials --emit-prompts /tmp/prompts --run-id <id>
node scripts/ufc-credentials-run.mjs --pass 1 --slugs a,b --max-calls 100 --disciplines wrestling \
  --out research/ufc-ncaa-credentials --from-dir /tmp/replies --run-id <id>
node scripts/ufc-credentials-schema.mjs        # validates every research folder
```

Keep searches per fighter low: the session's web-search budget is shared, and running many agents at once uses it up. Owner approval is required before merging to `main`.
