# Fight card feed

`data/results.json` contains the complete enrolled card rosters and event metadata.
`refresh-results.py` merges recognized result headlines from UFC official main/prelim reports and FIGHTMAG result lists. The five-minute GitHub workflow publishes data; the browser polls the repository every minute, falling back to the deployed copy. GitHub schedules and publishers can be delayed. No API key is needed.

Add future cards with stable event and bout IDs, the entire announced roster, `expectedBouts`, source URLs in `feeds`, the event date, and a conservative UTC `liveUntil` cutoff. Set `mainBoutId` for automatic main-event promotion after completion. Add three sourced editorial `takeaways`; these are editorially maintained, with the first replaced by the confirmed main-event outcome on completion. An event is not live solely because its scheduled time has elapsed. The updater requires recognized results, and the live badge expires after 15 minutes without a successful check.

Freeze sourced `preRecord` values as wins-losses-draws. Confirmed outcomes derive post-fight records from that base on every pass, avoiding double increments. Preserve no-contests separately. Missing records are explicitly unverified. Unsupported outcomes, changed opponents and newly added/cancelled bouts need editorial review; never infer a result. Review the expected roster count when a card changes.

Ordinary source failures retain all prior results and mark the feed delayed. Partial reports never delete completed bouts. Automated source checks cover yesterday through three days after each event; use `python scripts/refresh-results.py --all` to recheck older cards. The job intentionally does not continuously poll the historical archive. Tests: `python -m unittest discover -s tests -p test_results.py` and `node tests/test-results-ui.cjs`.
