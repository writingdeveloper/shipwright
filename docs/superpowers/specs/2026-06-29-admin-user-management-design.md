# Admin User Management + Audit Log (SP2) — Design Spec

**Date:** 2026-06-29
**Status:** Approved (brainstorming → spec)
**Decomposition:** SP2 of 3 for the admin/RBAC roadmap item. SP1 (RBAC foundation + admin
shell) is merged. SP3 = billing admin (Stripe refunds + subscription extensions). SP2 must
produce working, testable software on its own.

**Builds on SP1:** `apps/admin` has a `requireAdmin()` guard, sign-in, a role-gated dashboard
(the first `acrossAllOwners()` consumer), security headers + nonce CSP. The Better Auth
`admin()` server plugin is wired, so `auth.api.{listUsers,setRole,banUser,unbanUser,
removeUser}` are available server-side.

---

## 1. Goals / Non-goals

**Goals**
1. An admin **user list** (search + pagination) — RSC reading `auth.api.listUsers`.
2. **Role change** (promote/demote), **ban/unban**, **delete** — each a Server Action that
   `requireAdmin()`s, calls the Better Auth admin server API, and records an `audit_log` row.
3. An **audit log** view (newest-first) of every admin action.
4. A **self-protection** guard: an admin cannot demote / ban / delete their own account.

**Non-goals (deferred)**
- **Impersonation** — deferred (admin & web are separate apps; an impersonated session on the
  admin origin has no user surface to act on, and cross-origin handoff is a separate, larger,
  security-sensitive design). Revisit when admin merges with web or a token handoff is designed.
- `adminClient()` (the client plugin) — **never needed**: all mutations are Server Actions
  using the server `auth.api.*`, so the SP1 TS2742 issue stays avoided permanently.
- Billing admin (refunds/extensions) → SP3.
- Create-user / set-password admin flows (Better Auth supports them) — out of scope (YAGNI;
  users self-sign-up).

---

## 2. Architecture — components

| Location | Responsibility |
|----------|----------------|
| `@repo/db` `schema.ts` (+ `schema.pg.ts`) | `audit_log` table (NON-owner — admin infra) |
| `@repo/db` `audit.ts` | `recordAuditLog(entry)` — a typed insert helper |
| `apps/admin/lib/user-actions.ts` | Server Actions: `setUserRole` / `banUserAction` / `unbanUserAction` / `deleteUserAction` |
| `apps/admin/app/users/page.tsx` | RSC user list (search + pagination) + per-row controls |
| `apps/admin/app/users/*` (client bits) | `RoleSelect`, `BanButton`, `DeleteUserButton` (two-click confirm) |
| `apps/admin/app/audit/page.tsx` | RSC audit-log list (newest-first) |
| `apps/admin/app/page.tsx` | dashboard gains links to `/users` and `/audit` |

**Layering:** Server Actions live in the admin app (they need `requireAdmin` + `auth`).
`@repo/db` owns the table + the dialect-agnostic insert helper. `auth.api.*` is the only
Better Auth surface used (server-side), so no new client auth surface.

---

## 3. `audit_log` schema

```ts
// libSQL (schema.ts) — mirror in schema.pg.ts (pg-core: text/timestamp, lockstep)
export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  // The admin who performed the action. Plain text (NO FK): the audit record must
  // survive even if that admin's user row is later deleted — audit integrity.
  actorUserId: text("actor_user_id").notNull(),
  // Dotted action name, e.g. "user.role.set" | "user.ban" | "user.unban" | "user.delete".
  action: text("action").notNull(),
  // What kind of entity the action targeted (e.g. "user").
  targetType: text("target_type").notNull(),
  // The affected entity id. Plain text (NO FK) for the same reason — a delete's audit
  // row must outlive the deleted target.
  targetId: text("target_id").notNull(),
  // Optional JSON string of extra context (e.g. {"role":"admin"} or {"banReason":"spam"}).
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
}, (t) => [index("auditLog_createdAt_idx").on(t.createdAt)]);
```

**NOT an owner table** — it is admin infrastructure (like `processedStripeEvent`), so it is
absent from `OWNER_TABLES`, the `no-unscoped-owner-table` rule does not apply, and reads are
gated by `requireAdmin`, not owner-scoped. Added to the schema aggregate + pg mirror; the
`pg-compat` job applies it.

`recordAuditLog` (in `@repo/db/audit.ts`, exported from the package):
```ts
export type AuditEntry = {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
};
export async function recordAuditLog(entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
  });
}
```

---

## 4. Server Actions (mutation = Server Action, per repo discipline)

Each action in `apps/admin/lib/user-actions.ts` follows one shape:

```
const actorId = await requireAdmin();          // data-layer authz + actor for audit
guard: if (targetId === actorId) reject;        // self-protection (destructive ops)
await auth.api.<method>({ body, headers: await headers() });  // Better Auth re-checks role
await recordAuditLog({ actorUserId: actorId, action, targetType: "user", targetId, metadata });
revalidatePath("/users");
```

- `setUserRole(userId, role)` → `auth.api.setRole` — `role ∈ {"user","admin"}`. Self-demote
  (acting on your own id to set "user") is rejected.
- `banUserAction(userId, reason?)` → `auth.api.banUser` (Better Auth supports `banReason`,
  `banExpiresIn`; SP2 uses an indefinite ban with optional reason). Self-ban rejected.
- `unbanUserAction(userId)` → `auth.api.unbanUser`.
- `deleteUserAction(userId)` → `auth.api.removeUser`. Self-delete rejected.

`auth.api.*` already authorizes on the caller's session role (admin plugin); `requireAdmin`
is defence-in-depth + supplies the actor id. Errors propagate to the error boundary; the
actions return a small `{status,message}` for inline UI feedback where a form needs it.

---

## 5. UI

- **/users** (RSC, gated): `requireAdmin()` then `auth.api.listUsers({ query: { searchValue,
  searchField:"email", limit, offset } })`. A search box (querystring `?q=`) + simple
  prev/next pagination (querystring `?page=`). Each row: email, role, banned badge, and
  controls — a `RoleSelect` (user/admin), a `BanButton`/unban, a `DeleteUserButton`. The
  signed-in admin's own row shows its controls disabled (self-protection, mirrored in the UI).
- **/audit** (RSC, gated): newest-first list of `audit_log` rows — when, who (actorUserId),
  action, target. Basic pagination.
- **Dashboard** (`/`): add nav links to `/users` and `/audit`.
- **Delete confirm:** `DeleteUserButton` is a client component with a two-click inline confirm
  ("Delete? Confirm / Cancel") — NO native `confirm()` dialog (it blocks automation + is poor
  UX). Submits the `deleteUserAction` form on confirm.

---

## 6. Error handling
- Unauthorized → `requireAdmin` already redirects/`notFound`s (SP1).
- Self-protected op → the action returns `{status:"error", message:"You can't … your own account."}`
  (and the UI disables the control), never throwing.
- Better Auth API errors (e.g. last-admin, not-found) → surfaced as an inline error message;
  unexpected errors propagate to Next's error boundary + `@repo/observability` logger.
- Audit recording is best-effort-but-awaited: a failed audit insert logs an error; the action
  still completes (we do not roll back a successful role change because the audit write failed,
  but we DO log it loudly so the gap is visible).

---

## 7. Testing & QA
1. **DB** (`@repo/db`): an `audit_log` insert via `recordAuditLog` round-trips (libSQL); the
   pg mirror gains the table (pg-compat stays green). The existing `owner-scope`/`user-role`
   tests still pass (new non-owner table doesn't perturb them).
2. **Admin e2e (NEW `admin-users.spec`)**, reusing the SP1 harness (ADMIN_EMAILS bootstrap):
   admin signs in → `/users` lists users → promote a normal user to admin (row reflects it) →
   ban then unban → delete a user (two-click confirm; row disappears) → `/audit` shows the
   recorded actions → a non-admin is bounced from `/users` → the admin cannot delete their own
   account (control disabled / action rejected).
3. **Regression:** the SP1 admin e2e (3) + web e2e (48) still green.
4. **Full gate** + pg-compat, then ff-merge to main.

---

## 8. File-level change map
**Create**
- `packages/db/src/audit.ts` — the `recordAuditLog` helper. (The `audit_log` TABLE lives in
  `schema.ts` with every other table, so the `schema.pg.ts` mirror + aggregate stay consistent;
  `audit.ts` holds only the insert helper.)
- `apps/admin/lib/user-actions.ts` — the four Server Actions.
- `apps/admin/app/users/page.tsx` + `apps/admin/app/users/{role-select,ban-button,delete-user-button}.tsx`.
- `apps/admin/app/audit/page.tsx`.
- `apps/admin/e2e/admin-users.spec.ts`.
- DB test for `recordAuditLog` (extend `@repo/db` tests).

**Modify**
- `packages/db/src/schema.ts` + `schema.pg.ts` — add `audit_log` to the schema + aggregate.
- `packages/db/src/index.ts` — export `auditLog` + `recordAuditLog`.
- `apps/admin/app/page.tsx` — nav links to `/users` and `/audit`.

**No removals.**

---

## 9. Open risks / caveats
- **Last-admin lockout:** self-protection blocks self-demote/ban/delete, but two admins could
  still demote each other to zero admins. Better Auth may guard "last admin"; if not, the
  env `ADMIN_EMAILS` allowlist + `promote-admin` script (SP1) are the recovery path. Documented,
  not over-engineered in SP2.
- **`auth.api.listUsers` shape:** the exact query/return shape is pinned during planning against
  Better Auth 1.6.19 (`searchValue`/`searchField`/`limit`/`offset` confirmed present).
- **audit completeness:** SP2 audits the four user actions; future sensitive actions (SP3
  billing) must call `recordAuditLog` too — the helper is the shared seam.
