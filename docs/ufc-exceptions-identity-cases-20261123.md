# UFC certification exceptions: the identity and scope cases (research, 23 November 2026)

**Research only. No certificate, lane, count, register entry, stats file or cohort slug is changed by this note.** It reads the 8 exceptions left after #441, #443 and #444 (audit: 775 certified, 0 fast lane, 8 exceptions) and looks at five of them: the two `carlos-hernandez` slugs, Zhu Kangjie, Rei Tsuruya and Yizha. The other three (`bruno-silva`, `hyunsung-park`, `waldo-cortes-acosta-2`) are in `docs/design/DECISIONS.md` (left as exceptions on the owner's choice). Source for the comparison: the free UFCStats export (Greco1899/scrape_ufc_stats), compared with the saved history in `data/ufcalendar-fighter-research.json`, the register and `data/ufc-official-career-bout-inventory.json`.

## Zhu Kangjie, Rei Tsuruya, Yizha: one Road to UFC final each
UFCStats and BEFN's saved UFC rows agree exactly for all three (1, 4 and 4 UFC bouts, same opponents, results and dates). None is missing a fight. The queue flags each one `source_confirmed_missing_history` because the source inventory lists one **Road to UFC tournament final** that UFC.com counts and UFCStats does not:

| Fighter | UFCStats UFC bouts | Final the inventory lists |
|---|---:|---|
| Zhu Kangjie | 1 | 2025-05-23 v Bin Xie (win) |
| Rei Tsuruya | 4 | 2024-02-03 v Jiniushiyue (win) |
| Yizha | 4 | 2024-02-03 v Kaiwen Li (win) |

The inventory note says the final has no matching original native UFC fight in the saved cache, so the strict rule (native identity, both corners, outcome, event, measured rounds) cannot be met, and nothing is invented. The saved history carries each final as a non-UFC "history" row, not a UFC bout.

**The question is a policy one, not a data one:** is a Road to UFC final a UFC career bout?
- If **no** (the UFCStats view the other 775 were certified on), these three match UFCStats exactly and would certify the same way as the 28 in #441 and #443, with nothing to recover. The inventory entries would leave with them.
- If **yes** (the UFC.com view the inventory uses), they stay blocked, because the native identity and measured rounds for a tournament final cannot be recovered from the saved cache.

## The two Carlos Hernandez slugs: one person, filed twice
Both `carlos-hernandez` and `carlos-hernandez-7` carry the same UFCStats fighter link (`798e48f9e7f6ba22`) and the same seven UFCStats bouts (2022-02-26 Altamirano through 2025-05-17 Park), so they look like **one fighter**. This would be a third duplicate pair in the frozen cohort, after `bruno-silva` and `hyunsung-park`, which would leave about 780 distinct people. The owner has not confirmed this.

What differs, from the data (the exact failing check inside the gate was not traced):
- `carlos-hernandez`: the register entry lists 7 bouts, but saved history holds 8 rows tagged UFC, including the 2021-10-05 win over Daniel Barez (Dana White's Contender Series, 1 row), and a second 2025-05-17 Park row from the "history" source. The 7 against 8 count is the likely reason the gate fails.
- `carlos-hernandez-7`: saved history holds exactly the 7 UFC rows, but the profile has two native fighter ids (1071 and 102973, the 2025-05-17 Park bout carries the newer one), a provider history discrepancy flag, and an ambiguous-identity flag. The register entry already documents the id reconciliation and excludes the Barez DWCS bout.

## What could be done (owner decisions, none taken here)
1. **Policy on Road to UFC finals** decides Zhu, Tsuruya and Yizha (3 of the 8).
2. **Confirm the two Hernandez slugs are one person.** If so, they are the same kind of case as `bruno-silva` and `hyunsung-park` (a cohort change or a queue alias, both owner calls).
3. Neither needs a new source: the UFCStats export already agrees with the saved history for all five.

## Not checked
- UFC.com athlete pages were not read (the register's notes say none were retrieved directly).
- The exact gate check that fails for the two Hernandez slugs.
- Whether UFCStats itself counts any Road to UFC bout for these three (the export lists none).

Reproduce: run the two Stage 3 steps CI runs, then compare each exception's saved history with the UFCStats CSV files, as in `docs/ufc-exceptions-missing-history-20261123.md`.
