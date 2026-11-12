# GitHub-hosted editorial calendar maintenance

## Scheduled workflows

- \`.github/workflows/refresh-upcoming-cards.yml\`: every three hours, checks primary sources for existing boxing and MMA event entries, verifies event access and reports changed source pages. Adds new named **boxing** pairings only when the schedule/source and exact existing main-event identity agree. UFC/PFL event/bout archives also update in \`ufcalendar-rich-backfill.yml\`; the public upcoming interface reconciles supported, non-conflicting archive updates. This is *not* an autonomous semantic source researcher for every promotion. Fighter record and source conflicts require editorial QA. GitHub scheduled runs may be delayed.
- \`.github/workflows/refresh-grappling-calendar.yml\`: daily, checks official RAF, UFC BJJ, IBJJF, ADCC, NCAA, UWW and ONE calendars and existing event source URLs. Adds only **new numbered RAF events explicitly dated on the RAF organiser schedule**. Mismatching event dates go into a QA artifact for review; the workflow never guesses matchups, rewrites opponents, infers start times, marks cancellations or fabricates broadcast access. Source outages retain existing data. Future expansion should add individually tested parsers for the other organisers rather than loosely parsing links or static promotional text.
- \`.github/workflows/source-event-posters.yml\` and \`.github/workflows/refresh-results.yml\` continue independently.

## Safe handoff from ChatGPT scheduled tasks

GitHub is responsible for routine automated refresh and source monitoring. Open-ended research—especially newly announced non-RAF grappling events, full MMA promotion cards, late opponent changes, cancellation and historical bracket outcomes—needs an individually verified editorial research pass or additional authorised structured integrations. If those are disabled in ChatGPT, coverage may be narrower; do not claim that source-monitoring alone duplicates the original AI tasks. Revisit the scope when a new organiser parser is added.

Deploy only commits with material data changes. The audit artifacts in GitHub Actions identify unreachable source pages and discrepancies; they are **not** published as verified data. All new discoveries require official source, event date, stable ID, consistent identity, no duplicates and no fabricated pairings. The public site's source-linked existing entries are preserved if no update can be verified.

Do not commit newsletter content, private reports or subscriber data to this repository.
