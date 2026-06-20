# @repo/pwa — Claude Code rules

Installable + offline + web-push glue for the App Router. The service worker is a
static, self-contained file the APP owns (`apps/web/public/sw.js`); this package
ships the code that talks to it.

- **Subpath surfaces, kept on the right side of the bundle:**
  - `@repo/pwa/register` → `<ServiceWorkerProvider/>` (client; registers `/sw.js`, PROD only).
  - `@repo/pwa/install` → `useInstallPrompt()`, `<InstallButton/>` (client).
  - `@repo/pwa/push/client` → `subscribeToPush` / `unsubscribeFromPush` / `getCurrentSubscriptionEndpoint` (client).
  - `@repo/pwa/push/server` → `saveSubscription` / `deleteSubscription` / `listSubscriptions` / `sendPushToUser` (server-only; imports `db`).
  - `@repo/pwa/manifest` → `defineManifest()` (shared, pure).
  - `@repo/pwa/config` → `isPushConfigured()` / `vapidPublicKey()` (client-safe; reads only the public VAPID key).
- **Graceful degrade is the invariant**: all VAPID vars are OPTIONAL in `@repo/env`.
  With no `VAPID_PRIVATE_KEY` the sender no-ops (`{ skipped: true }`, warns once);
  with no `NEXT_PUBLIC_VAPID_PUBLIC_KEY` the UI is disabled. App/tests/CI run keyless.
- **Hand-rolled SW, not Serwist/next-pwa**: Next 16 defaults to Turbopack, which
  has no webpack-plugin support. The static SW is Turbopack-agnostic. Bump
  `CACHE_VERSION` in `sw.js` to invalidate caches on deploy. Register in prod only
  (a cache-first SW fights dev HMR) — test against `next build && next start`.
- **Crypto is delegated**: VAPID signing uses the vetted `web-push` library; we
  never hand-roll it. The DB table (`push_subscription`) lives in `@repo/db`,
  owner-scoped; prune 404/410 endpoints on send.
- **CSP**: `worker-src 'self'` + `manifest-src 'self'` (in `@repo/config/csp`) keep
  the SW + manifest allowed under the strict nonce policy; push needs no `connect-src`.
- **Scaffolding**: `pnpm gen app --args <name> <port> true` (or answer "y" to the
  PWA prompt) generates a PWA-ready app — manifest + app-owned `sw.js` + `/offline`
  + placeholder `icon.svg` + nonce-CSP `proxy.ts` + `<ServiceWorkerProvider/>`. The
  generated `sw.js` mirrors `apps/web/public/sw.js`; keep them in sync. push +
  install stay opt-in (add `@repo/pwa/push` / `@repo/pwa/install`).
