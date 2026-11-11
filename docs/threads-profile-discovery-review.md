# Meta App Review: threads_profile_discovery — Black Eye Fight News

Updated: 11 November 2026

## Purpose

BEFN's public Fight Talk feature provides an editorial source-linked feed of actual combat-sports posts and a documented fighter directory. It tracks original public Threads accounts belonging to combat-sports athletes, promoters, organisations and publishers.

With advanced permission, `threads_profile_discovery` would let the backend retrieve a curated public Threads profile and its original public posts, properly attributing account identities and direct post URLs. Editorial readers can compare the announcements and publicly expressed positions of competitors and related organisations. The Meta permission specifically describes discovering public profiles and public posts to conduct competitor analyses. Do not imply that private account metrics, direct messages or private posts are available.

## Meta App Review description (paste into Meta)

Black Eye Fight News (BEFN) is an independent, non-commercial combat-sports news and information platform covering boxing, MMA, wrestling and grappling. Our Fight Talk feature helps readers discover the original public Threads accounts and posts of relevant fighters, champions, contenders, prospects, promoters and combat-sports organisations.

We request threads_profile_discovery to identify and retrieve public Threads profiles from a curated directory of independently sourced public accounts and obtain public posts from those accounts. This helps our users compare public statements and announcements from relevant competitors and promotions, follow original athlete updates and review competitive developments within a division or organisation. For example, a reader following UFC lightweight competitors can examine original public posts from relevant athletes, while a boxing reader can compare public statements by fighters and promoters.

The permission is required to use Threads' profile_lookup and profile_posts API operations for other public Threads accounts; threads_basic alone does not provide general third-party public profile discovery. We display the public author's identity and link to the original Threads post. We do not collect private posts or messages, access private insights, or publish, edit or delete posts on anyone's behalf. Backend access tokens are held securely and are not exposed to visitors. Data handling is described in our published Privacy Policy.

## API proof — complete Meta Testing 1/1

1. Confirm `THRE​​ADS_ACCESS_TOKEN` is configured as a GitHub Actions secret (spelling without hidden characters: `THREADS_ACCESS_TOKEN`). This must be a valid user token issued by your Threads app and with `threads_basic` and `threads_profile_discovery` granted. It cannot be a Facebook/Instagram token.
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
