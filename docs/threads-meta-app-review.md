# Meta Threads App Review — BEFN

Updated 11 November 2026. This document distinguishes live features from review prerequisites.

## Actual app status

- The current BEFN website is a public static site (Render).
- Public Fight Talk displays source-linked original Threads posts and embeds, and may query keyword search if authorised.
- There is currently **no public Threads sign-in flow** or built-in owner-analytics dashboard.
- The `threads_manage_insights` permission **cannot** grant access to analytics of fighters who have not connected their own Threads accounts. Do not request this permission just to display public Threads posts.
- For combat-sports public post discovery, assess `threads_keyword_search` and/or `threads_profile_discovery`, in addition to `threads_basic`, against the official Meta docs and review rules.

## Public pages and assets

- Privacy policy: https://black-eye-fight-news.onrender.com/privacy.html
- Data deletion instructions: https://black-eye-fight-news.onrender.com/data-deletion.html
- Terms: https://black-eye-fight-news.onrender.com/terms.html
- Current BEFN app icon: https://black-eye-fight-news.onrender.com/assets/icon-512.png

Verify these URLs open in a normal, non-logged-in browser before submission.

## What Meta requests for `threads_manage_insights`

1. Describe **existing** use of authorised-account profile and post insights. Do not represent planned features as live.
2. Demonstrate the full Threads OAuth authorisation experience within the app.
3. Demonstrate the real account-level insights view and individual-post analytics view, derived from live API calls for the connected account.
4. Complete at least one permission-specific successful test call. In the Meta dashboard visit **Testing** and check the counter. Meta indicates propagation may take up to 24 hours.
5. Confirm allowed use, supply reviewer access/instructions, complete data-handling questions and submit.

The current static application does **not** meet (2) and (3); a review screencast cannot be truthfully recorded yet.

## Optional permission-specific API test

An existing GitHub Actions secret named `THREADS_ACCESS_TOKEN` may hold an authorised Threads user token. Never paste it in GitHub issues, commits, screenshots or browser files.

Run the manual GitHub Action named **Meta Threads insights permission test**. It runs:

- `GET https://graph.threads.net/v1.0/me?fields=id` (`threads_basic`)
- `GET https://graph.threads.net/v1.0/me/threads_insights?metric=views` (`threads_manage_insights`)
- If an authored post exists: `GET /me/threads?fields=id&limit=5` then `GET /{owned-post-id}/insights?metric=likes,replies`

The workflow logs only status, HTTP status and safe Meta error codes. `THREADS_INSIGHTS_ACCOUNT: OK` confirms the insight call succeeded; **it does not confirm Meta has updated its 1/1 testing counter**. The workflow is manual-only to avoid surprise failure emails.

## Permission text (only after the owner insights interface really exists)

> Black Eye Fight News allows a Threads account owner to explicitly connect their own Threads account through the Threads OAuth authorisation flow. With the account owner's approval, the application requests `threads_basic` and `threads_manage_insights` to display that account's Threads profile performance and the engagement of individual posts created by that account. The metrics include available account views/follower information and post-level likes, replies, reposts and views. These metrics help the authorised account owner evaluate how their published combat-sports posts perform and which coverage resonates with their own audience. This permission is necessary for the account-level and post-level analytics interface; public Threads search and embedding alone do not require this permission. Metrics are not retrieved for unauthorised third-party accounts, and access tokens are not exposed through the public website. No posting, deletion or private messaging occurs as part of this insights feature.

Do **not** paste this text into App Review before that function is implemented and shown in the recording.

## Suggested truthful screencast outline after implementation

1. Open BEFN in a fresh session.
2. Show **Connect Threads** and the full OAuth consent and permission scope screen. Use a legitimate test account with a role in the Meta app.
3. Return to BEFN and show the connected profile, followed by its actual insights metrics.
4. Open an authored post and show likes/replies/other metrics returned from its insights endpoint.
5. Show disconnect/revoke, if available. Do not show access tokens, app secrets or personal information.
6. Upload the unedited recording to Meta's App Review permission form.

## Best path for BEFN Fight Talk

Prioritise platform permissions that deliver actual authorised *public post discovery* instead of a separate analytics feature. For `threads_manage_insights`, either implement a legitimate account-authorised analytics UI first or remove that permission from the current review request. There is no benefit in requesting unnecessary scopes.
