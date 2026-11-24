# UFC BJJ credentials research

Reuse the [pinned 921-fighter cohort](../ufc-representative-credentials/cohort.json). This is research for Claude. The [initial ledger](initial-screen.json) covers 921 unique slugs and preserves the original batch assignments.

## Expanded roster-wide screening

| Evidence | Result |
| --- | --- |
| [Belt sources](belt-evidence.md) · [921-fighter belt ledger](belt-coverage.json) | Checked 921 roster entries and matched 920 UFC profiles. 560 profiles supplied a BJJ belt statement. A separate academy profile supplied an additional belt statement. |
| [IBJJF Worlds, No-Gi Worlds and World Master](ibjjf-world-results.md) | Screened 46,079 placement rows from 63 events. The evidence table retains 200 strong candidate placements across 47 fighters, with identity caveats. |
| [ADCC Worlds and Trials](adcc-results.md) | Verified 21 Worlds placements across eight fighters, including seven titles. Verified separate Worlds bouts and a Trials title for Chris Weidman. |
| [UFC-promoted submission grappling](ufc-promoted-results.md) | Four sourced bouts, from the numbered UFC BJJ card screen and a targeted Fight Pass check. |

The [921-fighter competition ledger](competition-screen.json) records matches to each of the companion reports. The roster-wide passes are complete for the named archives. Earlier promotions, current belt degrees, some competition archives and individual identity checks remain open where the source notes identify a gap.

## Initial screening

The first pass matched roster names, including the Buchecha alias, against the men's and women's divisional champion tables in the [official ADCC statistics](https://adcombat.com/adcc-submission-fighting-world-championship-statistics/). This pass covered the champions table only. The first matches were Mackenzie Dern (2015), Rani Yahya (2007), Kron Gracie (2013), Rodolfo Vieira (2015), and Marcus Almeida (2013 and 2017). The 2026 ADCC heavyweight Victor Hugo hit was excluded as a same-name match against the [UFC profile](https://www.ufc.com/athlete/victor-hugo).

Fifty fighters had pre-existing external credentials files in the inspected checkout, pinned to `ced836fb541151be03ededfd1cc43958e70c17b5`. Thirty-five had BJJ claims and seven had grappling claims. Ledger counts are prior leads and may overlap. Zero means no existing claim in the inspected files. See the expanded results for the follow-up work.

## Evidence workflow

1. Search the canonical name and documented variants in the [IBJJF certified black belt directory](https://ibjjf.com/certified-black-belts) and check promotion announcements from the awarding coach or academy. Record belt, degree, promotion date and awarding instructor only where sourced. Preserve the last documented date and label athlete-reported ranks as such. An event entry can document belt at the time of competition.
2. Search IBJJF gi and no-gi event results, full ADCC Worlds and Trials brackets, and other official promotion or federation records. Record organizer, event and year, gi or no-gi, age class, belt division where applicable, weight or absolute class, result, and source. Distinguish medals, appearances, qualifiers, superfights, and professional tournament matches.
3. Resolve collisions using team, age, weight, documented names and athlete biographies. Check official corrections before recording final placement. Keep source coverage and unanswered fields in the ledger. Missing registry or bracket entries leave the relevant credential unresolved.
