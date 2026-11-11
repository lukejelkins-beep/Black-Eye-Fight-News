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

## Platform questionnaire accuracy (action required in Meta)

The user-facing BEFN website does **not currently** implement Facebook Login with an OAuth redirect/callback or a visitor login button. Its backend's developer-authorized Facebook Graph API token is **not** equivalent to Facebook Login being integrated *on the Website platform*. If the Meta Website reviewer questionnaire asks **"Is Facebook Login integrated on this platform?"**, the truthful answer is **No** unless/until an actual Website Facebook Login flow exists.

The Meta browser initially saved **Yes** on 11 November 2026. **Corrected to No and verified persistent after reload on 11 November 2026**, using TinyFish. Reviewer instructions and Website platform remain saved. Do not misrepresent the site's features or produce a simulated successful login/API screenshot.

## Reproducible reviewer demonstration — not yet complete

A genuine demo must show **both** how the developer authorizes the linked professional Instagram account and how the enabled API response feeds real posts into BEFN.

1. Show the real authorization or approved-app test-user Facebook Login flow for an authorized professional Instagram account linked to a Facebook Page. The BEFN public website does **not currently provide a general visitor Instagram login form**; do not imply that it does.
2. In Meta Graph API Explorer or the app's secured diagnostic, demonstrate the linked professional account ID and required granted scopes **without showing raw access tokens, app secrets or private data**.
3. After approval/permission grant, request a real `business_discovery.username(ufc)` public professional profile/media sample through `graph.facebook.com`. Show the HTTP result and attributed public media fields. If Meta returns code 10, label the test **blocked**, not successful.
4. Open BEFN's Fight Talk view and show original linked/embedded Instagram posts that are actually backed by the authorized source. Distinguish API-discovered posts from independent publisher-linked embed fallbacks.
5. Record a short continuous screencast (login authorization → successful API Business Discovery query → actual feed display) and attach it through Meta's review interface, with credentials and private account identifiers hidden.

**Current limitation:** Prior API checks return HTTP 400 code 10 for Business Discovery. Adding `instagram_manage_insights` to the app review draft does **not** grant it to an existing token or make this demonstration succeed. Confirm the linked Page/professional account, granted scopes, Meta approval and token renewal before recording a success demo.

## Latest Meta App Review wizard status (11 November 2026)

- **App settings:** completed, 100%.
- **Reviewer instructions:** completed, 100%; Website platform URL saved, Facebook Login integrated on Website = **No** (verified after reload).
- **Verification:** incomplete; requires Meta identity/business verification by the authorized owner.
- **Allowed usage:** incomplete; questionnaire must be answered from actual operating practices.
- **Data handling:** incomplete; questionnaire must be answered from actual operating practices.
- **Submit for review:** disabled until the remaining steps are complete. No review was submitted.
- **Browser access:** TinyFish browser automation exhausted wallet balance before the Allowed usage questionnaire could be opened. Do not claim it was filled.
- **Most recent real Instagram access test:** `instagram_basic` GRANTED, but `instagram_manage_insights`, `pages_read_engagement`, and `pages_show_list` NOT PRESENT in existing token. Assigned Instagram account found but no Page-linked Instagram account in `/me/accounts`. Business Discovery failed HTTP 400 code 10.
- Adding review permission requests does not modify the existing access token. Once scopes are actually available, the authorizing person must go through the appropriate real Facebook Login OAuth grant/re-authentication and establish the linked Facebook Page/professional Instagram association. Do not hardcode fake results or publish a token.

## Meta App Review status after TinyFish wallet top-up — 11 November 2026

**Meta review remains a draft; not submitted.** The original user-funded TinyFish wallet top-up succeeded. Browser operations on the Meta app were performed.

### Wizard and permission scope

- **App settings** and **Reviewer instructions** are completed; Website Facebook Login answer was corrected to **No** and verified persisted.
- **Verification** is not complete. The Meta portfolio 'Black Eye Fight News' is **Unverified**. The Meta Graph App Review verification screen only displayed **Business verification**, using 'Start verification'; completing the business/identity record and any requested official documentation is an owner-only task. The availability of an alternative individual verification route for this specific Graph API app was **not** confirmed.
- **Allowed usage** is incomplete. The actual 'Review before submitting' wizard lists **13 requested permissions/features**, including Facebook Login Instagram scopes, the separate Instagram Login scope `instagram_business_basic` and several Threads requests. One `instagram_business_basic` description was saved (no screencast or permission test recorded). **This scope belongs to Instagram Login, not the site's current Facebook Login collector, so its necessity should be reviewed and it should not be justified as if it powers Business Discovery via graph.facebook.com.** The remaining permission-specific justification forms/screenshots and any API-test counters remain outstanding. Attempts to reach the dynamic 'Get started' entry for `pages_show_list` were unsuccessful; no such description was saved.
- **Data handling** is incomplete. One TinyFish session reported adding Render as a processor, but the later fresh form audit instead showed the **processors question marked No with an empty list**, indicating the initial entry was not reliably persisted. The responsible legal person/entity textarea was **empty**, and their country not selected. The national-security disclosure question appeared as No in the form but **was not verified by the project owner**; do not submit a legal declaration based on that default. Policies checkbox options were unselected. Verify the actual data processors (including Render and GitHub Actions), legal data controller, jurisdiction and law-enforcement disclosure history with the owner before completing.
- 'Submit for review' remained disabled.
- The current GitHub Actions credential-safe API probe shows `instagram_basic` granted, `instagram_manage_insights`, `pages_read_engagement`, `pages_show_list` not present on the token. One assigned Instagram asset appeared, but zero Page-linked Instagram accounts from `/me/accounts`. Business Discovery still failed HTTP 400 code 10. This means **no successful API demonstration exists** and user authorization or role/asset linkage must be corrected legitimately; no fake demo should be recorded.

### Pending decisions and recommended critical path

1. Establish whether the project has an appropriate **registered business/ABN or eligible individual route**, then have the authorized owner complete Meta's required verification using real matching documents. Never invent a company/legal identity.
2. Confirm the real person/entity responsible for Platform Data and their country, actual providers, historical disclosure answers and applicable security/process policies. Correct Data handling and verify saved fields.
3. Narrow the requested permission set to what the BEFN current integration actually uses, or intentionally prepare separate Threads review evidence. The current public site does not implement a visitor Facebook Login screen.
4. Complete the permission-specific Allowed usage justifications, ensure a legitimate grant for the prerequisite scopes, actual Page/professional-IG linkage and test calls, and capture genuine screenshots/screencast only after test works.
5. Confirm review submission status and only submit once complete and accurate.

## Personal-use Standard Access investigation — 11 November 2026

User has confirmed that BEFN is a **personal, non-commercial project**, not a registered business. Do not assume it has an ABN or company registration; do not enter invented business identity documents.

### Observed Meta UI

- App is still unpublished, and the linked Meta business portfolio still shows **Unverified**. Its App Review > Verification page offers **Business verification**, with no visible individual/admin alternative. Advanced Access review is therefore blocked or at least dependent on business-verification eligibility for this particular app.
- In Meta Graph API Explorer (`https://developers.facebook.com/tools/explorer/`), BEFN was selected under the owner's App Administrator role. The Facebook Login permissions `pages_show_list`, `pages_read_engagement`, `instagram_basic`, and `instagram_manage_insights` were all selectable for a test OAuth request **without being stopped at the picker by App Review**.
- Selecting these permissions and invoking **Generate Access Token** opened real Facebook consent. It first asked to continue as the authenticated account, then offered **"Opt in to all current and future Pages"** versus **"Opt in to current Pages only"**. The first option was the default. The assistant did not grant broad future Page access on the user's behalf.
- **No token was issued, no permission grant verified, and no Business Discovery test succeeded in that browser attempt.** A follow-up direct Graph API Explorer test selected all four scopes and opened Facebook consent: 'Continue as [account]?', followed by a Page-selection screen with a broad 'all current and future Pages' option preselected and a narrower 'current Pages only' option. The interactive consent was **not completed**, so no token was obtained; this cannot be counted as a successful Standard Access test. Therefore Standard Access is a plausible test route, **not yet a proven production solution**. API Explorer permission visibility alone does not establish data-access approval.
- The previously configured GitHub Actions token granted `instagram_basic`, but **not** `instagram_manage_insights`, `pages_read_engagement`, `pages_show_list`. It returned 0 Page-linked Instagram accounts from `/me/accounts` and HTTP 400 code 10 for `business_discovery.username(ufc)`.

### Meta Business Settings blocker

A separate read-only inspection of the BEFN Meta Business Portfolio's Instagram accounts / Pages settings was attempted. **Meta blocked inspection with a two-factor-authentication (2FA) security-code challenge for the new browser/device.** No Page-to-Instagram relationship could be confirmed from that view. The owner must complete the legitimate Meta security check before account/page linkage can be inspected. Do not treat the older `/me/accounts` empty result as proof no Page is linked, because that token lacks `pages_show_list` and `pages_read_engagement`.

### Safe owner consent and diagnostic procedure

1. Open Meta Graph API Explorer and choose the **Black Eye Fight News** app and **User Token**.
2. Select only `pages_show_list`, `pages_read_engagement`, `instagram_basic`, and `instagram_manage_insights`. Remove unrelated publishing, messages, comments permissions if present.
3. Click **Generate Access Token**. Read the actual Meta dialog. Prefer **"Opt in to current Pages only"** and select only the Facebook Page genuinely linked to the BEFN-authorized **Instagram Professional** account. Do **not** opt into all future Pages needlessly.
4. After consent, run `GET /me/permissions` and verify the four requested permissions are actually `granted`. Run `GET /me/accounts?fields=id,instagram_business_account{id,username}` **inside Graph API Explorer** and check there is a Page-linked Instagram professional account. Do not paste access tokens or private IDs into public chat, logs or repository.
5. Only if the linked IG asset and permissions are genuinely available, test the official Business Discovery request on a public professional target such as `ufc`. Avoid claims of success unless the API returns a real successful response.
6. If the test succeeds, plan secure token replacement in GitHub Secrets and rerun `.github/workflows/check-instagram-connection.yml` to confirm the deployed collector can work, subject to Meta terms and rate limits. If consent is denied or required Page absent, diagnose the exact Page-account association rather than spending on business verification.

**Decision:** Pause spending money or filing business registration solely for App Review; test this legitimate role-only authorization first. For the full third-party fighter feed, Advanced Access / the public content feature may still be mandatory; a successful test on one app-role account does not grant unrestricted production coverage.

## Facebook Page consent blocker — 11 November 2026

The user expressly authorized TinyFish to complete the Meta Graph API Explorer Standard Access OAuth consent on the signed-in account. In the BEFN app, exactly the four Facebook Login scopes `pages_show_list`, `pages_read_engagement`, `instagram_basic`, and `instagram_manage_insights` were selected; extra posting/messaging permissions were excluded. The consent dialog advanced to **"Opt in to current Pages only"** (chosen for least privilege), but displayed **"You don't have any Pages."** There was **no Facebook Page to grant access to** for this particular authenticated Facebook account, so OAuth could not finish, no new token was generated, and no further API test was possible. This does not establish that no Page exists under some other Facebook account or business portfolio.

**Next prerequisite:** Either (a) obtain Facebook Page access for this actual Facebook login to an existing Page linked to a professional Instagram account, or (b) with explicit owner authorization, create a BEFN Facebook Page and link a professional Instagram account, then retry the four-scope OAuth. Creating a public Page is a separate publishing decision and was **not** undertaken as part of the existing Page-consent request. Don't use a broad "all current and future Pages" grant.

## New public BEFN Facebook Page and OAuth test — 11 November 2026

- The user explicitly authorized creating a public Facebook Page. TinyFish confirmed a newly created, published Page **Black Eye Fight News**, category **News & media website**, URL **https://www.facebook.com/profile.php?id=61596616373694**, site link **https://black-eye-fight-news.onrender.com/**. It is managed by the signed-in account. No Facebook posts, advertising, WhatsApp integration, invitations, or paid services were created.
- A subsequent OAuth run in Graph API Explorer used Facebook Login and selected only `pages_show_list`, `pages_read_engagement`, `instagram_basic`, `instagram_manage_insights`; current Pages only, not all future Pages. The browser run reported a User Token generated, and **all four scopes granted** by `GET /me/permissions`. Do not infer that the repository's existing GitHub Actions secret token was replaced; it was not.
- `GET /me/accounts` was reported to return one accessible Facebook Page with **no `instagram_business_account` link**. The reported API Page ID differed from the published Page URL ID, and a follow-up read-only verification could not reconcile this because **the Graph Explorer token did not persist into the new session**. Recheck the returned Page's `name,id` against the newly created Page before treating it as the same Page. Never expose the token publicly.
- **No professional Instagram account is linked to the new Page yet**, and no Instagram account was created/converted. Consequently **Business Discovery is not proven working** and BEFN's stored Instagram token was not changed.
- The owner must select/authorize an Instagram **Professional** account to link to the new Facebook Page, if they own or wish to create one. Converting or creating an Instagram account is a separate action requiring the user's choice. After linking, redo the least-privilege OAuth/Graph API checks and run a genuine Business Discovery test before updating GitHub Secrets or deployment.

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
