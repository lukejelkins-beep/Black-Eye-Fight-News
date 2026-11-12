# Continuous UFC profile research – BEFN

The existing budgeted workflow \`.github/workflows/ufcalendar-rich-backfill.yml\` collects UFCalendar bouts, profiles and career research. Do **not** duplicate these API requests: its cap protects against monthly overage.

## Two independent workers

1. **GitHub Actions queue compiler**: \`.github/workflows/build-ufc-profile-queue.yml\`, scheduled at five-minute intervals on \`main\`. Reads existing saved UFCalendar UFC bout records; never calls an external API; writes \`data/ufc-profile-research-queue.json\` only when the candidate list changes. GitHub scheduled runs are best-effort and may be delayed. The list is *not* an official active UFC roster.
2. **ChatGPT recurring AI researcher**: the existing hourly \`Complete UFC fighter profiles\` task should first read the candidate queue, identify the next unreviewed fighters, check each athlete's CURRENT UFC membership and dated official rankings, independently research primary sources for non-API credentials (NCAA, Olympic judo, ADCC, IBJJF/BJJ, Combat Sambo, Golden Gloves), and produce individually evidence-backed fighter profiles. It must not invent titles, medals, belts or statistics. A cited claim is not automatically a verified claim.
3. **Publish gate**: save fully researched and validated athletes in \`data/ufc-ranked-profiles.json\`, \`data/ufc-contender-profiles.json\`, \`data/ufc-prospect-profiles.json\` or \`data/ufc-roster-profiles.json\`. Each file has \`schema:1\`, \`scope:"ufc-only"\`, \`reviewedOn: "YYYY-MM-DD"\`, and a \`fighters\` object of fully reviewed profiles. Each athlete needs \`id\`, \`name\`, \`organisation:"UFC"\`, \`sport:"MMA"\`, \`category\`, \`record\`, \`division\`, \`source\` pointing to a real UFC biography, \`review:{checkedAt,credentialsChecked:true,notes:[...]}\`, \`latest\` verified UFC results, and \`credentials:[]\` (explicitly empty if none verified). Optional \`verifiedStats\` must cite a UFC-only denominator, a dated snapshot and leave missing numerical properties absent/null. The UI loader adds only reviewed profiles; the existing card-model and profile validator enforce scoring integrity.

No verified current official ranking is currently stored in this queue; do not label candidates ranked merely because they were on a UFC card. Preserve the latest main branch feeds during parallel updates. No user tokens or provider raw-response databases in the public site.

## Not supported without separate setup

GitHub Actions cannot invoke ChatGPT's recurring research task. An autonomous AI researcher running entirely inside GitHub would need an AI model API, explicit authorisation and securely stored key, a source-search provider, rate/cost controls and verification safeguards. None of those credentials should be guessed or silently provisioned. This implementation uses the already-authorised hourly ChatGPT researcher and GitHub for the persistent, frequent data queue.
