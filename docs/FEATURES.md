# shipwright — feature spec

What this starter does **today**, from the actual code. The README's stack table
is the summary; this is the per-package contract (exports + the env var that
gates each feature). Monorepo: pnpm + Turborepo, Next.js 16 (App Router), React
19, TypeScript strict.

> **Boots with two vars.** Only `BETTER_AUTH_SECRET` (≥32 chars) and
> `BETTER_AUTH_URL` are required. `DATABASE_URL` defaults to a local SQLite file.
> **Every other integration gracefully no-ops without its key** — the app, tests,
> and CI run with zero third-party accounts.

## Packages (`@repo/*`)

### `@repo/env` — type-safe environment (master gate)
Single source of truth via `@t3-oss/env-nextjs` + Zod; parsed once at load, fails
fast. Exports `env`. Server vars are server-only by type; client vars are
`NEXT_PUBLIC_*`. `SKIP_ENV_VALIDATION` bypasses (CI/type-only).

### `@repo/db` — Drizzle ORM + libSQL (server-only)
Owns the schema + `db` client. Exports `.` (`db`, `Database`, tables, operators
`and/asc/desc/eq/inArray/sql`), `./schema`, `./client`. Tables: Better Auth
(`user`/`session`/`account`/`verification`), `task`, `pushSubscription`,
`processedStripeEvent`, `subscription`. `DATABASE_URL` defaults to `file:local.db`;
set a Turso `libsql://` URL + `DATABASE_AUTH_TOKEN` for remote (config-only swap).
Postgres = documented swap, not wired.

### `@repo/auth` — Better Auth
Email+password, `requireEmailVerification: false` (instant sign-in). Exports `.`,
`./server` (`auth`), `./client` (`signIn/signUp/signOut/useSession/...`), `./next`
(`GET/POST`). A `user.create.after` hook fires the welcome email fire-and-forget.
Requires `BETTER_AUTH_SECRET` + `BETTER_AUTH_URL`.

### `@repo/ui` — shadcn/ui design system
shadcn (new-york). Exports `./globals.css`, `./lib/*` (`cn`), `./components/*`
(button, card, input, label, checkbox). No env.

### `@repo/config` — security headers + nonce CSP (pure, no env)
Exports `./headers` (`securityHeaders`) and `./csp` (`generateNonce`,
`buildContentSecurityPolicy`, `NONCE_HEADER`, `CONTENT_SECURITY_POLICY_HEADER`).
Strict prod CSP (nonce + `strict-dynamic`, no `unsafe-*` on scripts);
`worker-src`/`manifest-src 'self'` for PWA. Static headers: HSTS, X-Frame-Options
DENY, nosniff, Referrer-Policy, deny-by-default Permissions-Policy.

### `@repo/email` — Resend + React Email
Exports `./send` (`sendEmail`, `sendWelcomeEmail`), `./welcome-email`.
No-op (warns once, `{ skipped: true }`) without `RESEND_API_KEY` + `EMAIL_FROM`.

### `@repo/analytics` — PostHog, double-gated
Exports `./provider` (`PostHogProvider`), `./client` (`useAnalytics`), `./server`
(`captureServerEvent`), `./config`. Gated by `NEXT_PUBLIC_POSTHOG_KEY` AND cookie
consent (`@repo/legal`); no key ⇒ posthog-js never loads. CSP `connect-src`
broadened only when configured.

### `@repo/observability` — logger + Sentry
`logger` is always on (no key). Sentry gated by `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`;
source-map upload needs `SENTRY_AUTH_TOKEN`+`SENTRY_ORG`+`SENTRY_PROJECT`. Exports
`./logger`, `./config`, `./instrumentation`, `./client`, `./next-config`
(`withObservabilityConfig`).

### `@repo/security` — rate limiter
`createRateLimiter` → in-memory sliding window by default; auto-upgrades to Upstash
when `UPSTASH_REDIS_REST_URL`+`UPSTASH_REDIS_REST_TOKEN` are set (fails open).
Exports `./ratelimit`, `./config`.

### `@repo/payments` — Stripe subscriptions
Hosted Checkout + idempotent webhook + owner-scoped reads. Exports `.` (server),
`./config` (client-safe price id). No `STRIPE_SECRET_KEY` ⇒ client never built,
`createCheckoutSession` returns `{ configured: false }`, webhook → 503. Webhook
dedupes by `event.id` via `processed_stripe_event`.

### `@repo/pwa` — installable + offline + web-push
Exports `./register` (`ServiceWorkerProvider`, prod-only), `./install`
(`useInstallPrompt`/`InstallButton`), `./push/client`, `./push/server`
(`sendPushToUser`, owner-scoped, prunes 404/410), `./manifest` (`defineManifest`),
`./config`. SW is the app's static `public/sw.js`. Manifest + offline work with no
keys; push gated by `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`.

### `@repo/seo` — metadata, JSON-LD, sitemap/robots (pure, no env)
Exports `./metadata` (`createMetadata`), `./json-ld` (`JsonLd`,
`organizationJsonLd`, `websiteJsonLd`), `./routes` (`buildSitemap`, `buildRobots`,
`absoluteUrl`). App passes `NEXT_PUBLIC_APP_URL` as the base.

### `@repo/legal` — jurisdiction-agnostic legal + consent
Exports `./config`, `./consent` (codec), `./privacy-policy`, `./terms-of-service`,
`./cookie-consent` (`CookieConsentBanner`, `useConsent`). Documents parameterized
by `LegalConfig` (no hardcoded country); opt-in consent (non-essential denied
until accept); non-blocking banner.

### `@repo/api` — opt-in tRPC v11
Alongside Server Actions (not a replacement). Exports `.` (`appRouter`,
`AppRouter`, `createTRPCContext`, `trpcHandler`, `createCaller`), `./client`
(`TRPCReactProvider`, `useTRPC`). Context `{ session }`; `protectedProcedure`;
superjson. Router today: `task.list` (owner-scoped). Dashboard-scoped provider.

### `create-shipwright` — scaffolding CLI (published)
`npx create-shipwright my-app` — downloads the GitHub starter via `giget`. Flags:
`--template/--ref/--pm/--no-git/--no-install/--force/--dry-run`.

## apps/web — the reference Tasks MVP

**Pages:** `/`, `/sign-in`, `/sign-up`, `/dashboard` (+ `layout` with tRPC
provider), `/privacy`, `/terms`, `/offline`.
**Metadata routes:** `/manifest.webmanifest`, `/sitemap.xml`, `/robots.txt`.
**Route handlers:** `/api/auth/[...all]`, `/api/stripe/webhook` (raw body, ACK
fast, process in `after()`), `/api/trpc/[trpc]`.

**Core guarantees:**
- Auth verified **inside every Server Action** + the dashboard page (not just
  middleware).
- Every `task` mutation is **owner-scoped** (`and(eq(id), eq(userId))`).
- `proxy.ts` mints a per-request nonce CSP and rate-limits `/api/auth/*` POSTs
  (10/10s per IP).
- Error boundary logs always + Sentry when configured.

## Graceful no-op matrix (runs with zero accounts)

| Feature | Env gate | When unset |
|---|---|---|
| Database | `DATABASE_URL` | local SQLite file |
| Email | `RESEND_API_KEY` + `EMAIL_FROM` | send no-ops |
| Analytics | `NEXT_PUBLIC_POSTHOG_KEY` | posthog never loads (also consent-gated) |
| Sentry | `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | SDK inert; logger still on |
| Rate-limit (distributed) | `UPSTASH_REDIS_REST_URL` + `_TOKEN` | in-memory limiter |
| Billing | `STRIPE_SECRET_KEY` (+ price, + webhook secret) | button hidden; webhook 503 |
| Web push | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` | push UI disabled; sender no-ops |
| Public URL | `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |

**Required to boot:** `BETTER_AUTH_SECRET` + `BETTER_AUTH_URL`.

See **[DEPLOY.md](../DEPLOY.md)** for host recipes + the full env reference.
