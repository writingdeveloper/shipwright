# Launch hardening — Spec 3: infra (health) + email deliverability

- **Date:** 2026-06-19 · **Status:** Approved → implement · **Part of:** launch (3 of 3)

## Goal

Close the last two launch gaps: a health-check endpoint for container hosts, and
email deliverability (a `replyTo` option + DNS/DKIM/SPF/DMARC guidance) so
transactional mail isn't silently spam-filtered.

## Design

**health endpoint** — `apps/web/app/api/health/route.ts`: `GET` returns
`Response.json({ status: "ok" })` with `runtime = "nodejs"` and
`dynamic = "force-dynamic"` (never cached). Liveness only — no DB dependency
(readiness with a DB ping is intentionally out of scope; a flaky DB shouldn't
fail liveness and restart the container). `/api/health` is under the existing
robots `Disallow: /api`.

**email `replyTo`** — `@repo/email`:
- `SendEmailArgs` gains `readonly replyTo?: string`.
- `sendEmail` passes `...(replyTo ? { replyTo } : {})` to `resend.emails.send`.
- `sendWelcomeEmail` is unchanged (no replyTo needed there).
- Graceful no-op contract preserved (still `{ skipped: true }` with no key).

**email deliverability docs** — `DEPLOY.md`: a short "Email deliverability" note
under the email integration: verify your sending domain in Resend and add
SPF + DKIM + DMARC DNS records, or 2026 Gmail/Yahoo bulk-sender rules route mail
to spam (so welcome/reset emails silently fail). Link Resend's domain setup.

## Testing

- **vitest (`@repo/email`)**: with Resend mocked + a key set, `sendEmail({ replyTo })`
  forwards `replyTo` to `resend.emails.send`; the existing no-op (no key) test
  still holds.
- **e2e**: `GET /api/health` → 200 `{ status: "ok" }`.

## Acceptance

1. `pnpm build/check-types/lint/test` + `test:e2e` pass.
2. `/api/health` returns 200 JSON `{ status: "ok" }`.
3. `sendEmail` forwards `replyTo` when given; still no-ops without a key.
4. DEPLOY.md documents SPF/DKIM/DMARC + Resend domain verification.

## Out of scope

DB-backed readiness probe, GTM, per-mail DKIM signing in code (DNS is the host's job).
