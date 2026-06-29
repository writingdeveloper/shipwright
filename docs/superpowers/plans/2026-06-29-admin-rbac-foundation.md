# Admin RBAC Foundation + Admin App Shell (SP1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real `role` (Better Auth `admin()` plugin) + a `requireAdmin()` data-layer guard + a bootstrap, and fill `apps/admin` into a role-gated shell whose dashboard is the first real `acrossAllOwners()` consumer — proven by a new admin e2e harness.

**Architecture:** Schema gains the admin-plugin columns (libSQL + pg mirror). `@repo/auth` registers `admin()` (server) + `adminClient()` (client) and promotes `ADMIN_EMAILS` signups to `role:"admin"`. `apps/admin` gets a sign-in page, a root gated dashboard (`requireAdmin()` → cross-owner counts), and the same security posture as `apps/web` (static headers + nonce CSP proxy).

**Tech Stack:** Better Auth 1.6.19 admin plugin, Drizzle (libSQL + pg), Next 16 (proxy.ts), Playwright, Vitest, pnpm/Turbo.

**Spec:** `docs/superpowers/specs/2026-06-29-admin-rbac-foundation-design.md`
**Branch:** `feat/admin-rbac-foundation` (already created).

**Verified ground truth (hardcoded below):**
- Better Auth 1.6.19 admin plugin: `import { admin } from "better-auth/plugins"`, `import { adminClient } from "better-auth/client/plugins"`. Default fields: `role`, `banned`, `banReason`, `banExpires` (user) + `impersonatedBy` (session); default `adminRoles: ["admin"]`.
- `@repo/config/csp`: `buildContentSecurityPolicy({ nonce, isDev, connectSrc })`, `generateNonce()`, `NONCE_HEADER`, `CONTENT_SECURITY_POLICY_HEADER`. `@repo/config/headers`: `securityHeaders`.
- Next 16 proxy contract: `export async function proxy(request): Promise<NextResponse>` + `export const config = { matcher }`.
- `apps/admin` shares `@repo/auth/db/env/ui`; has its own `/api/auth/[...all]` route, port 3200, no i18n, no proxy.ts, no security headers.
- pg mirror column style: `boolean(_)`, `text(_)`, `timestamp(_, { withTimezone: true })`.

**Route-group note:** the spec mentioned a `(dashboard)` group, but a route group does not change the URL — `app/(dashboard)/page.tsx` and `app/page.tsx` both map to `/` and collide. SP1 therefore makes the **root `app/page.tsx` itself the gated dashboard**; `app/sign-in/page.tsx` is the sign-in. Same intent, no collision.

---

## File Structure
**Create:** `apps/admin/lib/admin-actions.ts`, `apps/admin/proxy.ts`, `apps/admin/app/sign-in/page.tsx`, `apps/admin/playwright.config.ts`, `apps/admin/e2e/fixtures.ts`, `apps/admin/e2e/admin-gate.spec.ts`, `packages/auth/scripts/promote-admin.ts`, `packages/db/test/user-role.test.ts`.
**Modify:** `packages/db/src/schema.ts`, `packages/db/src/schema.pg.ts`, `packages/db/src/index.ts`, `packages/auth/src/server.ts`, `packages/auth/src/client.ts`, `packages/auth/package.json`, `packages/env/src/index.ts`, `apps/admin/app/page.tsx`, `apps/admin/next.config.ts`, `apps/admin/package.json`.

---

## Task 1: Schema columns + `count` export + role-default test (TDD)

**Files:** `packages/db/test/user-role.test.ts` (create), `packages/db/src/schema.ts`, `packages/db/src/schema.pg.ts`, `packages/db/src/index.ts`

- [ ] **Step 1: Write the failing test** — `packages/db/test/user-role.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { user } from "../src/schema";
import { createTestDb, seedUser, type TestDb } from "./helpers";

/** The admin RBAC foundation: every user is a non-admin until promoted. */
describe("user.role default (real libSQL)", () => {
  let ctx: TestDb;
  beforeAll(() => {
    ctx = createTestDb();
  }, 60_000);
  afterAll(() => ctx?.cleanup());

  it("a seeded user defaults to role 'user'", async () => {
    await seedUser(ctx, { id: "u1", email: "u1@example.com", name: "U1" });
    const [row] = await ctx.db.select().from(user).where(eq(user.id, "u1"));
    expect(row?.role).toBe("user");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @repo/db test -- user-role`
Expected: FAIL — `row.role` is `undefined` (no `role` column yet), so `toBe("user")` fails.

- [ ] **Step 3: Add the columns to `packages/db/src/schema.ts`**

In the `user` table, after `image: text("image"),` add:
```ts
  // Better Auth admin plugin fields. `role` drives RBAC (default non-admin);
  // banned/banReason/banExpires back the SP2 ban flow. Column names match the
  // plugin's defaults so the Drizzle adapter maps them with no extra config.
  role: text("role").default("user"),
  banned: integer("banned", { mode: "boolean" }),
  banReason: text("ban_reason"),
  banExpires: integer("ban_expires", { mode: "timestamp_ms" }),
```
In the `session` table, after `userAgent: text("user_agent"),` add:
```ts
  // Set by the admin plugin during impersonation (SP2); present now for schema
  // completeness so there is no second migration.
  impersonatedBy: text("impersonated_by"),
```

- [ ] **Step 4: Mirror into `packages/db/src/schema.pg.ts` (lockstep)**

In the pg `user` table, after `image: text("image"),` add:
```ts
  role: text("role").default("user"),
  banned: boolean("banned"),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
```
In the pg `session` table, after its `userAgent: text("user_agent"),` add:
```ts
  impersonatedBy: text("impersonated_by"),
```

- [ ] **Step 5: Add `count` to the `@repo/db` operator re-exports** (the dashboard needs it)

In `packages/db/src/index.ts`, change:
```ts
export { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
```
to:
```ts
export { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
```

- [ ] **Step 6: Run the test + the full db suite to verify pass + no regression**

Run: `pnpm --filter @repo/db test`
Expected: PASS — `user.role default` green AND the existing `owner-scope.test.ts` (5) still green.

- [ ] **Step 7: Type-check**

Run: `pnpm --filter @repo/db check-types`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/db
git commit -m "feat(db): admin-plugin columns (role/banned/…) + count export + role-default test"
```

---

## Task 2: `ADMIN_EMAILS` env var

**Files:** `packages/env/src/index.ts`

- [ ] **Step 1: Read the file** to find the server `BETTER_AUTH_SECRET` block.

Run: `grep -n "BETTER_AUTH_SECRET\|server:" packages/env/src/index.ts`

- [ ] **Step 2: Add `ADMIN_EMAILS`** as an OPTIONAL server var, next to the other auth server vars (inside the `server: { … }` object of the `createEnv` call):
```ts
    // Comma-separated emails promoted to role "admin" on sign-up (bootstrap for
    // the first admin). Optional — empty in keyless/CI/dev means no env-seeded
    // admins. Validated as a plain string; parsing/splitting happens at use.
    ADMIN_EMAILS: z.string().optional(),
```
And add `ADMIN_EMAILS: process.env.ADMIN_EMAILS,` to the `runtimeEnv`/`experimental__runtimeEnv` mapping block (match whichever the file uses for other server vars).

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @repo/env check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/env
git commit -m "feat(env): optional ADMIN_EMAILS (first-admin bootstrap allowlist)"
```

---

## Task 3: `admin()` server plugin + create-hook promotion

**Files:** `packages/auth/src/server.ts`

- [ ] **Step 1: Add imports** at the top of `packages/auth/src/server.ts`:
```ts
import { admin } from "better-auth/plugins";
```
And ensure `eq` is imported from `@repo/db` (the file already imports `db, schema`); change that import to include `eq`:
```ts
import { db, eq, schema } from "@repo/db";
```

- [ ] **Step 2: Register the plugin** — add a `plugins` array to the `betterAuth({ … })` config (e.g. right after the `socialProviders` block):
```ts
  // RBAC via the vetted admin plugin (role/banned columns live in @repo/db).
  // Default adminRoles: ["admin"]. No hand-rolled authorization.
  plugins: [admin()],
```

- [ ] **Step 3: Promote bootstrap admins in the existing create-hook.** Replace the body of `databaseHooks.user.create.after` so it promotes matching emails BEFORE the (still fire-and-forget) welcome email:
```ts
        after: async (user) => {
          // Bootstrap: promote allow-listed emails to role "admin" at creation
          // so the first admin exists with a real role (the admin plugin's API
          // authorizes on `role`). Awaited — a fast local UPDATE — so the role is
          // set before the account is useful. Empty ADMIN_EMAILS → no-op.
          const adminEmails = (env.ADMIN_EMAILS ?? "")
            .split(",")
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean);
          if (adminEmails.includes(user.email.toLowerCase())) {
            await db
              .update(schema.user)
              .set({ role: "admin" })
              .where(eq(schema.user.id, user.id));
          }
          // Welcome email stays best-effort and must never block/break sign-up.
          void sendWelcomeEmail({
            to: user.email,
            name: user.name,
            actionUrl: env.BETTER_AUTH_URL,
          }).catch(() => {
            // Swallowed by design: email is best-effort.
          });
        },
```

- [ ] **Step 4: Type-check** (`session`/`user` types now include `role` via the plugin's `$Infer`).

Run: `pnpm --filter @repo/auth check-types`
Expected: PASS.

- [ ] **Step 5: Lint** (the `schema.user` update is on a NON-owner table, so `no-unscoped-owner-table` does not fire).

Run: `pnpm --filter @repo/auth lint`
Expected: PASS (exit 0).

- [ ] **Step 6: Commit**

```bash
git add packages/auth/src/server.ts
git commit -m "feat(auth): admin() plugin + ADMIN_EMAILS create-hook promotion"
```

---

## Task 4: `adminClient()` on the auth client

**Files:** `packages/auth/src/client.ts`

- [ ] **Step 1: Add the import + plugin** in `packages/auth/src/client.ts`:
```ts
import { adminClient } from "better-auth/client/plugins";
```
Change the `createAuthClient({ … })` call to register the plugin:
```ts
export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_BETTER_AUTH_URL,
  plugins: [adminClient()],
});
```
(The exported `signIn`/`signOut`/… destructure stays as-is; `authClient.admin.*` is now available for SP2.)

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @repo/auth check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/auth/src/client.ts
git commit -m "feat(auth): adminClient() plugin on the shared auth client"
```

---

## Task 5: `promote-admin` script (bootstrap an existing user)

**Files:** `packages/auth/scripts/promote-admin.ts` (create), `packages/auth/package.json`

- [ ] **Step 1: Create `packages/auth/scripts/promote-admin.ts`**
```ts
import { db, eq, schema } from "@repo/db";

/**
 * Idempotently set role "admin" for an existing user, by email. The documented
 * way to mint the very first admin on a DB that already has the user.
 *
 *   pnpm --filter @repo/auth promote-admin you@example.com
 *
 * Exits non-zero with a clear message if no user has that email.
 */
async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: promote-admin <email>");
    process.exit(1);
  }
  const rows = await db
    .update(schema.user)
    .set({ role: "admin" })
    .where(eq(schema.user.email, email))
    .returning({ id: schema.user.id });
  if (rows.length === 0) {
    console.error(`No user with email ${email}. Sign up first, then re-run.`);
    process.exit(1);
  }
  console.log(`Promoted ${email} to role "admin".`);
  process.exit(0);
}

void main();
```

- [ ] **Step 2: Add the package script** to `packages/auth/package.json` `scripts`:
```json
    "promote-admin": "tsx scripts/promote-admin.ts",
```
If `tsx` is not already a devDependency of `@repo/auth`, add it: in `devDependencies` add `"tsx": "^4.20.3"` (the repo already uses tsx elsewhere; match the version present in the lockfile — run `grep -m1 '\"tsx\"' pnpm-lock.yaml` to confirm, else use `^4.20.3`).

- [ ] **Step 3: Install if a dep was added**

Run: `pnpm install`
Expected: completes; lockfile updated only if `tsx` was added.

- [ ] **Step 4: Smoke-test the failure path** (no user → non-zero exit)

Run: `pnpm --filter @repo/auth promote-admin nobody@example.com`
Expected: prints "No user with email …" and exits non-zero (DATABASE_URL defaults to the package's local file; an absent user is the expected path here).

- [ ] **Step 5: Commit**

```bash
git add packages/auth/scripts/promote-admin.ts packages/auth/package.json pnpm-lock.yaml
git commit -m "feat(auth): promote-admin script (bootstrap an existing user to admin)"
```

---

## Task 6: apps/admin security posture (deps + headers + nonce CSP proxy)

**Files:** `apps/admin/package.json`, `apps/admin/next.config.ts`, `apps/admin/proxy.ts` (create)

- [ ] **Step 1: Add deps** to `apps/admin/package.json` `dependencies`:
```json
    "@repo/config": "workspace:*",
    "@repo/observability": "workspace:*",
    "@repo/security": "workspace:*",
```

- [ ] **Step 2: Wire static headers + transpile** in `apps/admin/next.config.ts`. Add the import:
```ts
import { securityHeaders } from "@repo/config/headers";
```
Add the three packages to `transpilePackages` (so it becomes `["@repo/auth", "@repo/config", "@repo/db", "@repo/env", "@repo/observability", "@repo/security", "@repo/ui"]`) and add a `headers()` to `nextConfig`:
```ts
  async headers() {
    return [{ source: "/:path*", headers: [...securityHeaders] }];
  },
```

- [ ] **Step 3: Create `apps/admin/proxy.ts`** (nonce CSP + auth rate-limit; no i18n/analytics — simpler than web's):
```ts
import { NextResponse, type NextRequest } from "next/server";
import {
  buildContentSecurityPolicy,
  CONTENT_SECURITY_POLICY_HEADER,
  generateNonce,
  NONCE_HEADER,
} from "@repo/config/csp";
import { logger } from "@repo/observability/logger";
import { createRateLimiter } from "@repo/security/ratelimit";

/**
 * Nonce CSP + auth rate-limit for the admin app (Next 16 proxy.ts). The admin
 * app has no i18n and no analytics/Sentry, so this is the web proxy minus the
 * locale layer: `connect-src 'self'` covers same-origin `/api/auth/*`.
 */
const AUTH_PATH_PREFIX = "/api/auth";
const authRateLimiter = createRateLimiter({
  limit: 10,
  windowMs: 10_000,
  prefix: "admin-auth",
});

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "127.0.0.1";
}

async function enforceAuthRateLimit(
  request: NextRequest,
): Promise<NextResponse | null> {
  const ip = clientIp(request);
  const { success, remaining, reset, limit } = await authRateLimiter.limit(ip);
  if (success) return null;
  const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  logger.warn("admin auth rate limit exceeded", { ip, retryAfterSec });
  return NextResponse.json(
    { error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        "RateLimit-Limit": String(limit),
        "RateLimit-Remaining": String(remaining),
        "RateLimit-Reset": String(Math.ceil(reset / 1000)),
      },
    },
  );
}

function withCsp(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV === "development";
  const csp = buildContentSecurityPolicy({ nonce, isDev });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set(CONTENT_SECURITY_POLICY_HEADER, csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CONTENT_SECURITY_POLICY_HEADER, csp);
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname.startsWith(AUTH_PATH_PREFIX)) {
    if (request.method === "POST") {
      const limited = await enforceAuthRateLimit(request);
      if (limited) return limited;
    }
    return NextResponse.next();
  }
  return withCsp(request);
}

export const config = {
  matcher: [
    "/api/auth/:path*",
    {
      source: "/((?!api|_next|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
```

- [ ] **Step 4: Install + type-check**

Run: `pnpm install && pnpm --filter admin check-types`
Expected: PASS (admin now resolves `@repo/config`/`@repo/security`/`@repo/observability`).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/package.json apps/admin/next.config.ts apps/admin/proxy.ts pnpm-lock.yaml
git commit -m "feat(admin): security posture — static headers + nonce CSP proxy + rate-limit"
```

---

## Task 7: `requireAdmin()` guard

**Files:** `apps/admin/lib/admin-actions.ts` (create)

- [ ] **Step 1: Create `apps/admin/lib/admin-actions.ts`**
```ts
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth, type Session } from "@repo/auth/server";

/**
 * Admin gate, verified at the DATA LAYER (repo rule — never trust the layout
 * alone). Mirrors apps/web's requireSession, but additionally requires
 * role "admin":
 *   - no session            → redirect to /sign-in
 *   - signed in, not admin  → notFound() (404 — don't acknowledge the surface)
 * Single source of truth is `user.role`; the ADMIN_EMAILS allowlist only SEEDS
 * that role at sign-up (see @repo/auth server create-hook).
 */
export async function requireAdminSession(): Promise<Session> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }
  if (session.user.role !== "admin") {
    notFound();
  }
  return session;
}

/** Convenience: the signed-in admin's user id. */
export async function requireAdmin(): Promise<string> {
  const session = await requireAdminSession();
  return session.user.id;
}
```
If `session.user.role` is not surfaced by the inferred type, read it as `(session.user as { role?: string | null }).role` — but with the `admin()` plugin on the server (Task 3), `$Infer` should expose `role`; resolve this at the check-types step, not by loosening preemptively.

- [ ] **Step 2: Type-check**

Run: `pnpm --filter admin check-types`
Expected: PASS. (If `role` is missing from the type, the admin plugin's `$Infer` isn't flowing — verify Task 3's `plugins: [admin()]` and that `type Session` is `Auth["$Infer"]["Session"]`.)

- [ ] **Step 3: Commit**

```bash
git add apps/admin/lib/admin-actions.ts
git commit -m "feat(admin): requireAdmin/requireAdminSession data-layer guard"
```

---

## Task 8: Admin sign-in page

**Files:** `apps/admin/app/sign-in/page.tsx` (create)

- [ ] **Step 1: Create `apps/admin/app/sign-in/page.tsx`** (minimal mirror of web's sign-in — no social, no i18n, plain password input):
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@repo/auth/client";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";

export default function AdminSignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const { error } = await authClient.signIn.email({ email, password });
    setPending(false);
    if (error) {
      setError(error.message ?? "Invalid email or password.");
      document.getElementById("email")?.focus();
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main
      id="main"
      className="bg-background flex min-h-svh items-center justify-center p-6"
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle asChild>
            <h1>Admin sign in</h1>
          </CardTitle>
          <CardDescription>Sign in with an admin account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter admin check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/admin/app/sign-in/page.tsx"
git commit -m "feat(admin): sign-in page"
```

---

## Task 9: Gated dashboard (root) with cross-owner counts

**Files:** `apps/admin/app/page.tsx` (replace scaffold)

- [ ] **Step 1: Replace `apps/admin/app/page.tsx`** with the gated dashboard — the first real `acrossAllOwners()` consumer:
```tsx
import {
  acrossAllOwners,
  count,
  db,
  subscription,
  task,
} from "@repo/db";

import { requireAdmin } from "../lib/admin-actions";

/**
 * Admin dashboard (root, gated). `requireAdmin()` runs at the data layer before
 * any read. The cross-owner counts are the first real consumer of the
 * `acrossAllOwners()` seam: a deliberate, role-gated read across all owners
 * (contrast the per-user `ownedBy`/`ownedRow` the user app uses).
 */
export default async function AdminDashboard() {
  await requireAdmin();

  const [taskRows, subRows] = await Promise.all([
    db.select({ value: count() }).from(task).where(acrossAllOwners()),
    db.select({ value: count() }).from(subscription).where(acrossAllOwners()),
  ]);

  return (
    <main id="main" className="bg-background min-h-svh p-6">
      <h1 className="text-2xl font-semibold">Admin dashboard</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Cross-owner totals (role-gated via acrossAllOwners).
      </p>
      <dl className="mt-6 grid max-w-md grid-cols-2 gap-4">
        <div>
          <dt className="text-muted-foreground text-sm">Total tasks</dt>
          <dd data-testid="task-count" className="text-3xl font-bold">
            {taskRows[0]?.value ?? 0}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Total subscriptions</dt>
          <dd data-testid="sub-count" className="text-3xl font-bold">
            {subRows[0]?.value ?? 0}
          </dd>
        </div>
      </dl>
    </main>
  );
}
```

- [ ] **Step 2: Lint** (the two `.from(task|subscription).where(acrossAllOwners())` queries satisfy `no-unscoped-owner-table`).

Run: `pnpm --filter admin lint`
Expected: PASS (exit 0).

- [ ] **Step 3: Type-check**

Run: `pnpm --filter admin check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "apps/admin/app/page.tsx"
git commit -m "feat(admin): gated dashboard root — cross-owner counts via acrossAllOwners"
```

---

## Task 10: Admin e2e harness (the gate proof)

**Files:** `apps/admin/playwright.config.ts`, `apps/admin/e2e/fixtures.ts`, `apps/admin/e2e/admin-gate.spec.ts` (create), `apps/admin/package.json`

- [ ] **Step 1: Add the e2e dep + script** to `apps/admin/package.json`. In `devDependencies` add `"@playwright/test": "^1.56.1"` (match the version in `apps/web/package.json` — run `grep playwright apps/web/package.json`). In `scripts` add:
```json
    "test:e2e": "playwright test",
```

- [ ] **Step 2: Create `apps/admin/playwright.config.ts`** (mirror web's: throwaway libSQL, `db:push`, prod build, isolated port 3300, `ADMIN_EMAILS` set):
```ts
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 3300; // web e2e uses 3100, admin dev 3200 — avoid both.
const BASE_URL = `http://localhost:${PORT}`;
const DB_DIR = path.resolve(__dirname, "..", "..");
const isCI = !!process.env.CI;

const tempDir = mkdtempSync(path.join(tmpdir(), "shipwright-admin-e2e-"));
const dbPath = path.join(tempDir, "e2e.db");
const DATABASE_URL = `file:${dbPath.split(path.sep).join("/")}`;

execFileSync("pnpm", ["--filter", "@repo/db", "db:push"], {
  cwd: DB_DIR,
  env: { ...process.env, DATABASE_URL },
  stdio: "inherit",
  shell: true,
});

const serverEnv = {
  ...process.env,
  DATABASE_URL,
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ??
    "e2e-test-secret-please-change-in-real-deployments-0123456789",
  BETTER_AUTH_URL: BASE_URL,
  NEXT_PUBLIC_BETTER_AUTH_URL: BASE_URL,
  // The bootstrap allowlist: this email becomes role "admin" on sign-up.
  ADMIN_EMAILS: "admin@example.com",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL: BASE_URL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next build && pnpm exec next start -p ${PORT}`,
    url: BASE_URL,
    cwd: __dirname,
    env: serverEnv,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});
```

- [ ] **Step 3: Create `apps/admin/e2e/fixtures.ts`** (per-test client IP — the same flake fix the web suite uses):
```ts
import { test as base } from "@playwright/test";

// Each test gets its own x-forwarded-for so the proxy's auth rate limiter (keyed
// on the left-most hop) can't let serial sign-ups/sign-ins throttle each other.
// Mirrors apps/web/e2e/fixtures.ts.
let counter = 0;
function uniqueClientIp(): string {
  const n = counter++;
  return `10.${(n >> 8) & 0xff}.${n & 0xff}.1`;
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": uniqueClientIp() });
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(context);
  },
});

export * from "@playwright/test";
```

- [ ] **Step 4: Create `apps/admin/e2e/admin-gate.spec.ts`**
```ts
import { expect, test } from "./fixtures";

const PASSWORD = "password1234"; // ≥ 8 (Better Auth minPasswordLength).

/** Sign up via the Better Auth API (auto-creates a session), then clear it so
 *  the test drives the real sign-in UI from a clean state. */
async function signUp(
  request: import("@playwright/test").APIRequestContext,
  email: string,
): Promise<void> {
  const res = await request.post("/api/auth/sign-up/email", {
    data: { email, password: PASSWORD, name: email },
  });
  expect(res.ok()).toBeTruthy();
}

async function signInViaUi(
  page: import("@playwright/test").Page,
  email: string,
): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("admin (allow-listed email) reaches the gated dashboard", async ({
  page,
}) => {
  await signUp(page.request, "admin@example.com"); // ADMIN_EMAILS → role admin
  await page.context().clearCookies();

  await signInViaUi(page, "admin@example.com");

  await expect(
    page.getByRole("heading", { name: "Admin dashboard" }),
  ).toBeVisible();
  await expect(page.getByTestId("task-count")).toBeVisible();
  await expect(page.getByTestId("sub-count")).toBeVisible();
});

test("a non-admin is bounced from the dashboard", async ({ page }) => {
  await signUp(page.request, "normal-user@example.com"); // not allow-listed
  await page.context().clearCookies();

  await signInViaUi(page, "normal-user@example.com");

  // requireAdmin() → notFound(): the dashboard heading must never render.
  await expect(
    page.getByRole("heading", { name: "Admin dashboard" }),
  ).toHaveCount(0);
});
```

- [ ] **Step 5: Run the admin e2e**

Run: `pnpm --filter admin test:e2e`
Expected: 2 passed. (If sign-in submit races the navigation, the `getByRole heading` / `toHaveCount(0)` assertions auto-wait via the 10s expect timeout.)

- [ ] **Step 6: Commit**

```bash
git add apps/admin/playwright.config.ts apps/admin/e2e apps/admin/package.json pnpm-lock.yaml
git commit -m "test(admin): e2e harness — admin reaches dashboard, non-admin bounced"
```

---

## Task 11: Full QA + finish

- [ ] **Step 1: Full gate**

Run: `pnpm lint && pnpm check-types && pnpm test`
Expected: all PASS (db: owner-scope 5 + user-role 1; others unchanged).

- [ ] **Step 2: Build (excl. admin's pre-existing local-env failure)**

Run: `pnpm exec turbo run build --filter='!admin'`
Expected: PASS. (Admin build needs auth env; it builds in CI/e2e where env is supplied. Confirm web still builds.)

- [ ] **Step 3: web e2e regression (48 unchanged)**

Run: `pnpm --filter web test:e2e`
Expected: 48 passed (role column defaults + the no-op create-hook without ADMIN_EMAILS don't change any web behaviour).

- [ ] **Step 4: admin e2e**

Run: `pnpm --filter admin test:e2e`
Expected: 2 passed.

- [ ] **Step 5: Finish the branch** — invoke `superpowers:finishing-a-development-branch`: push, open a PR, wait for CI (Node 22/24 + pg-compat + both e2e suites) green, then ff-merge to `main`. **CI must run the admin e2e** — if `.github/workflows/ci.yml` only runs `apps/web` e2e, add an admin e2e step/job (mirror the web e2e job, `pnpm --filter admin test:e2e`, with the same Playwright browser install). Verify this before merging.

---

## Self-Review

**Spec coverage:** §2 component map → Tasks 1–10. §3 schema → Task 1 (libSQL+pg). §4 plugin wiring → Tasks 3 (server) + 4 (client). §5 guard+bootstrap → Task 7 (guard), Task 3 (create-hook), Task 5 (promote script), Task 2 (env). §6 shell → Task 6 (security), 8 (sign-in), 9 (dashboard root — route-group collision resolved to root page). §7 error handling → Task 7 (redirect/notFound). §8 testing → Task 1 (role default), Task 10 (e2e), Task 11 (gate+regression+CI). §9 file map → matches. §10 caveats (admin build env, net-new e2e infra) → Tasks 6/10/11.

**Placeholder scan:** none — exact paths, full code, exact commands + expected output. The two "match the version in the lockfile/web" notes (tsx, @playwright/test) include a concrete fallback version and the grep to confirm — not placeholders.

**Type consistency:** `requireAdmin()`→`string`, `requireAdminSession()`→`Session`, `acrossAllOwners()` (no args), `count()` from `@repo/db`, `role`/`banned`/`banReason`/`banExpires`/`impersonatedBy` identical across schema (Task 1), guard (Task 7), e2e (Task 10). `ADMIN_EMAILS` identical in env (Task 2), server hook (Task 3), playwright env (Task 10). Dashboard testids `task-count`/`sub-count` identical in Task 9 + Task 10.
