## Meta developer dashboard progress — 11 November 2026

Verified in the authenticated BEFN Meta developer app (Facebook app ID 938461119197992, Threads app ID displayed separately):

- `threads_profile_discovery` was added to **New requests** in App Review and verified present after page refresh.
- The review wizard advanced to **Allowed usage**; the specific `threads_profile_discovery` justification was entered, the allowed-usage agreement was checked, and the draft was saved.
- The live Meta Testing screen still displays **0 of 1 API calls required** for `threads_profile_discovery`. This is **not complete**.
- The existing GitHub-side Threads API token passes `GET /me` (HTTP 200) but returns HTTP 403 / Meta code 10 for both `GET /profile_lookup?username=threads` and `GET /profile_posts?username=threads`. Whether this token has the required Threads-specific permission scope has not been confirmed; do not claim the precise cause is known.
- **No screencast** demonstrating an actual OAuth/profile-lookup flow has been uploaded. BEFN public static website does not yet expose a functioning secure end-to-end OAuth and Threads profile discovery interface.
- **App Review has NOT been submitted**, and the Meta app is still in development.

Important distinction: the general **Facebook Graph API Explorer** may generate Facebook Graph tokens; do not assume these are valid **Threads user tokens** for graph.threads.net. A proper Threads OAuth connection must request the actual `threads_basic` and `threads_profile_discovery` scopes, then a permission-specific successful request must be checked in the Meta Testing screen. API test success may take up to 24 hours to appear there.

# Meta App Review: threads_profile_discovery — Black Eye Fight News

Updated: 11 November 2026

## Purpose

BEFN's public Fight Talk feature provides an editorial source-linked feed of actual combat-sports posts and a documented fighter directory. It tracks original public Threads accounts belonging to combat-sports athletes, promoters, organisations and publishers.

With advanced permission, `threads_profile_discovery` would let the backend retrieve a curated public Threads profile and its original public posts, properly attributing account identities and direct post URLs. Editorial readers can compare the announcements and publicly expressed positions of competitors and related organisations. The Meta permission specifically describes discovering public profiles and public posts to conduct competitor analyses. Do not imply that private account metrics, direct messages or private posts are available.

## Meta App Review description (paste into Meta)

Black Eye Fight News (BEFN) is an independent, non-commercial combat-sports news and information platform covering boxing, MMA, wrestling and grappling. Our Fight Talk feature helps readers discover the original public Threads accounts and posts of relevant fighters, champions, contenders, prospects, promoters and combat-sports organisations.

We request threads_profile_discovery to identify and retrieve public Threads profiles from a curated directory of independently sourced public accounts and obtain public posts from those accounts. This helps our users compare public statements and announcements from relevant competitors and promotions, follow original athlete updates and review competitive developments within a division or organisation. For example, a reader following UFC lightweight competitors can examine original public posts from relevant athletes, while a boxing reader can compare public statements by fighters and promoters.

The permission is required to use Threads' profile_lookup and profile_posts API operations for other public Threads accounts; threads_basic alone does not provide general third-party public profile discovery. We display the public author's identity and link to the original Threads post. We do not collect private posts or messages, access private insights, or publish, edit or delete posts on anyone's behalf. Backend access tokens are held securely and are not exposed to visitors. Data handling is described in our published Privacy Policy.

## Live test outcome — 11 November 2026 (AEDT)

The authenticated GitHub Action successfully ran against the configured `THREADS_ACCESS_TOKEN`. Sanitised run result is stored at `data/meta-threads-profile-discovery-test.json`:

- `GET /me?fields=id` — HTTP **200** (basic Threads token valid)
- `GET /profile_lookup?username=threads` — HTTP **403**, Meta error **10**
- `GET /profile_posts?username=threads&fields=id,username,permalink,timestamp&limit=3` — HTTP **403**, Meta error **10**
- Meta Testing 1/1 counter, advanced access approval and reviewer upload — **not verified**

This indicates the supplied token does not currently have permission for public profile discovery. It is not evidence that Meta has awarded advanced access or counted a qualifying successful test. In Meta's Threads app configuration, confirm `threads_profile_discovery` is enabled for the correct app; ensure the token was generated/reauthorised with `threads_basic` plus `threads_profile_discovery`, and the account is an authorised test/developer user. Do not paste token or app secret into ChatGPT, GitHub source files, issues or recordings. Replace the GitHub Actions secret with the newly authorised token, then manually rerun the workflow. Test success for @threads is not equivalent to advanced access to ordinary fighters.

**End-to-end reviewer screencast still blocked**: current static website has no secure OAuth callback + backend data-access service or running profile-discovery UI. Implement and deploy an actual secure feature first; do not upload a mock recording. **Meta review submission still needs the authorised app owner to complete Meta's form.**

## API proof — complete Meta Testing 1/1

1. Confirm `THREADS_ACCESS_TOKEN` is configured as a GitHub Actions secret (spelling without hidden characters: `THREADS_ACCESS_TOKEN`). This must be a valid user token issued by your Threads app and with `threads_basic` and `threads_profile_discovery` granted. It cannot be a Facebook/Instagram token.
2. Open the [Meta Threads profile discovery test workflow](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/actions/workflows/check-threads-profile-discovery.yml).
3. Choose **Run workflow** → **main** → **Run workflow**.
4. Open the run's **Test Meta Threads public profile lookup and posts** step. Look for `THREADS_DISCOVERY_PROFILE: OK`; `THREADS_DISCOVERY_POSTS: OK` confirms the posts endpoint too.
5. Check the Meta Developer Dashboard's **Testing** tab for the `threads_profile_discovery` row. Meta indicates successful calls can take up to 24 hours to appear.

The test uses Meta's publicly documented:
- `GET https://graph.threads.net/v1.0/me?fields=id` (verify basic login)
- `GET https://graph.threads.net/v1.0/profile_lookup?username=threads` (permission-specific)
- `GET https://graph.threads.net/v1.0/profile_posts?username=threads&fields=id,username,permalink,timestamp&limit=3` (permission-specific)

The `threads` username is one of Meta's official standard-access lookup accounts and is intentionally used as a safe eligibility check. Being able to retrieve `@threads` before approval **does not** mean arbitrary fighter accounts work. Broad third-party lookup needs Advanced Access approval and eligible public profiles.

## Screencast — must be a REAL interaction, not a mocked screen

Meta asks for a video demonstrating OAuth in the application and the end-to-end use of the requested permission.

1. Start recording the actual BEFN app and any real Threads OAuth connection flow once implemented, showing authorisation scopes. DO NOT expose app credentials or user tokens.
2. Navigate to Fight Talk and a fighter's directory/profile.
3. Show a public Threads profile and recent original posts fetched from the approved API using the connected app, with clear attribution and post links. If third-party access is still restricted during review, use an eligible official Meta test profile in the demonstration and explain the limitation in reviewer notes.
4. Demonstrate the benefit of discovering and comparing public accounts/posts in BEFN rather than only displaying a static list of links.
5. Include the full browser return to BEFN and actual on-screen results.
6. Upload the video and complete reviewers' login instructions and data-handling declarations.

**Current blocker:** BEFN is a Render static site. Its public Fight Talk directory and verified post links exist, but there is no live visitor-facing OAuth authorisation or public-profile lookup UI wired to Meta's profile API. The above review recording cannot truthfully be completed until the secure authorisation/backend and working UI are implemented. Do not claim approval or a complete demo before then.

## Relevant policies and public URLs

- Privacy: https://black-eye-fight-news.onrender.com/privacy.html
- Data deletion: https://black-eye-fight-news.onrender.com/data-deletion.html
- Application homepage: https://black-eye-fight-news.onrender.com/
- Official Meta Postman API example: https://www.postman.com/meta/threads/request/34203612-d5ea7186-5329-4c76-bbb6-3dd408e508b5
- Official Meta public profile posts example: https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api

## Requested access level

`threads_basic` dependency and `threads_profile_discovery` for public profiles and posts. Avoid asking for post publishing, account insights, private messages or other unrelated permissions. Advanced Access is needed for unrelated public accounts; Meta has policy/rate/eligibility restrictions.
