## Verified review state — 11 November 2026, after successful live user lookup

The BEFN owner reports that the official @threads public profile **and its real posts** appeared successfully after connecting via the deployed OAuth page. The technical UI flow now works for this test. However, a fresh inspection of the Meta Testing dashboard **still shows threads_profile_discovery: 0 of 1 qualifying API calls**, with threads_basic marked Completed. Meta notes that test-call credit may take up to 24 hours. Do not represent the testing requirement as complete until Meta's own counter changes.

Read-only inspection of App Review > Allowed Usage > threads_profile_discovery showed that the **description field is empty, compliance checkbox unchecked, and no screencast uploaded** despite an earlier agent attempt to save the description. A subsequent attempt to navigate and save the description did not complete, so the current saved state is **unverified / apparently blank**. The form requires a genuine screen recording incorporating Threads OAuth authorization and actual public-profile lookup; do not upload mock content.

Several other unrelated Instagram, Page and Threads permissions are queued in the same App Review submission. Their requirements are not fulfilled. They need separate proper review preparation or must be excluded intentionally before the whole submission can proceed.

# BEFN Threads Discovery — OAuth Demonstration

Updated 11 November 2026.

## Services

- Main BEFN and Fight Talk: https://black-eye-fight-news.onrender.com/
- New real OAuth demonstration: https://befn-threads-review.onrender.com/
- Server health: https://befn-threads-review.onrender.com/health
- Render service: https://dashboard.render.com/web/srv-dbptak3rjlhs73b1na0g
- Meta review: https://developers.facebook.com/apps/938461119197992/app-review/submissions/?business_id=1155225336843859
- Threads API settings: https://developers.facebook.com/apps/938461119197992/use_cases/customize/settings/?business_id=1155225336843859&use_case_enum=THREADS_API

The site uses a separate Node.js server for the OAuth callback, so the existing static BEFN news and fight feeds are not replaced. Fight Talk links to the demo.

## Built and deployed

- Branded public Threads account-connection, public profile discovery and original post viewer.
- OAuth authorization code and server-side token exchange; state binding to secure session cookie.
- Read-only scopes: threads_basic, threads_profile_discovery.
- HttpOnly Secure SameSite=Lax session, CSRF state, request cap, exact username checks, original Threads permalink validation.
- Credentials never published to website files or stored in GitHub source or JSON.
- Meta Threads App ID 4196682880463202 (distinct from Facebook App ID).
- Registered redirect URI https://befn-threads-review.onrender.com/oauth/callback confirmed saved in Meta.
- App domain befn-threads-review.onrender.com confirmed saved in Meta.
- Free Render Node service in Singapore; automatic Node tests passing in first deployment.
- Backend sessions in memory only: cold-starts and frequent redeploys can interrupt a login; reconnect if needed. For production, use shared session storage or disable auto-deployment on unrelated source changes.

## Action required to activate OAuth

Meta demanded the owner's password confirmation to reveal the Threads App Secret. The administrator should do the following themselves in authenticated pages; never paste the secret or password into chat or GitHub.

1. Open Meta's Threads use case settings link above; reveal the **Threads App Secret** only after completing normal identity confirmation.
2. Open the Render Environment page https://dashboard.render.com/web/srv-dbptak3rjlhs73b1na0g/env
3. Add the **THREADS_APP_SECRET** environment variable and paste the matching Threads App Secret directly into the private value field. Save and deploy.
4. Do not use the Facebook App Secret; they are different.
5. Verify that https://befn-threads-review.onrender.com/health responds with oauthConfigured = true. Then load the homepage and choose Connect Threads account.
6. Sign in and grant read-only scopes.

Other configured server-side values: THREADS_APP_ID=4196682880463202; PUBLIC_BASE_URL=https://befn-threads-review.onrender.com. Render injects PORT.

## Qualifying Meta permission API calls

Once a real Threads OAuth session succeeds, the page calls:

- GET https://graph.threads.net/v1.0/me?fields=id,username
- GET https://graph.threads.net/v1.0/profile_lookup?username=threads
- GET https://graph.threads.net/v1.0/profile_posts?username=threads&fields=id,username,text,timestamp,permalink,media_type&limit=5

Use Meta's public @threads account first because Standard Access may be limited to Meta official accounts. A genuine successful permission-specific response is needed for Testing 1/1; Meta says the counter may take up to 24 hours. HTTP 403 or Meta error code 10 is a failure, not a completed test. The previous developer token returned HTTP 200 for /me but 403 code 10 for profile discovery. New OAuth consent may be needed with the correct scope; successful access is not guaranteed.

## Truthful reviewer screencast

1. Start at BEFN Fight Talk and open the new Threads discovery preview.
2. Click Connect Threads; show the real Threads OAuth sign-in and consent screen with requested scopes.
3. Show return to BEFN and account connection status.
4. Look up @threads and show actual profile results and the original posts returned by Meta, then open one original Threads link.
5. If approved for third-party access, repeat with a documented public combat-sports fighter, promoter, or organisation account.
6. Demonstrate Disconnect.
7. Upload only a genuine screen recording, not a mockup, and review every claim in Meta's saved description against actual functionality.

The production account-management service would need persisted encrypted sessions, token renewal, comprehensive operational monitoring and deployment separation. This version is a non-commercial API review prototype, not a fully launched account login system.

## Deletion and privacy

The server retains the authorised account's token only in temporary server process memory for a maximum session age of 12 hours. Disconnect removes it from the process. Users can revoke authorisation at Threads. The public BEFN privacy and data deletion pages describe their rights.

## Tests

Run the security and server-route tests without any credentials:

    node --test threads-review/test.mjs

Never add credentials to source control.
