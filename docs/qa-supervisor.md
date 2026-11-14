# BEFN quality supervision

The QA workstream extends the existing release gate and hourly production monitor. It does not create a second research process. All observations are advisory unless an existing source test or the new packaging regression fails.

## Commands and outputs

```sh
python -m pip install PyYAML==6.0.2
python tests/test-qa-supervisor.py
python scripts/qa-supervisor.py
# Optional: exactly one GitHub GET for the latest 100 main-branch runs.
python scripts/qa-supervisor.py --github
node --test tests/test-mobile-build.mjs
npm run build
```

Reports are written to `qa/supervisor/qa-status.json` and `qa-status.md`. GitHub uploads them as artifacts with 14-day retention and appends Markdown to the run summary. Generated live reports are not committed or written back to main. `qa/findings.json` is the central human-reviewed register. Baseline evidence and the inventory are in `qa/supervisor-baseline-20261114.json` and `qa/supervisor-inventory-20261114.json`.

The existing **BEFN release readiness** workflow runs source tests, packaging regression, and offline inventory on PRs, main pushes and manual dispatch. The existing **Verify live UFC fighter profiles** workflow continues its browser tests and gains a separate read-only operational report job on its existing hourly schedule. There is no new agent automation, paid provider call, deployment or data publication.

## Interpreting the report

- `pass` means that specific syntactic diagnostic passed. It does not prove a feed is editorially correct, a career is certified, or the deployed version matches main.
- `warning` means review an empty feed, invalid/duplicate IDs or a stale/future timestamp; no record is edited automatically. Thresholds are conservative operational defaults, not new release standards.
- `unknown` means evidence is insufficient. A date-only review date cannot establish minute-level freshness.
- A failed GitHub request is explicitly unknown, not a green operational health result. Only the latest 100 main-branch runs are sampled. Workflows missing from that sample require individual inspection; no all-green claim is made.
- Consecutive failures are grouped by workflow path, branch and trigger. A later success clears the observed failure streak; unrelated PR failures cannot be mistaken for a main outage.
- Workflow/test mapping is static command analysis. It includes explicit test paths and Python discovery patterns, but is not code coverage and may miss tests invoked indirectly from another script.
- `inventory.workflows` records all local YAML triggers, schedules, permissions, concurrency, job dependencies/timeouts, action dependencies, explicit tests and script entrypoints. Owner and billing are unknown unless separately established. A workflow is retained until its consumers are reviewed.

## Triage and coordination

1. Check the source revision and report time. Open the original failed run; inspect its failed step and logs before changing code.
2. Record confirmed facts, suspected causes, subsystem, impact, risk, effort, conflicts and closure verification in the findings register.
3. Review latest main and all open PR filenames before editing shared files. Protect UFC cohort, evidence, certification gates, collectors and boxing research.
4. Reproduce locally using cached or synthetic inputs. Do not call paid providers to improve a QA metric.
5. Prepare small PRs, run affected tests, and request explicit approval before merge/deployment. Do not disable another workstream's automation.
6. Close a finding only after the required verification and integration; a local fix is not a production resolution.

The existing certification audit and exception queue remain authoritative. This report neither recomputes certification nor changes five/ten/career statistics. The native build remains a starter with bundled feeds; successful packaging does not approve store distribution.

## Cost and failure boundaries

The operational job makes at most one GitHub request per existing hourly run and uses a five-minute timeout. It needs only contents/actions read permissions and never receives provider secrets. The source report does not use network data beyond installing pinned PyYAML. The report adds some CI execution; savings are not claimed. Consolidating collector tests or certification workflows requires separate measurement and owner review.

PR readiness checks cannot enforce merge policy by themselves. Branch-protection administration access was denied during this audit; the owner must verify required checks separately. Live browser QA stays outside the pre-deployment source gate to avoid blocking a release on a version that has not been deployed.
