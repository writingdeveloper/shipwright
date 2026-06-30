# Admin User Management + Audit Log (SP2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin app a user list (search + pagination) with role/ban/delete actions — each a `requireAdmin`-gated Server Action that records an `audit_log` row — plus an audit-log view, with a self-protection guard.

**Architecture:** A new non-owner `audit_log` table + `recordAuditLog` helper in `@repo/db`. Mutations are Server Actions in `apps/admin` calling the Better Auth admin server API (`auth.api.*`) — so no client `adminClient()` is ever needed (SP1's TS2742 stays avoided). The user list is an RSC reading `auth.api.listUsers`.

**Tech Stack:** Better Auth 1.6.19 admin plugin (server API), Drizzle (libSQL + pg), Next 16 App Router (Server Actions), Playwright, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-29-admin-user-management-design.md`
**Branch:** `feat/admin-user-management` (already created).

**Verified ground truth (hardcoded below):**
- `auth.api.listUsers({ query: { searchValue?, searchField?, searchOperator?, limit?, offset? }, headers })` → `{ users: UserWithRole[], total, limit, offset }`.
- `auth.api.setRole({ body: { userId, role }, headers })`, `auth.api.banUser({ body: { userId, banReason?, banExpiresIn? }, headers })`, `auth.api.unbanUser({ body: { userId }, headers })`, `auth.api.removeUser({ body: { userId }, headers })`.
- `@repo/ui` has `button` (variants default/destructive/outline/secondary/ghost; sizes default/sm/lg/icon), `input`, `label`, `card`, `checkbox` — **no table/select/badge** (use native `<table>` + spans).
- `@repo/db` exports `db`, `type Database`, `desc`, and (after Task 1) `auditLog`/`recordAuditLog`. SP1 added `requireAdmin`/`requireAdminSession` in `apps/admin/lib/admin-actions.ts`.
- `audit_log` is NOT an owner table → the `no-unscoped-owner-table` rule does not apply to it.

---

## File Structure
**Create:** `packages/db/src/audit.ts`, `packages/db/test/audit.test.ts`, `apps/admin/lib/user-actions.ts`, `apps/admin/app/users/page.tsx`, `apps/admin/app/users/delete-user-button.tsx`, `apps/admin/app/audit/page.tsx`, `apps/admin/e2e/admin-users.spec.ts`.
**Modify:** `packages/db/src/schema.ts`, `packages/db/src/schema.pg.ts`, `packages/db/src/index.ts`, `apps/admin/app/page.tsx`.

---

## Task 1: `audit_log` table + `recordAuditLog` helper (TDD)

**Files:** `packages/db/test/audit.test.ts` (create), `packages/db/src/schema.ts`, `packages/db/src/schema.pg.ts`, `packages/db/src/audit.ts` (create), `packages/db/src/index.ts`

- [ ] **Step 1: Write the failing test** — `packages/db/test/audit.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { desc } from "drizzle-orm";

import { auditLog } from "../src/schema";
import { recordAuditLog } from "../src/audit";
import { createTestDb, type TestDb } from "./helpers";

/** The admin audit trail: recordAuditLog inserts a row that round-trips, with
 *  object metadata stored as JSON. */
describe("recordAuditLog (real libSQL)", () => {
  let ctx: TestDb;
  beforeAll(() => {
    ctx = createTestDb();
  }, 60_000);
  afterAll(() => ctx?.cleanup());

  it("records an action with JSON metadata that round-trips", async () => {
    await recordAuditLog(
      {
        actorUserId: "admin-1",
        action: "user.role.set",
        targetType: "user",
        targetId: "user-2",
        metadata: { role: "admin" },
      },
      ctx.db,
    );

    const [row] = await ctx.db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt));
    expect(row?.actorUserId).toBe("admin-1");
    expect(row?.action).toBe("user.role.set");
    expect(row?.targetType).toBe("user");
    expect(row?.targetId).toBe("user-2");
    expect(JSON.parse(row!.metadata!)).toEqual({ role: "admin" });
    expect(row?.createdAt).toBeInstanceOf(Date);
  });

  it("stores null metadata when none is given", async () => {
    await recordAuditLog(
      { actorUserId: "a", action: "user.unban", targetType: "user", targetId: "b" },
      ctx.db,
    );
    const rows = await ctx.db.select().from(auditLog);
    expect(rows.some((r) => r.metadata === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @repo/db test -- audit`
Expected: FAIL — cannot resolve `../src/audit` (and `auditLog` not exported yet).

- [ ] **Step 3: Add the `audit_log` table to `packages/db/src/schema.ts`** (after the `subscription` table, before the `relations` block):

```ts
/**
 * Admin audit log (owned by the admin app). One row per sensitive admin action
 * (role change / ban / unban / delete). INFRASTRUCTURE, not user-owned data — so
 * it is NOT in `OWNER_TABLES` and reads are gated by `requireAdmin`, not
 * owner-scoped. `actorUserId`/`targetId` are plain text with NO FK on purpose:
 * the record of an action (especially a delete) must survive even after the
 * actor or target user row is gone — audit integrity.
 */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actorUserId: text("actor_user_id").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadata: text("metadata"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [index("auditLog_createdAt_idx").on(table.createdAt)],
);
```
Add `auditLog,` to the `schema` aggregate object at the bottom of the file.

- [ ] **Step 4: Mirror into `packages/db/src/schema.pg.ts`** (after the pg `subscription` table, before relations):

```ts
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("auditLog_createdAt_idx").on(table.createdAt)],
);
```
Add `auditLog,` to the pg `schema` aggregate.

- [ ] **Step 5: Create `packages/db/src/audit.ts`**

```ts
import { db, type Database } from "./client";
import { auditLog } from "./schema";

/** One sensitive admin action to record in the audit log. */
export type AuditEntry = {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
};

/**
 * Append an audit-log row. `metadata` is JSON-stringified (or null). The `client`
 * defaults to the libSQL singleton; tests pass a throwaway db. Callers should
 * await this but treat a failure as non-fatal (log + continue) — the action it
 * records has already happened.
 */
export async function recordAuditLog(
  entry: AuditEntry,
  client: Database = db,
): Promise<void> {
  await client.insert(auditLog).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
  });
}
```

- [ ] **Step 6: Export from `packages/db/src/index.ts`** — append:

```ts
/** Admin audit log helper (the table itself is exported via `./schema`). */
export { recordAuditLog, type AuditEntry } from "./audit";
```

- [ ] **Step 7: Run the test + full db suite**

Run: `pnpm --filter @repo/db test`
Expected: PASS — `recordAuditLog` (2) green; `owner-scope` (5) + `user-role` (1) still green.

- [ ] **Step 8: Type-check + lint**

Run: `pnpm --filter @repo/db check-types && pnpm --filter @repo/db lint`
Expected: PASS (the `auditLog` reads in the test use no scope helper, which is correct — it is not an owner table).

- [ ] **Step 9: Commit**

```bash
git add packages/db
git commit -m "feat(db): audit_log table (non-owner) + recordAuditLog helper"
```

---

## Task 2: User-management Server Actions

**Files:** `apps/admin/lib/user-actions.ts` (create)

- [ ] **Step 1: Create `apps/admin/lib/user-actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@repo/auth/server";
import { recordAuditLog } from "@repo/db";
import { logger } from "@repo/observability/logger";

import { requireAdmin } from "./admin-actions";

/**
 * Admin user-management mutations. Each verifies `requireAdmin()` at the data
 * layer (repo rule — never trust the page), refuses to act on the admin's OWN
 * account for destructive ops (self-protection — you can't lock yourself out),
 * calls the Better Auth admin server API (which ALSO authorizes on the caller's
 * session role), then records an audit-log row. Mutations are Server Actions
 * (CSRF + progressive enhancement), so the client never calls an admin method —
 * no `adminClient()` plugin is needed.
 */

/** Best-effort audit write — log + continue if it fails (the action already happened). */
async function audit(
  actorUserId: string,
  action: string,
  targetId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await recordAuditLog({ actorUserId, action, targetType: "user", targetId, metadata });
  } catch (error) {
    logger.error("audit log write failed", { error, action, targetId });
  }
}

export async function setUserRole(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = formData.get("role") === "admin" ? "admin" : "user";
  if (!userId) return;
  // Never change your own role (prevents an admin self-demoting to lockout).
  if (userId === actorId) return;
  await auth.api.setRole({ body: { userId, role }, headers: await headers() });
  await audit(actorId, "user.role.set", userId, { role });
  revalidatePath("/users");
}

export async function banUserAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId || userId === actorId) return; // can't ban yourself
  const reason = String(formData.get("reason") ?? "").trim();
  await auth.api.banUser({
    body: { userId, ...(reason ? { banReason: reason } : {}) },
    headers: await headers(),
  });
  await audit(actorId, "user.ban", userId, reason ? { banReason: reason } : undefined);
  revalidatePath("/users");
}

export async function unbanUserAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  await auth.api.unbanUser({ body: { userId }, headers: await headers() });
  await audit(actorId, "user.unban", userId);
  revalidatePath("/users");
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId || userId === actorId) return; // can't delete yourself
  await auth.api.removeUser({ body: { userId }, headers: await headers() });
  await audit(actorId, "user.delete", userId);
  revalidatePath("/users");
}
```

- [ ] **Step 2: Type-check** (verifies the `auth.api.*` signatures resolve)

Run: `BETTER_AUTH_SECRET="ci-placeholder-secret-please-change-0123456789ab" BETTER_AUTH_URL="http://localhost:3200" NEXT_PUBLIC_BETTER_AUTH_URL="http://localhost:3200" DATABASE_URL="file:local.db" pnpm --filter admin check-types`
Expected: PASS. (If `auth.api.setRole`/`banUser`/etc. don't resolve, the admin plugin's API types aren't surfaced — confirm SP1's `plugins: [admin()]`.)

- [ ] **Step 3: Commit**

```bash
git add apps/admin/lib/user-actions.ts
git commit -m "feat(admin): user-management Server Actions (role/ban/delete) + audit"
```

---

## Task 3: Delete-user button (two-click confirm, client)

**Files:** `apps/admin/app/users/delete-user-button.tsx` (create)

- [ ] **Step 1: Create `apps/admin/app/users/delete-user-button.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@repo/ui/components/ui/button";

import { deleteUserAction } from "../../lib/user-actions";

/**
 * Two-click delete confirm — NO native `confirm()` (it blocks automation + is
 * poor UX). First click reveals Confirm/Cancel; Confirm submits the
 * `deleteUserAction` Server Action. Disabled for the signed-in admin's own row.
 */
export function DeleteUserButton({
  userId,
  disabled,
}: {
  userId: string;
  disabled?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (disabled) {
    return (
      <Button type="button" variant="destructive" size="sm" disabled>
        Delete
      </Button>
    );
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => setConfirming(true)}
      >
        Delete
      </Button>
    );
  }

  return (
    <form action={deleteUserAction} className="inline-flex gap-1">
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" variant="destructive" size="sm">
        Confirm
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setConfirming(false)}
      >
        Cancel
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Commit** (verified together with the page in Task 4)

```bash
git add apps/admin/app/users/delete-user-button.tsx
git commit -m "feat(admin): two-click delete-user confirm button"
```

---

## Task 4: `/users` page (RSC list + controls)

**Files:** `apps/admin/app/users/page.tsx` (create)

- [ ] **Step 1: Create `apps/admin/app/users/page.tsx`**

```tsx
import { headers } from "next/headers";
import { auth } from "@repo/auth/server";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";

import { requireAdminSession } from "../../lib/admin-actions";
import {
  banUserAction,
  setUserRole,
  unbanUserAction,
} from "../../lib/user-actions";
import { DeleteUserButton } from "./delete-user-button";

const PAGE_SIZE = 20;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await requireAdminSession();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { users, total } = await auth.api.listUsers({
    query: {
      limit: PAGE_SIZE,
      offset,
      ...(q
        ? { searchValue: q, searchField: "email", searchOperator: "contains" }
        : {}),
    },
    headers: await headers(),
  });

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main id="main" className="bg-background min-h-svh p-6">
      <nav className="mb-4 text-sm">
        <a href="/" className="underline">
          ← Dashboard
        </a>
      </nav>
      <h1 className="text-2xl font-semibold">Users</h1>

      <form method="get" className="mt-4 flex max-w-sm gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by email"
          aria-label="Search users by email"
        />
        <Button type="submit">Search</Button>
      </form>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Role</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isSelf = u.id === session.user.id;
            const isAdmin = u.role === "admin";
            const isBanned = Boolean(u.banned);
            return (
              <tr key={u.id} data-testid={`user-row-${u.email}`} className="border-b">
                <td className="py-2 pr-4">{u.email}</td>
                <td className="py-2 pr-4">{isAdmin ? "admin" : "user"}</td>
                <td className="py-2 pr-4">
                  {isBanned ? (
                    <span className="text-destructive">banned</span>
                  ) : (
                    <span className="text-muted-foreground">active</span>
                  )}
                </td>
                <td className="flex flex-wrap gap-2 py-2">
                  <form action={setUserRole}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="role" value={isAdmin ? "user" : "admin"} />
                    <Button type="submit" size="sm" variant="outline" disabled={isSelf}>
                      {isAdmin ? "Make user" : "Make admin"}
                    </Button>
                  </form>
                  <form action={isBanned ? unbanUserAction : banUserAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <Button type="submit" size="sm" variant="outline" disabled={isSelf}>
                      {isBanned ? "Unban" : "Ban"}
                    </Button>
                  </form>
                  <DeleteUserButton userId={u.id} disabled={isSelf} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="text-muted-foreground mt-4 flex items-center gap-4 text-sm">
        <span>
          Page {page} of {lastPage} · {total} users
        </span>
        {page > 1 ? (
          <a className="underline" href={`/users?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}>
            ← Prev
          </a>
        ) : null}
        {page < lastPage ? (
          <a className="underline" href={`/users?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}>
            Next →
          </a>
        ) : null}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Lint + type-check**

Run: `pnpm --filter admin lint && BETTER_AUTH_SECRET="ci-placeholder-secret-please-change-0123456789ab" BETTER_AUTH_URL="http://localhost:3200" NEXT_PUBLIC_BETTER_AUTH_URL="http://localhost:3200" DATABASE_URL="file:local.db" pnpm --filter admin check-types`
Expected: PASS. (If `u.role`/`u.banned` are not on the `listUsers` user type, the admin-plugin return type isn't inferred — read them via the typed result; do NOT cast to `any`.)

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/users/page.tsx
git commit -m "feat(admin): /users — RSC list (search + pagination) + row controls"
```

---

## Task 5: `/audit` page (RSC log)

**Files:** `apps/admin/app/audit/page.tsx` (create)

- [ ] **Step 1: Create `apps/admin/app/audit/page.tsx`**

```tsx
import { auditLog, db, desc } from "@repo/db";

import { requireAdmin } from "../../lib/admin-actions";

/** Admin audit log, newest first. `auditLog` is NOT an owner table — reads are
 *  gated by `requireAdmin`, not owner-scoped. */
export default async function AuditPage() {
  await requireAdmin();

  const rows = await db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.createdAt))
    .limit(100);

  return (
    <main id="main" className="bg-background min-h-svh p-6">
      <nav className="mb-4 text-sm">
        <a href="/" className="underline">
          ← Dashboard
        </a>
      </nav>
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Most recent {rows.length} admin actions.
      </p>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th className="py-2 pr-4">When</th>
            <th className="py-2 pr-4">Actor</th>
            <th className="py-2 pr-4">Action</th>
            <th className="py-2 pr-4">Target</th>
            <th className="py-2">Metadata</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-testid={`audit-row-${r.action}`} className="border-b">
              <td className="py-2 pr-4">{r.createdAt.toISOString()}</td>
              <td className="py-2 pr-4 font-mono text-xs">{r.actorUserId}</td>
              <td className="py-2 pr-4">{r.action}</td>
              <td className="py-2 pr-4 font-mono text-xs">{r.targetId}</td>
              <td className="py-2 font-mono text-xs">{r.metadata ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 2: Lint + type-check**

Run: `pnpm --filter admin lint && BETTER_AUTH_SECRET="ci-placeholder-secret-please-change-0123456789ab" BETTER_AUTH_URL="http://localhost:3200" NEXT_PUBLIC_BETTER_AUTH_URL="http://localhost:3200" DATABASE_URL="file:local.db" pnpm --filter admin check-types`
Expected: PASS. The `.from(auditLog)` query needs NO scope helper (auditLog is not an owner table) and the lint rule does not flag it.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/audit/page.tsx
git commit -m "feat(admin): /audit — newest-first audit log view"
```

---

## Task 6: Dashboard nav links

**Files:** `apps/admin/app/page.tsx` (modify)

- [ ] **Step 1: Add a nav block to `apps/admin/app/page.tsx`** — insert right after the `<p>…acrossAllOwners…</p>` line:

```tsx
      <nav className="mt-4 flex gap-4 text-sm">
        <a href="/users" className="underline">
          Manage users
        </a>
        <a href="/audit" className="underline">
          Audit log
        </a>
      </nav>
```

- [ ] **Step 2: Lint + type-check**

Run: `pnpm --filter admin lint && BETTER_AUTH_SECRET="ci-placeholder-secret-please-change-0123456789ab" BETTER_AUTH_URL="http://localhost:3200" NEXT_PUBLIC_BETTER_AUTH_URL="http://localhost:3200" DATABASE_URL="file:local.db" pnpm --filter admin check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/page.tsx
git commit -m "feat(admin): dashboard links to /users and /audit"
```

---

## Task 7: Admin user-management e2e

**Files:** `apps/admin/e2e/admin-users.spec.ts` (create)

- [ ] **Step 1: Create `apps/admin/e2e/admin-users.spec.ts`**

```ts
import type { APIRequestContext } from "@playwright/test";

import { expect, test } from "./fixtures";

const PASSWORD = "password1234";

async function signUp(request: APIRequestContext, email: string): Promise<void> {
  const res = await request.post("/api/auth/sign-up/email", {
    data: { email, password: PASSWORD, name: email },
  });
  expect(res.ok()).toBeTruthy();
}

test("admin manages users (role / ban / delete) and every action is audited", async ({
  page,
}) => {
  // Create a normal target first, then the admin LAST so the page context's
  // session is the admin (each sign-up replaces the context session).
  await signUp(page.request, "target-user@example.com");
  await signUp(page.request, "admin@example.com"); // ADMIN_EMAILS → role admin

  await page.goto("/users");
  const row = page.getByTestId("user-row-target-user@example.com");
  await expect(row).toBeVisible();

  // Promote target → admin.
  await row.getByRole("button", { name: "Make admin" }).click();
  await expect(
    page.getByTestId("user-row-target-user@example.com").getByText("admin", { exact: true }),
  ).toBeVisible();

  // Ban, then unban.
  await page.getByTestId("user-row-target-user@example.com").getByRole("button", { name: "Ban" }).click();
  await expect(
    page.getByTestId("user-row-target-user@example.com").getByText("banned"),
  ).toBeVisible();
  await page.getByTestId("user-row-target-user@example.com").getByRole("button", { name: "Unban" }).click();
  await expect(
    page.getByTestId("user-row-target-user@example.com").getByText("active"),
  ).toBeVisible();

  // Delete (two-click confirm) → row gone.
  await page.getByTestId("user-row-target-user@example.com").getByRole("button", { name: "Delete" }).click();
  await page.getByTestId("user-row-target-user@example.com").getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByTestId("user-row-target-user@example.com")).toHaveCount(0);

  // Audit log recorded every action.
  await page.goto("/audit");
  await expect(page.getByTestId("audit-row-user.role.set")).toBeVisible();
  await expect(page.getByTestId("audit-row-user.ban")).toBeVisible();
  await expect(page.getByTestId("audit-row-user.unban")).toBeVisible();
  await expect(page.getByTestId("audit-row-user.delete")).toBeVisible();
});

test("an admin cannot act on their own account (self-protection)", async ({ page }) => {
  await signUp(page.request, "admin@example.com");
  await page.goto("/users");

  const ownRow = page.getByTestId("user-row-admin@example.com");
  await expect(ownRow).toBeVisible();
  // The admin's own row controls are disabled.
  await expect(ownRow.getByRole("button", { name: "Make user" })).toBeDisabled();
  await expect(ownRow.getByRole("button", { name: "Ban" })).toBeDisabled();
  await expect(ownRow.getByRole("button", { name: "Delete" })).toBeDisabled();
});

test("a non-admin is bounced from /users", async ({ page }) => {
  await signUp(page.request, "plain-user@example.com"); // not allow-listed
  await page.goto("/users");
  await expect(page.getByRole("heading", { name: "Users" })).toHaveCount(0);
});
```

- [ ] **Step 2: Run the admin e2e (existing 3 SP1 specs + these)**

Run: `pnpm --filter admin test:e2e`
Expected: all pass (SP1's 3 gate specs + the 3 here).

- [ ] **Step 3: Commit**

```bash
git add apps/admin/e2e/admin-users.spec.ts
git commit -m "test(admin): e2e — user management actions + audit + self-protection"
```

---

## Task 8: Full QA + finish

- [ ] **Step 1: Full gate**

Run: `pnpm lint && pnpm check-types && pnpm test`
Expected: all PASS (db: owner-scope 5 + user-role 1 + audit 2).

- [ ] **Step 2: Build (excl. admin's pre-existing local-env failure)**

Run: `pnpm exec turbo run build --filter='!admin'`
Expected: PASS.

- [ ] **Step 3: Regression — web e2e (48) + SP1 admin gate**

Run: `pnpm --filter web test:e2e`
Expected: 48 passed.

- [ ] **Step 4: Admin e2e (SP1 + SP2 specs)**

Run: `pnpm --filter admin test:e2e`
Expected: all pass.

- [ ] **Step 5: Finish the branch** — invoke `superpowers:finishing-a-development-branch`: push, open a PR, wait for CI (Node 22/24 + pg-compat applying the new `audit_log` + web e2e + admin e2e) green, then ff-merge to `main`. CI already runs the admin e2e (the SP1 step covers all `apps/admin` specs).

---

## Self-Review

**Spec coverage:** §2 components → Tasks 1–6. §3 audit_log schema + helper → Task 1 (libSQL + pg + helper, non-owner). §4 Server Actions (requireAdmin → self-guard → auth.api.* → audit → revalidate) → Task 2. §5 UI (/users list+search+pagination, /audit, dashboard nav, two-click delete) → Tasks 3/4/5/6. §1 self-protection → Task 2 (server guard) + Task 4 (disabled controls) + Task 7 (e2e). §7 testing → Task 1 (db) + Task 7 (e2e) + Task 8 (gate+regression). §8 file map → matches. Impersonation/adminClient explicitly NOT built (spec non-goals).

**Placeholder scan:** none — exact paths, full code, exact commands. The `audit()` helper, action names (`user.role.set`/`user.ban`/`user.unban`/`user.delete`), and testids are concrete and consistent.

**Type consistency:** `recordAuditLog(entry, client?)` + `AuditEntry` (Task 1) used in Task 2's `audit()`. `auditLog` table + `desc` used in Task 1 test + Task 5. Server Action names `setUserRole`/`banUserAction`/`unbanUserAction`/`deleteUserAction` identical across Tasks 2/3/4. testids `user-row-<email>` (Task 4) + `audit-row-<action>` (Task 5) match the e2e (Task 7). `requireAdmin`/`requireAdminSession` from SP1's `admin-actions.ts`.
