# Meta Instagram Business Discovery — BEFN review preparation

Last checked: 11 November 2026. Meta app ID: 938461119197992. Status: **draft only; not submitted**.

## What BEFN does

Black Eye Fight News (BEFN) is a non-commercial combat-sports editorial website and installable web app. Its **Fight Talk** area links or embeds original, publicly available posts from fighters, promotions and fight-media accounts, with source attribution and original permalinks. Instagram API access is used **read-only** to discover the public profile and recent media of eligible Business/Creator (professional) Instagram accounts. The collector never publishes posts, reads private messages, modifies content or tries to access personal/consumer Instagram accounts.

Website: https://black-eye-fight-news.onrender.com/
Privacy policy: https://black-eye-fight-news.onrender.com/privacy.html
Data deletion instructions: https://black-eye-fight-news.onrender.com/data-deletion.html

## Authentication and scope

BEFN's current collector uses **Instagram Graph API with Facebook Login**, making requests to `graph.facebook.com` using a developer-authorized Facebook User access token and a linked professional Instagram account. It does **not** use Instagram Login or `instagram_business_basic`.

Scopes and features to review:

| Permission / feature | Why needed |
| --- | --- |
| `instagram_basic` | Identify the authorized professional Instagram account and access permitted professional account metadata. |
| `instagram_manage_insights` | Instagram Business Discovery: query public professional account profiles and available public media, as explicitly supported by the Meta Instagram API with Facebook Login. BEFN does not require private audience analytics from other accounts. |
| `pages_read_engagement` | Required supporting permission for Page-linked Instagram access via Facebook Login. |
| `pages_show_list` | Identify the Facebook Page linked to the authorized professional Instagram account. |
| Instagram Public Content Access | Include only if Meta determines this feature is required for the exact endpoint and access BEFN demonstrates; it is already in the draft. |

Do **not** request permissions to publish, manage DMs, manage comments, or run ads for this feature. A separate Threads API integration has its own permissions and review requirements; do not silently remove those from the app.

## Reviewer-facing use case text

> Black Eye Fight News is a non-commercial combat sports news and results site. Its Fight Talk section showcases attributed links and embeds of original public posts from professional athletes, promotions and sports media. A site administrator authorizes BEFN to use a Facebook Page-linked professional Instagram account via Facebook Login. BEFN uses the Instagram Graph API Business Discovery endpoint to look up eligible public professional Instagram profiles and permitted public media, including usernames, media dates, media types and original permalinks. These are used to link or embed original posts in the website's read-only feed. BEFN does not access consumer/private Instagram accounts, collect private messages, publish on a connected account or modify third-party content. Readers can open the original Instagram post for its full context.

## Reproducible reviewer demonstration — not yet complete

A genuine demo must show **both** how the developer authorizes the linked professional Instagram account and how the enabled API response feeds real posts into BEFN.

1. Show the real authorization or approved-app test-user Facebook Login flow for an authorized professional Instagram account linked to a Facebook Page. The BEFN public website does **not currently provide a general visitor Instagram login form**; do not imply that it does.
2. In Meta Graph API Explorer or the app's secured diagnostic, demonstrate the linked professional account ID and required granted scopes **without showing raw access tokens, app secrets or private data**.
3. After approval/permission grant, request a real `business_discovery.username(ufc)` public professional profile/media sample through `graph.facebook.com`. Show the HTTP result and attributed public media fields. If Meta returns code 10, label the test **blocked**, not successful.
4. Open BEFN's Fight Talk view and show original linked/embedded Instagram posts that are actually backed by the authorized source. Distinguish API-discovered posts from independent publisher-linked embed fallbacks.
5. Record a short continuous screencast (login authorization → successful API Business Discovery query → actual feed display) and attach it through Meta's review interface, with credentials and private account identifiers hidden.

**Current limitation:** Prior API checks return HTTP 400 code 10 for Business Discovery. Adding `instagram_manage_insights` to the app review draft does **not** grant it to an existing token or make this demonstration succeed. Confirm the linked Page/professional account, granted scopes, Meta approval and token renewal before recording a success demo.

## Evidence / acceptance checklist

- [x] App icon uploaded
- [x] Public privacy policy URL saved in Meta
- [x] Public data-deletion URL saved in Meta
- [x] `instagram_manage_insights` added to App Review draft (not submitted)
- [x] `pages_show_list` and `pages_read_engagement` in review draft
- [x] Instagram Public Content Access appears in review draft
- [ ] Confirm `instagram_basic` access/status required by review; currently ready for testing but absent from new requests list
- [ ] Verify effective granted scopes from `.github/workflows/check-instagram-connection.yml` and safe `INSTAGRAM_SCOPE` diagnostic messages
- [ ] Confirm the Facebook Page-to-Instagram professional-account association for the source token
- [ ] Obtain a real successful Business Discovery response (no fabricated demo responses)
- [ ] Capture reviewer screen recording and screenshots, masking credentials
- [ ] Complete the Meta reviewer instructions in the actual review form once accessible
- [ ] Obtain app review approval and make any appropriate publication changes

## Operational safeguards

Keep the authorization token in GitHub Actions secrets only; never expose it in website source, workflow logs, public JSON or review screenshots. Restrict source discovery to professional Instagram accounts and original posts allowed by the API. Maintain correct post timestamps/attribution and avoid inventing captions or claiming connection when API access fails.
