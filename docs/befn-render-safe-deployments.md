# BEFN safe Render deployments

Repository: `lukejelkins-beep/Black-Eye-Fight-News`. Render static site: `srv-dbnftjqjnfac73c9746g`.

## What is automated

- `.github/workflows/befn-release-readiness.yml`: source-only tests on **every** `main` commit. No external fight-data API calls. A green result is source-validation, not a verified production release.
- `.github/workflows/befn-render-deploy-recovery.yml`: checks critical public asset hashes against Render at **31 minutes past every second UTC hour**, plus manual dispatch. It skips releases when everything already matches, when GitHub main changed during the check, when the exact source revision has no passing BEFN release-readiness run, or when Render converges while the check is running.
- If approved and configured, the recovery workflow uses one **secret deploy hook**, waits for the Render static assets to match its source checkout, and requests the separate production browser QA workflow.
- `.github/workflows/verify-live-ufc-profiles.yml`: independent **hourly** or manually dispatched live profile QA. It must not run as a prerequisite GitHub check for undeployed new code, because this would deadlock conditional auto-deployment.

## One-time secret configuration

1. In [Render Dashboard](https://dashboard.render.com/static/srv-dbnftjqjnfac73c9746g), open **Settings**, locate **Deploy Hook**, and copy its private URL.
2. In [GitHub Actions secrets](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/settings/secrets/actions), create a **repository secret** named exactly `RENDER_DEPLOY_HOOK_URL` containing the entire private URL.
3. **Never** commit the hook URL to GitHub files, issue comments, logs, or chat messages.

If this secret is absent, the recovery workflow checks drift and reports the setup gap, but **does not deploy**.

## Main auto-deploy settings

For a *connected* GitHub provider, select Render **Settings → Auto-Deploy → After CI Checks Pass**. Render then deploys commits with passing GitHub checks; the two-hour recovery workflow is a backup. If this mode is unavailable because the Render service uses an unlinked public repository, establish a proper GitHub integration or use the deployment hook. In that alternative, switch Render auto-deploy off to avoid racing two independent deploy systems, leaving the scheduled GitHub workflow as the publisher.

**Do not** change auto-deploy modes in a way that disables both paths before the deploy hook is configured and its first release verified.

## Safety boundaries and limitations

- Deploy checks watch the published HTML, service worker, main CSS/JS, results, upcoming fight cards, Fight Talk, Fight Film, news, and UFC profile JSON. Non-displayed research worklogs and scripts do not trigger a deployment. Review the watch list when adding new public-facing pages or data feeds.
- The hook deploys the then-current GitHub branch; the controller checks source HEAD immediately before requesting it, but a simultaneous new commit is still a race to consider. QA detects drift; no automatic rollback is attempted.
- A hook success means **deploy requested**, not **deploy completed**. Source integrity, actual Render asset freshness, custom-domain CDN convergence, browser layout QA, and independent fight-data truth are distinct checks.
- The public CDN can lag the Render hostname. Diagnose a stale custom domain before creating a second deployment.
- The controller does not spend UFCalendar API quota and does not occupy any of the five ChatGPT UFC research automation slots.
