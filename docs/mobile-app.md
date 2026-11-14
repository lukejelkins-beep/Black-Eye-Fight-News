# Black Eye Fight News — PWA and Capacitor

## Website and installable PWA (live)
The existing Render Static Site continues to publish the repository root. PWA support uses `manifest.webmanifest`, `sw.js`, and the two PNG app icons. On iPhone/iPad open the live site in Safari, choose **Share → Add to Home Screen**. On Android use the browser's **Install app** option. The on-site Install app control explains these steps. No app store account is required.

The service worker caches **only the static app shell**, never `/data/` or `/api/`. This avoids serving cached fight results, news and schedule JSON while connected. The website still needs internet access for fresh data, videos and externally hosted images. When offline, the shell may load but live feeds can be unavailable.

## Capacitor native starter (NOT yet a published store app)
This repository now includes Capacitor v8 configuration and a build script without changing Render's root-based static deployment.

Requirements: Node.js 22+; Xcode on macOS for iOS, Android Studio/JDK for Android.

```bash
npm install
npm run build
npx cap add android
npx cap add ios
npm run cap:sync
npx cap open android
npx cap open ios
```

Platform projects are generated locally rather than committed here; use `npx cap add` only once per platform. `npm run build` creates `www/` from the public website HTML, assets, data, legal pages and push worker. Private editions are excluded. Update `www/` with `npm run cap:sync` after web changes.

**Important:** This native package currently bundles a snapshot of the JSON feeds, because the website uses relative `/data/` URLs. Native store builds will need HTTPS API/feed routing (or a carefully reviewed native data adapter) to retain the Render site's live-refresh behaviour. Do **not** ship it as a fully live native app without that extra work. Do not use Capacitor `server.url` to load the production site for App Store release: the standard approach is bundling a local app shell with APIs for remote content.

## Pre-release checks
- Verify manifest and 192/512 PNG icon requests return 200 with correct MIME types.
- Check Android Chrome install prompt and iOS Safari Add to Home Screen.
- Confirm the new install button disappears in standalone mode.
- Confirm current JSON feeds are fetched from the network after reload.
- Run mobile Lighthouse PWA checks, and test network offline/online transitions.
- Before store distribution: add native icons/splash screens, proper native APIs, policy/privacy pages, safe-area fixes, and end-to-end device tests.

## Steps 1–3: current priorities (November 2026)

### 1. Installable website
The site's home-screen PWA manifest, 192/512 icons, offline app shell, and browser install guidance are in the live source. For iPhone: Safari → Share → Add to Home Screen. Android: Chrome → Install app. The underlying fight feeds stay network-first, not stale cached snapshots.

### 2. Mobile app navigation
On phones, five persistent bottom tabs show Home, News, Fights, Results and Fight Talk. The sticky bar's Menu opens Champions, Fighter Scout, Fight Film and Editions. The Alerts button opens notification preferences. The desktop site's original top navigation remains unchanged.

### 3. Notifications
The Alerts panel lets a reader choose breaking news, confirmed results, and new upcoming cards. When the page is **open**, it polls the site feeds and shows an in-app banner when relevant new content arrives. Initial data on open only establishes a baseline; it does not send notifications for existing stories. This intentionally avoids replaying old fight results. The reader can change topics at any time.

**Background Web Push is prepared, but is not active yet.** A delivery provider must be configured; there is no server that can send push messages yet. To connect OneSignal:

1. Create a OneSignal Web Push project for `https://black-eye-fight-news.onrender.com`.
2. Add its **public Web App ID** to `assets/push-config.js` as `oneSignalAppId`. Never place a OneSignal REST API key or secrets in website files.
3. The website contains the dedicated `/push/OneSignalSDKWorker.js` for OneSignal, separate from the PWA root `/sw.js`. Configure OneSignal for that path/scope.
4. In OneSignal, configure actual sending of notifications by editorial approval or trusted event automation. Topic tags are `befn_news`, `befn_results`, `befn_upcoming` with values `1` or `0`. **No push will reach users until sends are configured and tested.**
5. Test iPhone home-screen app (iOS 16.4+), Android and desktop using consent-based prompts. iPhone Safari browser tab alone cannot receive mobile Web Push; the PWA must be installed on the Home Screen.
6. Validate source dates/accuracy before sending alerts. Do not blast duplicate headlines or unsourced results.

OneSignal JS SDK integration is optional and dormant until a valid app ID is set. Native Capacitor app-store distribution is intentionally out of scope for now.
