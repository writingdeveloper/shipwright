# Launch hardening — Spec 2: GA4 analytics

- **Date:** 2026-06-19 · **Status:** Approved → implement · **Part of:** launch (2 of 3)

## Goal

Add Google Analytics 4 as an **opt-in, consent-gated** option in `@repo/analytics`,
coexisting with PostHog (not replacing it). No `NEXT_PUBLIC_GA_ID` ⇒ complete
no-op; with a key, gtag loads only after the user accepts analytics cookies
(`@repo/legal`), mirroring the PostHog provider's double gate.

## Design

**`@repo/analytics`** (follows the PostHog provider/config pattern):
- `./config` adds `isGoogleAnalyticsEnabled()` (true iff `NEXT_PUBLIC_GA_ID`),
  `googleAnalyticsId()`, and `gaConnectSrc()` (returns
  `["https://www.google-analytics.com", "https://www.googletagmanager.com"]` when
  enabled, else `[]` — so prod CSP is broadened only when configured).
- `./google-analytics` exports `<GoogleAnalytics>` (`'use client'`): no-op unless
  enabled AND `useConsent().hasAnalyticsConsent`; then injects gtag.js
  (`googletagmanager.com/gtag/js?id=…`) once and runs `gtag('consent','update',
  {analytics_storage:'granted'})` + `gtag('config', id)`. Loading only post-consent
  keeps it consistent with PostHog. Guarded so it initialises at most once.
- Re-export `GoogleAnalytics` + the new config fns from `index.ts`; add
  `./google-analytics` to `package.json` exports.

**env**: `NEXT_PUBLIC_GA_ID` (optional client var) in `@repo/env`, `turbo.json`
globalEnv, `.env.example`.

**CSP** (`apps/web/proxy.ts`): add `...gaConnectSrc()` to the `connectSrc` array
(alongside analytics/sentry). gtag.js itself loads via a nonce'd script under
`strict-dynamic` (no host-allowlist needed for scripts; prod stays strict).

**apps/web** (`app/layout.tsx`): render `<GoogleAnalytics />` next to
`<PostHogProvider>` (inside it, so both sit under the consent provider tree).

## Testing

- **vitest** (`@repo/analytics`): `isGoogleAnalyticsEnabled()`/`gaConnectSrc()`
  are false/`[]` with no key, true/origins with a key (env scrubbed, dynamic
  import — mirrors the existing analytics config test).
- **e2e**: with no `NEXT_PUBLIC_GA_ID` (CI default), the homepage loads no
  `googletagmanager.com/gtag/js` script (no-op verified).

## Acceptance

1. `pnpm build/check-types/lint/test` pass with no GA key (no-op).
2. With a key + consent, gtag.js loads and `connect-src` includes the GA origins;
   without consent or key, it never loads.
3. CSP unchanged when GA unconfigured.

## Out of scope

PostHog removal (kept), server-side GA events, GTM container (gtag only).
