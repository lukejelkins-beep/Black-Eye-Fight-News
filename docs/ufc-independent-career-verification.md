# BEFN — Independent UFC career verification source evidence

## Current release state

This extension is **offline-only, non-production**, using the existing five-minute UFCalendar workflow. It makes **zero** external UFCStats requests. The queue and import crosswalk run after the existing Stage 3 progress audit; the existing API collector, caching, retry, budget, archive commits and relay are unchanged.

### Evidence stages

1. The main collector finishes its approved UFC fight and round-stat indexing as usual.
2. `scripts/ufc-36-month-stage3-progress.mjs` generates `qa/ufc-36-month-stage3-progress.json`.
3. `scripts/build-ufc-independent-certification-queue.mjs` prioritizes 20 unresolved fighters in `qa/ufc-independent-certification-queue.json`. It does not fetch external sources.
4. `scripts/reconcile-ufc-independent-evidence.mjs` optionally reads independently obtained **authorized** source export data and writes `qa/ufc-independent-source-reconciliation.json`, without changing the certification register.
5. GitHub Actions preserves QA outputs for seven days as a private, non-production workflow artifact.

### Source export input

An external-source acquisition process may provide `data/ufc-authorized-independent-source-export.json` only after access rights are verified. **Do not commit restricted source material, credentials, raw HTML, or paid licensed datasets to a public repository.** The script does not automatically download or create this file.

Expected high-level shape:

```json
{
  "schema": 1,
  "scope": "ufc-authorized-independent-source-export",
  "rosterAsOf": "2026-11-14",
  "accessProvenance": "Description of the provider and permission/export source",
  "fighters": [
    {
      "slug": "approved-athlete-slug",
      "fighterUrl": "https://ufcstats.com/fighter-details/<original fighter ID>",
      "bouts": [
        {
          "date": "YYYY-MM-DD",
          "opponent": "Official opponent name",
          "result": "win",
          "fightUrl": "https://ufcstats.com/fight-details/<original fight ID>"
        }
      ]
    }
  ]
}
```

Replace the angle-bracket placeholders with real provider IDs. The importer validates approved fighter slugs, source URL shape, per-fight date, opponent, winner/draw/no-contest outcomes and duplicate source identity keys. One-day time-zone shifts may be accepted as chronology matches for offline triage but **cannot alone establish the strict full-career certification requirement**.

### Safety and certification gate

- Input availability is **not** proof of authorized access. Confirm site-specific terms, robot policies, rate limits and retention rights before enabling any unattended source fetcher.
- Neither the queue nor the importer sets `sourceCoverageAttested=true`, modifies `data/ufc-independent-full-career-verification.json`, or certifies any fighter.
- A verified complete source chronology needs all official UFC bouts, including draws and no contests, TUF finals and older fights; exclude DWCS, Road to UFC qualifying fights, feeder and exhibition bouts.
- Independent career certification remains subject to the strict Stage 3 `evaluateCareerEvidence` gate: authoritative full listing, *every* fight-detail link, athlete identity, date/opponent/result, complete saved native history and no contradictory identities.
- Do not merge, enable external requests or publish to production before QA and owner approval.
