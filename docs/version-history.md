# Black Eye Fight News — Version history

## v1.0.1 — Black Eye logo-aligned colour theme (9 November 2026)

- **Exact source commit:** `528ee3504881dceef3e236264e38b958bee1e47e`
- **Saved release branch:** [`release/v1.0.1`](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/tree/release/v1.0.1)
- **Live Render deployment:** `dep-dbokj1k9v7es73fidsk0` — confirmed `live`
- **Live website:** https://black-eye-fight-news.onrender.com/
- **Changes:** Replaced teal/mint website accents with the existing Black Eye Fight News logo's charcoal black, scarlet red, golden yellow and warm white. Updated header, hero, ticker, home-screen navigation, buttons, cards, championship tables, schedules, results, Fight Talk shells, Fight Film and alerts. Preserved native social embeds, media, layout, portrait ticker fix and result/winner status colours. Updated PWA/browser chrome, caching and footer version display.
- **Rollback:** The prior `v1.0.0` Git tag and branch remain available unchanged. Re-deploy that release commit to restore the earlier mint/teal design.

This is a source-code snapshot; scheduled news, Fight Talk and fight-card data updates continue separately and are not automatically frozen.

## v1.0.0 — Initial stable website checkpoint (9 November 2026)

- **Exact source commit:** `66150b52a5be50f8680a41ccd5d8214078e53738`
- **Permanent snapshot branch:** [`release/v1.0.0`](https://github.com/lukejelkins-beep/Black-Eye-Fight-News/tree/release/v1.0.0)
- **Verified live Render deployment:** `dep-dbojug95efls73e4071g`
- **Public website:** https://black-eye-fight-news.onrender.com/

This checkpoint captures the public website as it was deployed on 9 November 2026, including the portrait-screen ticker fix. It contains the homepage, news, fight schedule, results, Fight Talk, Fight Film, championship and fighter pages, and mobile/PWA assets as represented by the exact commit.

The `release/v1.0.0` branch is a **code and repository-data snapshot**, not a copy of external APIs, social-media content, or future automatically refreshed datasets. Do not merge routine news, Fight Talk, or event update commits into this branch.

### Restoring v1.0.0

1. If the Render deployment remains in its deploy history, open the Render dashboard and select the matching known-good deployment to roll back. Confirm the commit SHA before acting.
2. If it has expired from Render's deployment history, restore the site source from `release/v1.0.0` (or the `v1.0.0` Git tag, if available) onto the production branch and deploy through the normal process.
3. Check mobile portrait/landscape views, home-screen PWA cache, news, calendar, results, Fight Talk, and Fight Film after restoring.
4. Be aware that restoring an old code snapshot can also restore older JSON content inside that snapshot; live external data and secrets are not rolled back.

### Versioning policy

- `vX.Y.Z` stable checkpoints represent tested and deployable website source.
- Increase **PATCH** for fixes, **MINOR** for compatible features, **MAJOR** for breaking architecture or major redesigns.
- Keep each release branch/tag immutable, and create new version names for future releases.
- Automated editorial/content refreshes on `main` do **not** get a new website version by themselves.
