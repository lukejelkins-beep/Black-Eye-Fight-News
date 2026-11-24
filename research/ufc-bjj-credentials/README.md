# UFC BJJ credentials research

Reuse the [pinned 921-fighter cohort](../ufc-representative-credentials/cohort.json). This is research for Claude. The [initial ledger](initial-screen.json) covers 921 unique slugs and preserves the original batch assignments.

## Initial screening

The first pass matched roster names, including the Buchecha alias, against the men's and women's divisional champion tables in the [official ADCC statistics](https://adcombat.com/adcc-submission-fighting-world-championship-statistics/). This pass covered the champions table only. The first matches were Mackenzie Dern (2015), Rani Yahya (2007), Kron Gracie (2013), Rodolfo Vieira (2015), and Marcus Almeida (2013 and 2017). The 2026 ADCC heavyweight Victor Hugo hit was excluded as a same-name match against the [UFC profile](https://www.ufc.com/athlete/victor-hugo).

Fifty fighters had pre-existing external credentials files in the inspected checkout, pinned to `ced836fb541151be03ededfd1cc43958e70c17b5`. Thirty-five had BJJ claims and seven had grappling claims. Ledger counts are prior leads and may overlap. Zero means no existing claim in the inspected files. Belt and broader competition verification are pending.

## Evidence workflow

1. Search the canonical name and documented variants in the [IBJJF certified black belt directory](https://ibjjf.com/certified-black-belts) and check promotion announcements from the awarding coach or academy. Record belt, degree, promotion date and awarding instructor only where sourced. Preserve the last documented date and label athlete-reported ranks as such. An event entry can document belt at the time of competition.
2. Search IBJJF gi and no-gi event results, full ADCC Worlds and Trials brackets, and other official promotion or federation records. Record organizer, event and year, gi or no-gi, age class, belt division where applicable, weight or absolute class, result, and source. Distinguish medals, appearances, qualifiers, superfights, and professional tournament matches.
3. Resolve collisions using team, age, weight, documented names and athlete biographies. Check official corrections before recording final placement. Keep source coverage and unanswered fields in the ledger. Missing registry or bracket entries leave the relevant credential unresolved.
