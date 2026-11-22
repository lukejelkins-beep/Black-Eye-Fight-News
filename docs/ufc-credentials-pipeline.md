# UFC external credentials pipeline (research only)

Records what each approved UFC fighter has done in wrestling, grappling, judo, kickboxing, boxing, BJJ and sambo, with a source for every claim. It is **not** wired into any page, rating, certificate or score. Credential bonuses stay off (see `ufc-v4-staged-release-control.md`). Unknown or unresearched is never "none".

## Files
- `scripts/ufc-credentials-schema.mjs` — schema constants, claim and record validator, directory check. Offline.
- `scripts/ufc-credentials-run.mjs` — runner (queue, parallel workers, checkpoints, resume, run log).
- `data/ufc-credentials/<slug>.json` — one file per fighter, roster slug as is.
- `data/ufc-credentials/_runs/<run id>/` — `checkpoint.jsonl`, `requests.jsonl` (one line per HTTP request with tokens, searches, cost estimate) and `run-log.json` (totals per pass, outcomes, budget used).
- `data/ufc-credentials/_skip-duplicate-identities.json` — extra slugs to skip. The runner also skips every `-N` slug and its base slug.
- `data/ufc-credentials-pilot.json` — the 25-fighter pilot. The `focus` and `ownerCheck` notes are my recollection for the owner to check; they are never sent to a model and are not evidence.
- Tests: `tests/test-ufc-credentials-schema.mjs`, `tests/test-ufc-credentials-run.mjs` (`node --test`, no network).

## Record
Per discipline: `status` (`none_found`, `claimed`, `verified`, `unknown`), `levels` (derived from claims, from the fixed list below), `claims[]`, and `sources_checked[]`.
A claim: `text` (own words, under 300 characters), `source_url`, `source_name`, `tier` (A/B/C), `retrieved` (date), `year` (or null), `level`, optional `level_note`, computed `display` (`claimed` for Tier C, `sourced` otherwise) and, after pass 3, `audit`.
Fighter level: `identity` (`confirmed` or `unclear`), `flags[]` (`conflict`, `thin_sources`, `identity_unclear`, `needs_escalation`), `history[]` (pass, model, effort, request and token counts), `audit`, `rejected_claims[]`, `validation` (what was dropped and why).

Level list: `youth`, `high_school`, `ncaa_d1`, `ncaa_other`, `national_team`, `national_champion`, `continental_medal`, `world_medal`, `olympic`, `pro`, `belt_white|blue|purple|brown|black|coral|red`, `other` (needs `level_note`). A discipline lists every level its claims show; it does not pick one "highest", because `pro` and belts are not on the same ladder.

## What the validator enforces
- A claim without an http(s) URL, a tier A/B/C or a real retrieved date (not in the future) is dropped, as is one with no source name, a level outside the list, search-engine URLs, text over 300 characters, or a quoted span of five or more words (copied wording).
- Tier A is kept only for governing-body or database hosts (IJF, JudoInside, UWW, NCAA, FIAS/sambo.sport, IBJJF, BoxRec, ADCC, Olympics/Olympedia, World Boxing, WAKO, IFMA, IMMAF, USA Wrestling, Team USA, USA Judo). Any other host labelled A is held at B. Wikipedia, Wikidata, Reddit, social media, YouTube and similar are held at C.
- Status can only be lowered: `verified` needs a Tier A claim or two Tier B claims on different hosts; otherwise `claimed`. No valid claim means `unknown`. `none_found` needs at least one dated `sources_checked` entry, otherwise `unknown`; if claims contradict it the fighter gets `conflict`. Unclear identity caps every discipline at `claimed`. An `unreachable` pass-3 claim no longer counts toward `verified`; a `refuted` one is removed and kept in `rejected_claims`.
- All seven disciplines are always present; a missing one is `unknown`.
- `npm`-free check of saved files: `node scripts/ufc-credentials-schema.mjs` fails if a file is hand-edited, misnamed, outside the approved roster, or not in normalised form.

## Running
```bash
export PATH=~/.local/opt/node-v22.23.5-darwin-arm64/bin:$PATH
npm install --no-save @anthropic-ai/sdk          # not a repo dependency, on purpose
node scripts/ufc-credentials-run.mjs --pass 1 --pilot --max-calls 80 --workers 4 --dry-run
node scripts/ufc-credentials-run.mjs --pass 1 --pilot --max-calls 80 --workers 4 --run-id pilot-1
node scripts/ufc-credentials-run.mjs --pass 2 --pilot --max-calls 60 --run-id pilot-2
node scripts/ufc-credentials-run.mjs --pass 3 --pilot --max-calls 60 --run-id pilot-3 --sample 0.075 --seed pilot
```
Add `--resume` with the same `--run-id` to continue after an interruption. Credentials come from the Anthropic SDK's usual environment only.

Guards: `--max-calls` is mandatory and counts every HTTP request including `pause_turn` continuations; more than 25 fighters is refused unless `BEFN_CREDENTIALS_APPROVED_CALLS` (the owner's approved budget) is at least `--max-calls`; there is no all-roster mode; slugs must be in the approved 783; duplicate-identity slugs are skipped.

## Not verified yet
- The live request shape (`web_search_20260209` and `web_fetch_20260209` tools, `output_config.effort`, server-side fallbacks beta) has not been exercised: no API credentials were available in the session that built this. Tests use a fake model. `--no-fallbacks` drops the fallbacks beta if the API rejects it.
- Prices in `PRICES` are from the cached Anthropic price list; the web-search price per query is an assumption. Costs are estimates until compared with the console.
- Precision on the pilot is unknown until the pilot runs.

## Boxerbook MCP (checked 22 Nov 2026)
Professional boxing only, looked up by name, one fighter at a time, not for bulk copying. Of four names tried: Holly Holm returned a full record (34-4-3), Valentina Shevchenko a 2-0 professional record, Alex Pereira an entry with no record, and Petr Yan nothing. It cannot answer amateur boxing, which is most of what a UFC fighter's "boxing" credential is, and a name match can be the wrong person. Decision: boxing stays in the model prompt; Boxerbook is for cross-checking professional records by hand in the pilot review. The runner cannot call an MCP server.
