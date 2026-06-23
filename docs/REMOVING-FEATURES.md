# Removing features

shipwright ships with every optional integration wired in, and **each one
gracefully no-ops until you add its env keys** — so an unused feature is already
inert at runtime (it just shows a "not configured" state). Removing one is a
*decluttering* choice, not a correctness need.

`create-shipwright --features <comma-list>` (or the interactive multiselect) lets
you pick which optional features you'll use; it then points you here for the rest.
**The scaffold always includes everything (so it builds as-is)** — you remove what
you don't want, because you own the code.

## How to use this guide

Pick a feature below and apply its steps in your project. After removing one, run:

```sh
pnpm install && pnpm check-types && pnpm build
```

Core packages — `@repo/ui`, `@repo/auth`, `@repo/db`, `@repo/env`, `@repo/config`
— are not removable (the app is built on them).

Common steps shared by most features:

- **Package**: `rm -rf packages/<name>` (the `packages/*` pnpm-workspace glob drops
  it automatically; no `pnpm-workspace.yaml` or `turbo.json` edit needed).
- **Dependency**: remove the `"@repo/<name>": "workspace:*"` line from
  `apps/web/package.json` (and any other app that lists it).
- **Transpile**: remove the `"@repo/<name>"` entry from `transpilePackages` in
  `apps/web/next.config.ts` (only for packages listed there).
- **Env**: delete the feature's block in `packages/env/src/index.ts` (both the
  `server`/`client` declaration AND its `runtimeEnv` entries) and the matching
  lines in `apps/web/.env.example`.
- Re-run the install + gate above.

---

## analytics — `@repo/analytics` (PostHog + GA4)

- `rm -rf packages/analytics`; drop the dep; remove `"@repo/analytics"` from `transpilePackages`.
- `apps/web/app/[locale]/layout.tsx`: remove the `PostHogProvider` and `GoogleAnalytics`
  imports and their JSX (`<PostHogProvider>…</PostHogProvider>` wrapper and `<GoogleAnalytics />`).
- `apps/web/proxy.ts`: remove the `analyticsConnectSrc` / `gaConnectSrc` import and
  their two entries in the `connectSrc` array.
- Env: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_GA_ID`.

## payments — `@repo/payments` (Stripe billing)

- `rm -rf packages/payments`; drop the dep. (Not in `transpilePackages`.)
- `packages/db/src/schema.ts`: remove the `processedStripeEvent` and `subscription`
  tables, `subscriptionRelations`, the `subscription` line in `userRelations`, and
  both entries in the `schema` aggregate. Then `pnpm --filter @repo/db db:push`.
- `apps/web/app/[locale]/dashboard/`: delete `billing-card.tsx`, `upgrade-button.tsx`,
  `billing-actions.ts`; in `page.tsx` remove the `BillingCard` import + JSX and the
  `isPro` / `isBillingConfigured` usage (incl. the pro badge in the header).
- Delete `apps/web/app/api/stripe/webhook/route.ts`.
- Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PRICE_ID`.

## storage — `@repo/storage` (S3-compatible uploads)

- `rm -rf packages/storage`; drop the dep. (Not in `transpilePackages`.)
- `packages/db/src/schema.ts`: remove the `uploadedFile` table, `uploadedFileRelations`,
  the `uploadedFiles` line in `userRelations`, and the `uploadedFile` entry in the
  `schema` aggregate. Then `db:push`.
- `apps/web/app/[locale]/dashboard/`: delete `files-card.tsx`, `file-upload.tsx`,
  `delete-file-button.tsx`, `file-actions.ts`; in `page.tsx` remove the `FilesCard`
  import + JSX and the `isStorageConfigured` / `listFiles` usage.
- Env: `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`.

## pwa — `@repo/pwa` (manifest + service worker + web-push)

- `rm -rf packages/pwa`; drop the dep; remove `"@repo/pwa"` from `transpilePackages`
  and `"web-push"` from `serverExternalPackages` in `next.config.ts`.
- `apps/web/app/[locale]/layout.tsx`: remove the `ServiceWorkerProvider` import + `<ServiceWorkerProvider />`.
- `packages/db/src/schema.ts`: remove the `pushSubscription` table, `pushSubscriptionRelations`,
  the `pushSubscriptions` line in `userRelations`, and the aggregate entry. Then `db:push`.
- `apps/web/app/[locale]/dashboard/`: delete `push-card.tsx`, `push-toggle.tsx`,
  `push-actions.ts`; in `page.tsx` remove the `PushCard` import + JSX.
- Delete the PWA assets: `apps/web/public/sw.js`, `apps/web/app/manifest.ts(x)` /
  `manifest.webmanifest`, the `app/[locale]/offline` page, and the PWA icons.
- Env: `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

## security — `@repo/security` (rate limiting)

- `rm -rf packages/security`; drop the dep; remove `"@repo/security"` from `transpilePackages`.
- `apps/web/proxy.ts`: remove the `createRateLimiter` import, the `authRateLimiter`
  const, the `enforceAuthRateLimit` function, and its call in `proxy()` (the
  `/api/auth` POST branch then just falls through to `NextResponse.next()`).
- Env: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

## legal — `@repo/legal` (cookie consent + policies)

- `rm -rf packages/legal`; drop the dep; remove `"@repo/legal"` from `transpilePackages`.
- `apps/web/app/[locale]/layout.tsx`: remove the `CookieConsentBanner` import + `<CookieConsentBanner …/>`.
- Delete (or replace the bodies of) `apps/web/app/[locale]/privacy/page.tsx` and
  `terms/page.tsx` (they render `PrivacyPolicy` / `TermsOfService` from `@repo/legal`);
  remove `legalConfig` from `apps/web/lib/site.ts`.

## api — `@repo/api` (opt-in tRPC)

- `rm -rf packages/api`; drop the dep (and `@tanstack/react-query` from `apps/web/package.json`);
  remove `"@repo/api"` from `transpilePackages`.
- Delete `apps/web/app/api/trpc/[trpc]/route.ts`.
- `apps/web/app/[locale]/dashboard/`: delete `trpc-task-list.tsx`; in `layout.tsx`
  remove the `TRPCReactProvider` wrapper (the dashboard layout can then just render
  `children`, or be deleted); in `page.tsx` remove the `TrpcTaskList` import + JSX.
- (Server Actions remain the primary data path — tRPC is the opt-in demo alongside them.)

## i18n — `@repo/i18n` (next-intl locale routing) — *involved*

Most involved: i18n owns the `app/[locale]` URL segment. The proxy part is a clean
seam (see #4), the routing part is a move.

- Proxy (easy, thanks to the seam): in `apps/web/i18n/proxy.ts` make `applyI18n`
  `return NextResponse.next();` and drop the `next-intl` import — `withCsp` is unchanged.
- `rm -rf packages/i18n`; drop the dep; remove `"@repo/i18n"` from `transpilePackages`;
  in `next.config.ts` remove the `createNextIntlPlugin` import and unwrap the
  `withNextIntl(...)` call in the export.
- Move `apps/web/app/[locale]/*` up to `apps/web/app/*` (drop the dynamic segment),
  delete `apps/web/i18n/{routing,navigation,proxy,request}.ts` and `apps/web/messages/`,
  and in `layout.tsx` remove `NextIntlClientProvider`, `generateStaticParams`, the
  `setRequestLocale`/`getTranslations` calls, and the `LocaleSwitcher`.
- Repoint the locale-aware imports (`../i18n/navigation`, `../i18n/routing`) back to
  `next/link` + `next/navigation`, and delete `apps/web/components/locale-switcher.tsx`
  + `apps/web/tests/messages.test.ts`.

## observability — `@repo/observability` (Sentry + logger) — *involved*

The structured `logger` is used across many server files, so this is a wider edit.

- `apps/web/next.config.ts`: remove the `withObservabilityConfig` import and unwrap
  it from the export (`export default withNextIntl(nextConfig)` — i.e. drop the
  `withObservabilityConfig(...)` layer).
- `apps/web/proxy.ts`: remove the `sentryConnectSrc` import + its `connectSrc` entry,
  and the `logger` import + its usages (replace with `console.warn`/`console.error`
  or remove).
- Replace `logger` across the app (server actions, `app/global-error.tsx`,
  `app/[locale]/error.tsx`, webhook/route handlers) with `console` or your own.
- `rm -rf packages/observability`; drop the dep; remove `"@repo/observability"` from
  `transpilePackages`; delete any `instrumentation*.ts` / Sentry config files.
- Env: `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`,
  `SENTRY_TRACES_SAMPLE_RATE`, `NEXT_PUBLIC_SENTRY_DSN`.

## seo — `@repo/seo` (metadata + sitemap + JSON-LD) — *involved*

`createMetadata` is used by nearly every page, so this touches many files.

- `rm -rf packages/seo`; drop the dep; remove `"@repo/seo"` from `transpilePackages`.
- Replace `createMetadata(...)` with plain Next `Metadata` objects in `layout.tsx`
  and every page that uses it; remove `JsonLd` / `organizationJsonLd` / breadcrumb
  JSON-LD usages; remove `seoSite` from `apps/web/lib/site.ts`.
- Delete the SEO routes that depend on it: `app/sitemap.ts`, `app/robots.ts`,
  `app/llms.txt/route.ts`, `app/opengraph-image.tsx` (or rewrite without `@repo/seo`).
- Env: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`.

## email — `@repo/email` (Resend transactional email) — *core-coupled*

`@repo/email` is imported by **core `@repo/auth`** (`packages/auth/src/server.ts`)
for password-reset / verification emails, so removal touches auth.

- In `packages/auth/src/server.ts`, remove the `@repo/email` import and the
  `sendResetPassword` / `emailVerification` wiring that calls it (Better Auth then
  runs without transactional email — those flows become unavailable rather than
  broken). Drop `"@repo/email"` from `packages/auth/package.json`.
- `rm -rf packages/email`; drop the dep from any other app that lists it.
- Env: `RESEND_API_KEY`, `EMAIL_FROM`.

---

## turbo.json (optional)

`turbo.json` has no per-package tasks, so removed packages just leave the graph.
You may optionally prune the now-unused env keys from its `globalEnv` list (purely
cosmetic — they only affect cache keys).
