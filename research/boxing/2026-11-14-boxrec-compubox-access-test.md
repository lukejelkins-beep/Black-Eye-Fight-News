# BoxRec punch-stat access test — 14 November 2026

**Scope:** Limited, manual read-only verification of BoxRec's public pages. No account login, API, extraction script, bulk indexing or credential handling. Findings are a purposive sample, **not a statistically representative coverage estimate**.

## Main BoxRec profiles and bout views

| Sample | Direct URL | Readable | Punch fields? | Notes |
|---|---|---|---|---|
| Teofimo Lopez professional fighter profile | https://boxrec.com/en/box-pro/776269 | Yes, without login | No | Contains 25-bout history, opponents, results, titles, record, dates |
| Teofimo Lopez vs Rolando Romero, Aug 2026 | https://boxrec.com/en/event/954648/3668469 | Yes | No | Bout details/metadata but no punch stats |
| Teofimo Lopez vs Shakur Stevenson, Jan 2026 | https://boxrec.com/en/event/937796/3505007 | Yes | No | Bout details/metadata but no punch stats |
| Teofimo Lopez vs Arnold Barboza Jr, May 2025 | https://boxrec.com/en/event/916526/3311901 | Restricted | Unknown | Redirected to login?error=rate_limited: **do not retry/bypass** |

**Important discovery:** The older URL format `/en/boxer/...` failed in the public test, but the current `/en/box-pro/{id}` format returned a readable fighter card. This does **not** establish permission to collect/publish data commercially.

## BoxRec wiki fight pages sampled

| Bout | Date | BoxRec page | Data in visible text | Assessment |
|---|---|---|---|---|
| Wladimir Klitschko vs Tyson Fury | 2015-11-28 | https://boxrec.com/wiki/index.php/Wladimir_Klitschko_vs._Tyson_Fury | Both fighters' landed/thrown totals, jabs, power punches | FULL fight totals; no round-wise breakdown |
| Artur Beterbiev vs Enrico Koelling | 2017-11-11 | https://boxrec.com/wiki/index.php/Artur_Beterbiev_vs._Enrico_Koelling | Both fighters' total punches landed/thrown only | PARTIAL |
| Oleksandr Usyk vs Murat Gassiev | 2018-07-21 | https://boxrec.com/wiki/index.php/Oleksandr_Usyk_vs._Murat_Gassiev | Link to CompuBox table in image https://boxrec.com/wiki/index.php/File:2018-07-21_-_Oleksandr_Usyk_vs._Murat_Gassiev_(Compubox).jpg, no text table | IMAGE-ONLY / manual visual check needed |
| Artur Beterbiev vs Oleksandr Gvozdyk | 2019-10-18 | https://boxrec.com/wiki/index.php?title=Fight:2401304 | Both fighters' landed/thrown totals, jabs, power punches | FULL fight totals; no round-wise breakdown |
| Oleksandr Usyk vs Tyson Fury I | 2024-05-18 | https://boxrec.com/wiki/index.php?title=Fight:3107900 | Scorecards, fight context only | NO punch breakdown in visible text |
| Oleksandr Usyk vs Tyson Fury II | 2024-12-21 | https://boxrec.com/wiki/index.php?title=Fight:3175360 | Round-by-round total and power punches **landed**; thrown/jabs not provided | PARTIAL round-level |
| Saul Alvarez vs William Scull | 2025-05-03 | https://boxrec.com/wiki/index.php?title=Fight:3300177 | 445 combined thrown, CompuBox-related note, scorecards | PARTIAL anecdotal, not usable per boxer |
| Saul Alvarez vs Terence Crawford | 2025-09-13 | https://boxrec.com/wiki/index.php/Saul_Alvarez_vs._Terence_Crawford | Both fighters' total and jab/power **landed** only; no thrown | PARTIAL |

**Sample observation:** 2/8 public wiki pages had complete text-based fight-total metrics for total, jab and power punches landed and thrown. Six of eight lacked those complete text-based fields. Several nevertheless referenced CompuBox, contained partial statistics or linked an image. **This 2/8 ratio is not a reliable estimate for all BoxRec fights** because the pages were deliberately selected from well-known fights and varying years. None of these eight pages displayed a fully structured round-by-round breakdown of total/jab/power punches **landed and thrown** for each boxer.

## BEFN conclusion

1. BoxRec is a valuable bout-history, identity, scorecard, title and opponent verification reference.
2. CompuBox statistics on BoxRec are *heterogeneous, editorial, sometimes image-backed and sometimes missing*; main bout pages tested did not contain punch metrics.
3. A BoxRec sign-in might add record details, but does **not** establish that CompuBox is uniformly available nor grant bulk/commercial data rights.
4. Never assume zero for unreported punch fields. Maintain `null`/unavailable plus provenance and a per-bout completeness flag.
5. Do not create boxing punch-based 5/10/career leaderboards before a sufficiently representative availability and licensing test. Consider an appropriate licence/feed directly from CompuBox.
6. No production, API, UFC V4, or fighter profile changes were made in this test.
