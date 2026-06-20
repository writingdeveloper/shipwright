# Auth Flow — Password Reset + Dynamic Email Verification — Design

**Date:** 2026-06-19
**Status:** Approved (brainstorm)

## Goal

Complete the auth flow with **password reset** and **email verification**,
closing the planner-persona gap — while preserving shipwright's "runs keyless"
graceful invariant.

## Context

- `@repo/auth`: Better Auth, `emailAndPassword { enabled, requireEmailVerification: false }`,
  `user.create.after` → welcome email. Client exports `signIn/up/out` only.
- `@repo/email`: `sendEmail` (graceful — no-op without `RESEND_API_KEY`/`EMAIL_FROM`),
  `sendWelcomeEmail`.
- **Tension:** `requireEmailVerification: true` would break the keyless invariant
  (no email ⇒ permanent lockout) and the e2e suite.

## Approach

**Dynamic verification:** `requireEmailVerification = isEmailConfigured()`. Keyless
⇒ `false` (existing flows untouched), prod ⇒ `true`. Password reset is graceful by
nature (the reset email no-ops without keys; the page flow still renders).

## Design

### `@repo/email`
- `isEmailConfigured(): boolean` = `Boolean(RESEND_API_KEY && EMAIL_FROM)`.
- `PasswordResetEmail`, `VerifyEmail` — React Email templates (welcome pattern);
  unit-tested for headline + CTA URL.
- `sendPasswordResetEmail({ to, url })`, `sendVerificationEmail({ to, url })` —
  graceful (skip without config), mirroring `sendWelcomeEmail`.

### `@repo/auth/server`
- `requireEmailVerification: isEmailConfigured()`.
- `emailAndPassword.sendResetPassword: async ({ user, url }) => sendPasswordResetEmail({ to: user.email, url })`.
- `emailVerification: { sendVerificationEmail: async ({ user, url }) => sendVerificationEmail({ to: user.email, url }), sendOnSignUp: true }`.

### `@repo/auth/client`
- Export `forgetPassword`, `resetPassword`, `sendVerificationEmail` from `authClient`.

### `apps/web`
- `app/forgot-password/page.tsx` — email input → `authClient.forgetPassword({ email, redirectTo: "/reset-password" })`; success: a "check your email" state.
- `app/reset-password/page.tsx` — read `token` from `searchParams`; new password (`PasswordInput`) → `authClient.resetPassword({ newPassword, token })`; success → `/sign-in`. Missing/empty token → an explanatory message.
- `sign-in/page.tsx` — a "Forgot password?" link; on an "email not verified" error, show a message + a resend link (`authClient.sendVerificationEmail`).
- All new pages: `<h1>`, `aria-invalid`/`aria-describedby`, `PasswordInput`, `id="main"`, CSP-safe (no inline script).
- Mark `/forgot-password` + `/reset-password` `noindex` (auth utility pages).

### graceful + e2e
- **keyless**: `requireEmailVerification = false` → existing sign-up / sign-in / CRUD e2e unchanged.
- **new e2e**: forgot-password + reset-password render with an `<h1>`; submit (email no-ops → success/neutral state); sign-in shows the "Forgot password?" link; axe-core scan on both pages.

### Verification
- Full gate + e2e (existing 33 + new) green; keyless dynamic `false` preserves
  every current flow. `@repo/email` + `@repo/auth` unit tests for the new helpers
  / templates.

## Out of scope (YAGNI)

- Social OAuth, magic-link sign-in, MFA.

## Risks / notes

- Better Auth API names (`emailAndPassword.sendResetPassword`,
  `emailVerification.sendVerificationEmail`, client `forgetPassword` /
  `resetPassword` / `sendVerificationEmail`) — pin against `better-auth@1.6.19`
  during implementation; adjust if the installed version differs.
- The reset token arrives as `?token=` on `redirectTo`; the reset page reads it
  from `searchParams` (client component → `useSearchParams`).
