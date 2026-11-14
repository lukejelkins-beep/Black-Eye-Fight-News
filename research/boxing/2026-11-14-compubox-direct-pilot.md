# CompuBox direct capability pilot — 14 November 2026

**Research only. NOT a licence to collect or publish CompuBox data.** No production changes; no CompuBox scraping worker or API ingestion; no change to UFC V4.

## Purpose

Determine whether the official CompuBox site directly provides detailed boxing punch statistics usable in a future BEFN boxing V4 profile, and whether a complete five-/ten-/career-bout statistical dataset can be assumed.

## Verified report structure

Directly inspected CompuBox's individual `/round-stats/{id}` reports (one-page PDFs or text renderings). Available where a bout is covered:

- Full-bout punches thrown and landed; jab and power thrown and landed; derived connection percentages
- Individual-round totals of the same measures
- Punches landed to body; opponent punches inferred from opposite fighter's totals
- Bout, date, location and outcome

Not independently confirmed from these reports: consistent per-round head/body breakdown, punch speed, punch type beyond jab versus power, knockdowns as a structured field, a public licensed API, or an organised fighter-to-fight lookup endpoint.

## Small targeted sampling of *located* reports

This is an **availability spot-check, not a random coverage-rate sample**. The ten examples were deliberately selected where direct reports were discoverable, so **do not state '10/13 divisions covered' as a statistically representative coverage percentage**.

| Division | Fighter / opponent | Bout date | Official report | Verification |
|---|---|---|---|---|
| Cruiserweight | Jai Opetaia / Huseyin Cinkara | 2025-12-06 | https://beta.compuboxdata.com/round-stats/15916 | Full punch and round-by-round tables located |
| Light heavyweight | Joshua Buatsi / William Hutchinson | 2026-11-07 | https://beta.compuboxdata.com/round-stats/16970 | Full punch and round-by-round tables located |
| Super middleweight | Saul Alvarez / Christian Mbilli | 2026-10-31 | https://beta.compuboxdata.com/round-stats/16941 | Full punch and round-by-round tables located |
| Middleweight | Carlos Adames / Austin Williams | 2026-03-21 | https://beta.compuboxdata.com/round-stats/16235 | Full punch and round-by-round tables located |
| Super welterweight | Sebastian Fundora / Keith Thurman | 2026-03-28 | https://beta.compuboxdata.com/round-stats/16256 | Full punch and round-by-round tables located |
| Super lightweight | Dalton Smith / Alberto Puello | 2026-10-24 | https://beta.compuboxdata.com/round-stats/16918 | Full punch and round-by-round tables located |
| Lightweight | Abdullah Mason / Sam Noakes | 2025-11-22 | https://beta.compuboxdata.com/round-stats/15892 | Full punch and round-by-round tables located |
| Super featherweight | O'Shaquie Foster / Emanuel Navarrete | 2026-10-24 | https://beta.compuboxdata.com/round-stats/16920 | Full punch and round-by-round tables located |
| Featherweight | Rafael Espinoza / Ricardo Blandon | 2026-10-31 | https://beta.compuboxdata.com/round-stats/16943 | Full punch and round-by-round tables located |
| Super bantamweight | Naoya Inoue / Alan David Picasso | 2025-12-27 | https://beta.compuboxdata.com/round-stats/15965 | Full punch and round-by-round tables located |

**Heavyweight and welterweight:** official CompuBox report listings mention Moses Itauma / Filip Hrgovic (Aug 2026) and Ryan Garcia / Conor Benn (Sep 2026), but the corresponding report PDFs were not independently opened in this spot-check. **Bantamweight:** no chosen bout PDF was conclusively verified. These are unverified, not established gaps.

## Historical-depth findings

- The direct individual report PDFs above cover examples from Nov/Dec 2025 to Nov 2026, so multi-year / multiple fight report data exists.
- CompuBox's own published pound-for-pound aggregate ranking shows multi-bout statistics, including 17 observed bouts for Naoya Inoue and 8 for Oleksandr Usyk on the published comparison. Those numbers may be a selected subset rather than every career bout.
- Cross-reference: Inoue's last five as of this snapshot are Junto Nakatani (May 2026), Alan David Picasso (Dec 2025), Murodjon Akhmadaliev (Sep 2025), Ramon Cardenas (May 2025), Kim Ye-joon (Jan 2025), per official fighter site https://naoya-inoue.com/profile/. The Picasso report was directly located. Lack of search results for the remaining four does not show that reports don't exist.
- **No defensible percentage can yet be assigned for comprehensive coverage of 499 fighters × five latest fights.** Requires agreement/authorised access and a systematic fight-ID coverage matrix.

## Site navigation and contract limitation

- Main website: https://beta.compuboxdata.com/
- Terms: https://beta.compuboxdata.com/terms-and-conditions
- Site expressly says published data is for personal, noncommercial use; commercial republication, derivative products, bulk collection/caching require prior authorisation. Official home page offers commercial data feeds by arrangement.
- Public access to PDFs is **not** evidence of an API licence or permission to warehouse data for BEFN.

## Recommended next gates

1. Contact CompuBox about commercial data feed/API availability, pricing, total historical bout count, fighter/bout identifiers, coverage of women's and men's weights, ability to query last five/ten bouts, rights to derive ratings and display aggregated metrics, caching, and refresh frequency.
2. Request a small **licensed** sample of at least five recent bouts for each of 25 rank-diverse fighters, weighted across all 13 classes, plus a historical five-bout sample from a prospect and a champion.
3. Match each sampled bout from BEFN's roster using date / opponent / fighter ID; record exact availability including when an event was untracked, no public PDF, non-licensed, or not returned.
4. If coverage is incomplete, keep professional records and opponent-quality as boxing rating foundations, displaying CompuBox-derived statistics **only** when covered and licensed; never mark unavailable punches as zero.
