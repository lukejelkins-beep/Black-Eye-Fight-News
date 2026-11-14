# BEFN — Independent UFC career verification source evidence

## Current release state

This extension is **offline-only, non-production**, using the existing five-minute UFCalendar workflow. It makes **zero** external UFCStats requests. The queue and import crosswalk run after the existing Stage 3 progress audit; the existing API collector, caching, retry, budget, archive commits and relay are unchanged.

### Evidence stages

1. The main collector finishes its approved UFC fight and round-stat indexing as usual.
2. `scripts/ufc-36-month-stage3-progress.mjs` generates `qa/ufc-36-month-stage3-progress.json`.
3. `scripts/build-ufc-independent-certification-queue.mjs` prioritizes 20 unresolved fighters in `qa/ufc-independent-certification-queue.json`. It does not fetch external sources.
4. `scripts/reconcile-ufc-independent-evidence.mjs` optionally reads independently obtained **authorized** source export data and writes `qa/ufc-independent-source-reconciliation.json`, without changing the certification register.
5. GitHub Actions preserves QA outputs for seven days as a private, non-production workflow artifact.

### Greco1899 public historical dataset integration

The collector now performs a **GitHub-only bulk CSV crosscheck**, using `scripts/audit-ufc-greco-bulk-crosscheck.mjs`. On the first eligible collector run each UTC day, it requests the source commit metadata and exactly two version-pinned CSV files from `Greco1899/scrape_ufc_stats`:

- `ufc_event_details.csv` supplies authoritative date candidates for the source's UFC event names.
- `ufc_fight_results.csv` supplies fight-detail URLs, outcomes and corner names.

This stage **does not request UFCStats pages**, use the UFCalendar paid key, or write any original source CSV into the BEFN repository. It places a private QA report in `qa/ufc-greco-bulk-crosscheck.json` and a compact daily resume checkpoint in `data/ufc-greco-crosscheck-checkpoint.json`. Later five-minute collector runs reuse the checkpoint and make **zero Greco requests** that UTC day. On a public GitHub source error, the existing UFCalendar archive/relay continues.

The source repository declares **GPL-3.0 for its project**; this does not establish standalone rights over every underlying statistical fact or the upstream website. BEFN does not copy its code or raw dataset, and limits this integration to source-linked research deltas pending confirmation of any relevant reuse requirements. Attribution: https://github.com/Greco1899/scrape_ufc_stats .

**Verified pilot on 14 November 2026:** the 8 November 2026 source snapshot contained 8,988 fight-result records across 796 events. It name-matched 770 of the 783 approved fighters (768 names unique within that roster), and matched **24/24** independently verified source-inventory bouts for Bruno Gustavo da Silva, Carlos Hernandez and HyunSung Park. This was a *historical candidate match*, not a claim of restored native UFCalendar records or completed full-career certifications. The source event list ended on 7 November 2026 and cannot certify the 14 November 2026 snapshot by itself.

For all other fighters, Greco matches are **identity candidates** only. The queue prioritizes unlinked source bouts for review; it does not infer two same-name records belong to one fighter, populate round statistics, change records, or set independent `sourceCoverageAttested`.

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
