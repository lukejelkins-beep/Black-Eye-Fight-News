# BEFN Sumo API — isolated integration foundation (14 November 2026)

## Source and scope

- API provider: https://www.sumo-api.com/ (NOT the FreePublicAPIs directory).
- Guide: https://www.sumo-api.com/api-guide
- Discovery listing: https://www.freepublicapis.com/sumo-api
- Authentication: none advertised. There is no key to store.
- Important: The provider explicitly asks sites using its API to contact webmaster@sumo-api.com. Get in touch before public deployment or large-scale ingestion. No commercial-use or bulk-republication permission has been inferred.
- API health/directory status does **not** certify real-time accuracy or guarantee future access.
- CORS is not consistently reported by directories; the integration deliberately makes **server-side build/CI calls only**.
- **No automatic publication, scheduled refresh, data replication, navigation changes, or production deployment is enabled in this PR.** No effect on existing MMA, boxing, grappling or UFC certification flows.

## Implemented connectivity

- Client: scripts/sumo-api-source.mjs
- Test suite: tests/test-sumo-api-source.mjs
- CI: .github/workflows/sumo-api-source-qa.yml; a feature-branch push triggers mocked tests plus a **read-only two-request live smoke check**.
- Run locally: \`node --test tests/test-sumo-api-source.mjs\`
- Optional live check: \`node scripts/sumo-api-source.mjs --smoke\`
- Optional standalone snapshot: \`node scripts/sumo-api-source.mjs --write-snapshot\`
  - Saves \`data/sumo/rikishi-index.json\` **locally only** unless separately committed; does not publish anything.
  - Completeness gate compares unique source IDs to the upstream total across up to five bounded pages; refuses early-ended or unstable pagination.
  - Does not collect every fighter's matches or stats (no unapproved bulk backfill).

## Available read-only calls

| Client method | Upstream data | Proposed BEFN use |
| --- | --- | --- |
| listRikishi({limit,skip,shikona}) | /api/rikishis | Searchable wrestler directory |
| rikishi(id) | /api/rikishi/:id | Identity, heya, birthplace, current physical measurements |
| stats(id) | /api/rikishi/:id/stats | Career and division wins/losses, titles, special prizes (verify exact payload first) |
| matches(id,{limit,skip,basho}) | /api/rikishi/:id/matches | Bout history, opponents, outcomes, kimarite |
| headToHead(id,otherId) | /api/rikishi/:id/matches/:opponentId | Head-to-head history |
| basho(YYYYMM) | /api/basho/:bashoId | Basho metadata and title/prize data |
| banzuke(YYYYMM,division) | /api/basho/:bashoId/banzuke/:division | Ranked list, by-tournament results |
| torikumi(YYYYMM,division,day) | /api/basho/:bashoId/torikumi/:division/:day | Scheduled/result bouts for specific day |
| kimarite() | /api/kimarite | Kimarite reference |

Other endpoints exist (ranks, measurements, shikona histories), but are not yet wired into the bounded adapter. Do not claim an image, biography, or a style signature is provided by the API until verified.

## Identity and record-quality requirements

- Sumo-API \`id\` differs from \`nskId\` (JSA) and \`sumodbId\` (SumoDB). Store all as separate nullable fields; **never assume numerical equivalence**.
- Latest current rank and measurements are snapshots, not all-time values.
- \`debut\` and basho identifiers use YYYYMM, not ISO day dates.
- Standard divisions include Makuuchi, Juryo, Makushita, Sandanme, Jonidan, and Jonokuchi; 15-day basho does not imply 15 fought bouts in lower divisions.
- Derive each rikishi's wins from correct winner ID, not East/West side alone.
- Never derive winning-technique distributions from limited recent matches and label them “career”; scope the denominator and sample size.
- Maintain distinct data states for future, completed, absence/kyujo, fusen, unknown, and missing records.
- Handle rank/name changes with JSA crosschecks before publication.
- Provide source links, data timestamp, and a discrepancy channel for official JSA comparisons.
- No wrestler photography is licensed by this connection.

## Proposed next release stages

1. Provider contact and permission/usage clarification; compare sample records with the official JSA.
2. Approve a budgeted scheduled refresh, with no overlapping workflow writers and data retention limits.
3. Build Sumo directory, profile and basho UI from cached JSON snapshots using BEFN's existing dark/gold/red/cream design, on an isolated branch.
4. Verify live results accuracy and mobile experience, then explicitly approve production merge/deploy.

This adapter is a **technical connection**, not a claim that the finished Sumo website section is already live.
