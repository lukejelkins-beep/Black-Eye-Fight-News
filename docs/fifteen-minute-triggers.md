# Getting news to update every 15 minutes

## The problem
`refresh-news` and `refresh-language-news` are scheduled every 15 minutes, but GitHub delays scheduled workflows when it is busy. The last eight news runs on 19 Nov started about an hour apart. A schedule is a request, not a promise.

## The fix: a free Cloudflare Worker starts the jobs on time
A Worker with a cron trigger calls GitHub's "run this workflow" address every 15 minutes. GitHub runs it straight away. The GitHub schedule stays in place as a backup. Cloudflare Workers cron triggers are free on the free plan.

Cost: nothing. Risk: the token below can start workflows in this repo, nothing else.

### One-time setup (about 10 minutes, owner)
1. GitHub, Settings, Developer settings, Fine-grained tokens, Generate new token.
   - Repository access: only `Black-Eye-Fight-News`.
   - Permissions: Actions: Read and write. Nothing else.
   - Expiry: 1 year (set a reminder).
2. Cloudflare dashboard, Workers & Pages, Create Worker, name it `befn-news-trigger`, paste the code below, Deploy.
3. In the Worker's Settings, Variables and Secrets, add a secret named `GITHUB_TOKEN` with the token from step 1.
4. In the Worker's Settings, Triggers, add a Cron Trigger: `*/15 * * * *`.
5. Check: Actions tab should show a "workflow_dispatch" run of Refresh news feeds every 15 minutes.

### Worker code
```js
const REPO = 'lukejelkins-beep/Black-Eye-Fight-News';
const WORKFLOWS = ['refresh-news.yml', 'refresh-language-news.yml'];

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(Promise.all(WORKFLOWS.map(file =>
      fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${file}/dispatches`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'befn-news-trigger',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref: 'main' }),
      }).then(r => { if (!r.ok) console.log(file, r.status); })
    )));
  },
};
```

### Safety
- The jobs share one lock (`publish-live-data`), so two runs never write at once; an extra trigger just waits.
- A second trigger while one is running is harmless: the job only commits when data changed.
- If the token expires the Worker logs a 401 and GitHub's own schedule keeps working at its slower pace.
- To stop: delete the Cron Trigger in Cloudflare. Nothing in the repo needs changing.
