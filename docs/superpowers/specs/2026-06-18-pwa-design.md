# @repo/pwa — design spec

- **Date:** 2026-06-18
- **Status:** Approved (brainstorming) → ready for implementation plan
- **Roadmap item:** "Optional `@repo/pwa` module (manifest + service worker + web-push)"

## Context & goal

shipwright extracts validated patterns from `apps/web` into `@repo/*` packages,
adopts vetted libraries (never hand-rolls auth/ORM/payments/crypto), and every
integration gracefully no-ops until its key is present. This module adds a
production-oriented PWA layer to the reference app and packages the reusable glue.

**Goal:** `apps/web` becomes an installable, offline-capable PWA that can send
web-push notifications, and the reusable pieces live in `@repo/pwa`. With no VAPID
keys configured, the app/tests/CI still run (push UI shows a disabled state).

## Key decisions (with rationale)

1. **Hand-rolled service worker, not Serwist/next-pwa.** Next 16 defaults to
   Turbopack for `dev` and `build`, and Turbopack does not support webpack
   plugins. `@serwist/next` requires `next build --webpack` (breaks dev/prod
   bundler parity, regresses our `output: "standalone"` + Turbopack stack);
   `@serwist/turbopack` is new and unproven. A dependency-free static SW is
   Turbopack-agnostic, matches the "own-it" philosophy, and the scope we need
   (precache app shell, navigation fallback, runtime SWR, push handler) is
   manageable. The genuinely hard part — VAPID encryption — is delegated to the
   vetted `web-push` library.
2. **SW lives in `apps/web/public/sw.js` (static, self-contained).** A static SW
   must be self-contained (no npm imports without bundling) and served from the
   root scope (`/sw.js`) to control the whole origin. `@repo/pwa` provides the
   code that *talks to* the SW, not the SW body. The app's `public/sw.js` is the
   vetted reference; extraction to a generator/recipe comes later (first consumer
   first).
3. **Manifest via Next 16 native `app/manifest.ts`** (`MetadataRoute.Manifest`) —
   framework-standard, declarative, no library.
4. **Push demo is a standalone dashboard toggle + "send test notification"**, not
   wired into the Tasks domain — clearer and decoupled.

## Package surface — `@repo/pwa`

Subpath exports (matching existing package convention; source `.ts`, `tsc
--noEmit`, transpiled by the app):

| Export | Symbols | Env |
|---|---|---|
| `./register` | `<ServiceWorkerProvider/>` — registers `/sw.js`, detects waiting worker | client |
| `./install` | `useInstallPrompt()`, `<InstallButton/>` (`beforeinstallprompt`) | client |
| `./push/client` | `subscribeToPush(): Promise<PushSubscriptionJSON \| null>`, `unsubscribeFromPush()`, `getPushPermissionState()` | client |
| `./push/server` | `sendPushToUser(userId, payload): Promise<SendPushResult>`, `saveSubscription(...)`, `deleteSubscription(endpoint)`, `listSubscriptions(userId)` | server-only |
| `./manifest` | `defineManifest(overrides?): MetadataRoute.Manifest` | shared |
| `./config` | `isPushConfigured(): boolean`, `vapidPublicKey()` | shared |

`SendPushResult` is a discriminated union: `{ skipped: true; reason: string }`
when VAPID is unconfigured, else `{ sent: number; pruned: number }`.

## Service worker behaviour (`apps/web/public/sw.js`)

- `CACHE_VERSION` constant namespaces the cache; bump on deploy to invalidate.
- **install**: precache app shell (`/`, `/offline`, core static assets);
  `skipWaiting()`.
- **activate**: delete caches not matching `CACHE_VERSION`; `clients.claim()`.
- **fetch** (GET only):
  - navigations → network-first → cached shell → `/offline` fallback
  - `/_next/static/*` (hashed, immutable) → cache-first
  - other same-origin GET → stale-while-revalidate
  - non-GET / API → not intercepted (network-only)
- **push**: parse `event.data` JSON → `registration.showNotification(title, opts)`.
- **notificationclick**: focus an existing client for the target URL or open one.

JSDoc + `/// <reference lib="webworker" />` for type hints without a build step.

## Web push flow (VAPID)

- **DB** (`@repo/db` owns the schema): `pushSubscription` table — `id` (uuid pk),
  `userId` (FK → `user.id`, `onDelete: cascade`), `endpoint` (unique), `p256dh`,
  `auth`, `createdAt`; index on `userId`. Generate Drizzle migration.
- **Subscribe**: client `PushManager.subscribe({ userVisibleOnly: true,
  applicationServerKey: vapidPublicKey })` → server action → `saveSubscription`
  upserts on `endpoint` conflict, scoped to `userId`.
- **Unsubscribe**: client unsubscribes → server action → `deleteSubscription`.
- **Send**: `sendPushToUser` loads the user's subscriptions, calls
  `webpush.sendNotification` for each; on `404`/`410` it deletes the dead
  subscription (returns `pruned` count).
- **No-op**: missing `VAPID_PRIVATE_KEY`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY` → senders
  return `{ skipped: true }` (warn once), client subscribe is gated by
  `isPushConfigured()`, UI shows a disabled "push not configured" state.

## Manifest (`apps/web/app/manifest.ts`)

`defineManifest()` builds name/short_name, icons (192, 512, and a maskable
variant), `theme_color`/`background_color`, `display: "standalone"`, `start_url`.
Derives name/colors from the `@repo/seo` site config where available. Ship
placeholder PNG icons under `apps/web/public/icons/`.

## Env (`@repo/env`, all optional → no-op)

- server: `VAPID_PRIVATE_KEY?`, `VAPID_SUBJECT?` (default `mailto:` contact)
- client: `NEXT_PUBLIC_VAPID_PUBLIC_KEY?`
- Add to schema + `runtimeEnv` in `packages/env`, compose in `apps/web/env.ts`.

## CSP (`@repo/config/csp`)

Add `worker-src 'self'` and `manifest-src 'self'` so the SW and manifest are
explicitly allowed under the strict nonce policy. Push delivery is browser-native
(no `connect-src` change). Keep `'unsafe-inline'`/`'unsafe-eval'` out of prod.

## apps/web integration

- `next.config.ts`: add `@repo/pwa` to `transpilePackages`.
- `app/layout.tsx`: mount `<ServiceWorkerProvider/>`.
- `app/manifest.ts`, `app/offline/page.tsx`, `public/sw.js`, `public/icons/*`.
- Dashboard: `<PushToggle/>` (subscribe/unsubscribe) + "Send test notification"
  server action calling `sendPushToUser`.

## Testing

- **vitest**: `config` no-op gating; `defineManifest()` output; `sendPushToUser`
  logic with `web-push` mocked (asserts 410 → prune, unconfigured → skipped).
- **e2e (playwright)**: `GET /manifest.webmanifest` → 200 + correct type; `/offline`
  renders. (SW registration is best-effort in CI.)

## Dependencies

`@repo/pwa`: `@repo/env`, `@repo/db`, `web-push`; dev `@types/web-push`. `react`
as a peer dependency. Add `web-push` to `serverExternalPackages` if needed.

## Acceptance criteria

1. `pnpm build`, `pnpm check-types`, `pnpm lint`, `pnpm test` pass with **no**
   VAPID keys set (graceful no-op verified).
2. `GET /manifest.webmanifest` returns a valid manifest; app is installable.
3. With VAPID keys set, a user can subscribe from the dashboard and receive a
   test push; dead subscriptions are pruned on send.
4. Offline navigation falls back to `/offline`.
5. CSP includes `worker-src`/`manifest-src 'self'`; no `unsafe-*` in prod scripts.

## Out of scope (YAGNI)

- Background sync / periodic sync / push analytics.
- Rich SW precache-manifest revisioning (handled by `CACHE_VERSION` + explicit list).
- Wiring push into Tasks events (standalone demo only).
- Notification preference management UI beyond a single toggle.
