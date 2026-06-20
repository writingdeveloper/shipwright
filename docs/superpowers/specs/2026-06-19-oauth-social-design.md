# OAuth Social Login (Google + GitHub) — Design

**Date:** 2026-06-19
**Status:** Approved (brainstorm)

## Goal

Add Google + GitHub social login, **graceful**: keyless → no buttons, existing
flows intact.

## Approach

OAuth `clientId` is public (it appears in the browser redirect); `clientSecret`
is the only secret. The server registers a provider only when its clientId +
secret are present; the client shows a button only when the `NEXT_PUBLIC`
clientId is present. Keyless ⇒ 0 buttons ⇒ the existing 38 e2e are unaffected.

## Design

### env (`@repo/env`)
- server (secret): `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET` (optional).
- client (public): `NEXT_PUBLIC_GITHUB_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (optional).
- Add all four to `turbo.json` `globalEnv` (lint enforces `no-undeclared-env-vars`).

### `@repo/auth`
- `config.ts` (client-safe — reads only `NEXT_PUBLIC` vars): `enabledSocialProviders(): ("github" | "google")[]`.
- `server.ts`: `socialProviders` registered conditionally — `github` when
  `NEXT_PUBLIC_GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET`, `google` likewise.
- `config.ts` exported from the package index (client-safe surface).

### `apps/web`
- `components/social-sign-in.tsx` (client): `enabledSocialProviders()` → a button
  per provider (`authClient.signIn.social({ provider, callbackURL: "/dashboard" })`)
  with an inline error state. Renders `null` when no providers are enabled.
- `sign-in/page.tsx` + `sign-up/page.tsx`: `<SocialSignIn />` + an "or" divider,
  shown only when at least one provider is enabled.
- No CSP change: `signIn.social` is a top-level redirect (navigation), not a
  `fetch`, so `connect-src` is untouched.

### graceful + e2e
- keyless: `enabledSocialProviders() === []` → no buttons → existing 38 e2e unaffected.
- new e2e: keyless sign-in shows NO social button (graceful); axe stays clean.

### Verification (detailed QA)
- **unit**: `enabledSocialProviders` (keyless `[]`; with a NEXT_PUBLIC id → that provider) in `@repo/auth` test.
- **e2e**: keyless sign-in/up have no social button; existing 38 preserved; axe on both.
- **gate**: check-types (verifies Better Auth `socialProviders` + `authClient.signIn.social` API), lint, test, build.

## Out of scope (YAGNI)

- Account linking, additional providers, and a real OAuth round-trip e2e (needs
  real provider credentials + an external redirect — not possible keyless; that
  is a deployment-time check).

## Risks / notes

- Better Auth `socialProviders` option shape + `authClient.signIn.social`
  signature — pin to `better-auth@1.6.19`, verify via `check-types`; adjust if a
  name differs.
- `turbo.json` `globalEnv` MUST list the 4 new vars or lint fails.
