# Admin RBAC Foundation + Admin App Shell (SP1) — Design Spec

**Date:** 2026-06-29
**Status:** Approved (brainstorming → spec)
**Decomposition:** This is **SP1 of 3** for the "RBAC + admin dashboard + audit_log + billing-admin"
roadmap item (eval backlog #4). SP1 = the structure + a gated empty shell. SP2 = user
management + view-all data + audit_log. SP3 = billing admin (Stripe refunds + subscription
extensions). SP1 must produce working, testable software on its own.

**Origin:** MVP-acceleration eval (`docs/eval-mvp-acceleration-2026-06-23.md`) — the admin-tool
persona's core need (roles + an admin surface) is absent. `apps/admin` is an empty scaffold;
there is no `role` concept anywhere. The owner-scoping guardrail (already on main) left an
`acrossAllOwners()` seam with no role check — SP1 lands its first role-gated consumer.

---

## 1. Goals / Non-goals

**SP1 Goals**
1. Add a real `role` to auth via the vetted Better Auth `admin()` plugin (no hand-rolled RBAC).
2. A `requireAdmin()` data-layer guard, verified per Server-Action/data-fetch (not layout-only).
3. A documented first-admin **bootstrap** that sets a real `role = "admin"` (so SP2's plugin
   management API authorizes correctly).
4. Fill `apps/admin` into a minimal but real, **role-gated** admin app: sign-in → gated
   dashboard shell showing cross-owner counts (the first real `acrossAllOwners()` consumer);
   non-admins are bounced.
5. Bring `apps/admin` to the same security posture as `apps/web` (static headers + nonce CSP).
6. Prove it: a DB schema test (role default) and a NEW admin e2e harness that exercises the
   real gate in both directions (admin enters, non-admin bounced).

**SP1 Non-goals (deferred — do NOT build here)**
- User management UI (list/search/role-change/ban) → SP2 (the plugin's APIs exist now, but the
  UI + audit recording is SP2).
- `audit_log` table → SP2 (its first consumer — recording admin actions — lands there; no
  pre-created abstraction, per repo discipline).
- Impersonation / user delete UI → SP2 (the `impersonatedBy` session column IS added now for
  plugin-schema completeness, but no impersonation flow is built).
- Billing admin (refunds / extensions) → SP3.
- i18n for `apps/admin` (it has no `@repo/i18n` dep; admin is English-only for now).

---

## 2. Architecture — component map

| Location | Change |
|----------|--------|
| `@repo/db` `schema.ts` (+ `schema.pg.ts` mirror) | `user`: `role`, `banned`, `banReason`, `banExpires`; `session`: `impersonatedBy` |
| `@repo/auth/server` | register Better Auth `admin()` plugin; create-hook promotes `ADMIN_EMAILS` signups to `role:"admin"` |
| `@repo/auth/client` | register `adminClient()`; export admin methods |
| `@repo/auth` (new script) | `promote-admin` — idempotently set `role:"admin"` for an existing user by email |
| `@repo/env` `index.ts` | `ADMIN_EMAILS` (optional, server, comma-separated) |
| `apps/admin/lib/admin-actions.ts` (new) | `requireAdminSession()` / `requireAdmin()` guard |
| `apps/admin` app | `sign-in` page; `(dashboard)` gated layout + shell with cross-owner counts; landing redirect |
| `apps/admin` security | `@repo/config/headers` in `next.config.ts` + a `proxy.ts` (nonce CSP + auth rate-limit) |
| `apps/admin` tests | NEW playwright harness (config + fixtures + sign-in/gate spec) |

**Layering rule (important):** `acrossAllOwners()` stays a pure predicate in `@repo/db` — the
DB package never imports auth/session. The role gate lives at the **call site**: an admin data
fetch calls `requireAdmin()` first, then runs the `acrossAllOwners()` query. This mirrors how
owner-scoping calls `requireUserId()` in the Server Action, not inside the DB helper.

---

## 3. Schema changes (Better Auth admin plugin)

Add to `user` (camelCase property → snake_case column, matching the existing generated style):

```ts
role: text("role").default("user"),
banned: integer("banned", { mode: "boolean" }),
banReason: text("ban_reason"),
banExpires: integer("ban_expires", { mode: "timestamp_ms" }),
```

Add to `session`:

```ts
impersonatedBy: text("impersonated_by"),
```

`role` defaults to `"user"` so every existing/new row is non-admin until promoted. `banned`/
`banReason`/`banExpires`/`impersonatedBy` are nullable (the plugin treats absent as
not-banned / not-impersonated). **pg mirror (`schema.pg.ts`) gets the pg-core equivalents**
(`text`, `boolean`, `timestamp`) in lockstep — the `pg-compat` job goes red on drift.

These match the Better Auth `admin()` plugin's default field names, so the Drizzle adapter
maps them without extra config. No app currently reads `banned`/`impersonatedBy` (SP2), but
the columns ship now so the plugin schema is complete and there is no second migration.

---

## 4. Auth plugin wiring

**Server** (`@repo/auth/server`): add `plugins: [admin()]` to `betterAuth({...})`
(`import { admin } from "better-auth/plugins"`). Default `adminRoles: ["admin"]` is what we
want. Extend the existing `databaseHooks.user.create.after` (currently fires the welcome
email) to also promote the new user to `role:"admin"` when their email is in `ADMIN_EMAILS` —
fire-and-forget must NOT block sign-up, but the role write SHOULD complete before the user is
useful, so it is `await`ed inside the hook (it is a fast local UPDATE; the welcome email stays
fire-and-forget).

**Client** (`@repo/auth/client`): add `plugins: [adminClient()]`
(`import { adminClient } from "better-auth/client/plugins"`) to `createAuthClient`. The
`authClient.admin.*` methods (listUsers/setRole/banUser/…) become available — SP1 does not
call them, SP2 does, but wiring the client plugin now keeps client/server in lockstep (same
discipline as the superjson note in `@repo/api`).

---

## 5. `requireAdmin()` guard + first-admin bootstrap

**Guard** — `apps/admin/lib/admin-actions.ts` (sibling of `apps/web/lib/auth-actions.ts`):

```ts
// requireAdminSession(): get session or redirect to /sign-in; then require role admin
//   - no session            → redirect("/sign-in")
//   - session, role !== admin → notFound()   // 404, don't reveal the admin surface
//   - else                   → return session
export async function requireAdminSession(): Promise<Session> { … }
export async function requireAdmin(): Promise<string> { /* returns userId */ }
```

Called at the **data layer** of every admin page/action (repo rule — never trust the layout
alone). `apps/admin` has no `@repo/i18n`, so redirects use plain `next/navigation`.

**Single source of truth = `user.role`.** `requireAdmin` checks `role === "admin"` only — NOT
the email allowlist directly. This is deliberate: the Better Auth admin plugin authorizes its
own management API on `role`, so the allowlist must SEED the real role, not shadow it.

**Bootstrap** (how the first admin gets `role:"admin"`):
- `ADMIN_EMAILS` (optional env, comma-separated). Empty in keyless/CI/dev → no env-seeded admins.
- New signups: the create-hook (§4) promotes a matching email at account creation.
- Existing users: `pnpm --filter @repo/auth promote-admin <email>` — an idempotent script that
  sets `role:"admin"` for that user (and is the documented way to mint the very first admin on
  an existing DB).

---

## 6. apps/admin shell

- **Sign-in** — `apps/admin/app/sign-in/page.tsx`: a minimal email/password form (reuse
  `@repo/ui` + `authClient.signIn.email`), mirroring `apps/web`'s sign-in a11y/PasswordInput
  pattern. Shared `@repo/db` users → the same credentials work; this is a separate session for
  the admin origin.
- **Gated dashboard** — `apps/admin/app/(dashboard)/layout.tsx` + `page.tsx`. The page calls
  `requireAdmin()` then renders the shell. To justify the seam with a **real consumer** (not a
  stub), the shell shows cross-owner counts — total tasks and total subscriptions across all
  users — fetched via `db.select(count).from(task).where(acrossAllOwners())` AFTER
  `requireAdmin()`. This exercises the role-gated `acrossAllOwners()` path end-to-end.
- **Landing** — `apps/admin/app/page.tsx` replaces the scaffold placeholder with a redirect to
  `/(dashboard)` (which in turn bounces unauthenticated/non-admin users).
- **Security** — wire `@repo/config/headers` into `apps/admin/next.config.ts` `headers()` and
  add `apps/admin/proxy.ts` minting a per-request nonce CSP (`@repo/config/csp`) + the
  `@repo/security` auth rate-limiter on `/api/auth/*`. Mirror `apps/web/proxy.ts` MINUS the
  i18n + analytics/Sentry `connect-src` (admin has neither): CSP `connect-src 'self'` suffices.

---

## 7. Error handling
- Unauthorized (no session) → `redirect("/sign-in")` (UX, not an error to the client).
- Authenticated-but-not-admin → `notFound()` (404) so the admin surface is not even
  acknowledged to a normal user.
- DB/auth errors propagate to Next's error boundary; `@repo/observability` logger already wraps
  server failures. No new error surface introduced.
- The promote-admin script exits non-zero with a clear message if the email has no user row.

---

## 8. Testing & QA (the bar before merge)
1. **DB schema** (`@repo/db`, existing vitest): a seeded user defaults to `role:"user"`; the
   existing `owner-scope.test.ts` invariants still pass (new nullable columns don't perturb
   them). The pg mirror schema gains the same columns; `pg-compat` stays green.
2. **Admin e2e (NEW harness) — this IS the gate proof** (no separate vitest in `apps/admin`;
   the e2e exercises the real session + real `requireAdmin`, a stronger test than mocking):
   `apps/admin/playwright.config.ts` (webServer = `next build && next start` on 3200) +
   `apps/admin/e2e/fixtures.ts` (per-test `x-forwarded-for`, mirroring the web flake fix) + a
   spec: with `ADMIN_EMAILS=admin@example.com`, sign up that email → reaches the dashboard +
   sees the counts; sign up a normal email → bounced (404/redirect) from `/(dashboard)`.
4. **Full gate:** `pnpm lint && pnpm check-types && pnpm build && pnpm test` green (incl.
   `apps/admin` build, which currently fails locally only on missing env — the e2e/build env
   provides `BETTER_AUTH_SECRET` etc.).
5. **Regression:** `apps/web` e2e (48) still green.
6. **CI:** Node 22/24 + pg-compat + both e2e suites green, THEN ff-merge to main.

---

## 9. File-level change map
**Create**
- `apps/admin/lib/admin-actions.ts` — `requireAdminSession`/`requireAdmin`.
- `apps/admin/proxy.ts` — nonce CSP + auth rate-limit.
- `apps/admin/app/sign-in/page.tsx` — admin sign-in.
- `apps/admin/app/(dashboard)/layout.tsx` + `app/(dashboard)/page.tsx` — gated shell + counts.
- `apps/admin/playwright.config.ts`, `apps/admin/e2e/fixtures.ts`, `apps/admin/e2e/admin-gate.spec.ts`.
- `packages/auth/scripts/promote-admin.ts` (+ `promote-admin` package script).
- A DB schema test addition (extend `@repo/db` tests) for the `role` default.

**Modify**
- `packages/db/src/schema.ts` + `packages/db/src/schema.pg.ts` — the new columns.
- `packages/auth/src/server.ts` — `admin()` plugin + create-hook promotion.
- `packages/auth/src/client.ts` — `adminClient()` + export admin methods.
- `packages/env/src/index.ts` — `ADMIN_EMAILS` (optional, server).
- `apps/admin/next.config.ts` — `@repo/config/headers`; `apps/admin/package.json` — add
  `@repo/config`, `@repo/security`, `@playwright/test` + `test:e2e` script; `apps/admin/app/page.tsx`
  — redirect to the dashboard. (Root `layout.tsx` is unchanged — SP1 needs no new providers; the
  sign-in form is a client component using the `authClient` singleton directly.)

**No removals.**

---

## 10. Open risks / caveats
- **Schema regen:** columns are added by hand (matching the plugin's field names) rather than
  re-running `@better-auth/cli generate`, to avoid churning the whole generated file. If a
  future Better Auth bump changes admin-plugin field names, regenerate.
- **`apps/admin` build needs env:** it fails locally today purely because no `.env` is present
  (true on main too); CI/e2e supply the auth env. Not introduced by SP1.
- **Two-place owner list already exists** (owner-scope rule option) — unrelated to SP1.
- **Admin e2e harness is net-new infra** (playwright wasn't set up for `apps/admin`); it is the
  agreed cost for proving the security-critical gate.
- **`acrossAllOwners()` still has no lint enforcement that it's only used behind `requireAdmin`**
  — SP1 relies on convention + the gated call site + tests. A lint/boundary check could be added
  later if admin read paths proliferate (YAGNI for one consumer).
