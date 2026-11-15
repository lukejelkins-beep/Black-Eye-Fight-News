# BEFN Sumo — API-trusted validation decision

**Approved:** 15 November 2026  
**Scope:** the existing 190-rikishi November 2026 research cohort and non-production Sumo profile preview.  
**Default:** trust complete, internally consistent Sumo API data for profile development. Targeted QA replaces mandatory independent JSA/SumoDB corroboration of every field. This decision does **not** certify sources as independently proven or authorise any public release.

## Current checkpoint

- API history stages collected: **190/190**, with **0** API-integrity exceptions in the saved source audit.
- Core webpage fields present: **190/190** in the existing readiness report.
- API-trusted for isolated development preview: **190/190**, recorded in `data/sumo/backfill/v1/api-trusted-readiness.json`.
- Existing strict independently corroborated career results: **182/190** at the saved checkpoint. Preserve the exact per-person result in `career-certification-strict.json`. Do not convert the remaining 8 to strict-certified merely because they are accepted for preview.
- Historical JSA spot-checks still marked `requires-reconciliation` in the legacy snapshot: **Fujiseiun** and **Nishikigi**. Investigate the timing and latest data when these are displayed; an older spot-check alone is not proof of a present-day source error.
- Licensed local portraits missing: **190/190**. Use appropriate placeholders until image permissions and attributions are checked.

## Targeted checks (must not be skipped)

1. Validate roster and distinct source IDs. Keep Sumo API `id`, official NSK/JSA ID and SumoDB ID separate.
2. Require complete API pagination for matches, ranks, historical measurements, shikona and profiles; ensure no missing winners and internally consistent W/L totals. Preserve and flag any source audit error instead of calling the profile preview-ready.
3. Maintain correct Makushita calendar-day logic (non-bout days are **not** injuries/absences); classify fusen and Mae-zumo correctly.
4. Keep documented JSA bout correction overlays in derived outputs, with the raw API record immutable and source URL retained.
5. Preserve unknown or missing ranks, historical weights, absences, birth details and winning techniques as unknown. A current listed weight is **not** a confirmed pre-basho weigh-in; do not interpolate monthly weights or assume each tournament has a measurement.
6. Retain full dated head-to-head chronology, winner and kimarite provenance. Missing techniques stay unknown, not a guessed technique.
7. Flag demonstrable API/official conflicts and dated JSA comparisons separately. Prioritise anomalies affecting users; do not make absent independently published career totals a global development blocker.
8. Preserve all previous independent evidence and strict certificates; the lighter development rule is a separate **readiness designation**, not a new certification or a replacement register.

## Workflow

- The existing research-only `scripts/sumo-webpage-readiness-190.mjs` creates both the detailed display-field report and the separate API-trusted preview decision on its next completed run.
- `tests/test-sumo-webpage-readiness-190.mjs` checks the preview-versus-certification distinction and that real missing data or integrity faults remain blockers.
- Build the existing non-production Sumo profiles with this readiness designation. Use API-derived scores and historical visualisations with source and date labels.
- The isolated preview may progress without the 8 remaining strict source corroboration cases. Keep their strict status unchanged.
- **No main merge, production deployment, automated API republication, new spend, new workflow or new source collection permission** is granted by this methodology change.
- The API provider asks websites using it to contact them; public publishing/redistribution conditions need to be resolved separately. Photo licensing and explicit production approval remain prerequisites to public release.

## Interpretation

**API-trusted preview-ready** = the profile can be built and inspected from complete internally consistent source data.  
**Strict career-results certified** = separate saved independent source audit passed.  
**Full profile certified** and **production approved** = neither is conferred by this decision.
