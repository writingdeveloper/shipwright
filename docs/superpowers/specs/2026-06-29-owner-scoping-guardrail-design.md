# Owner-Scoping Guardrail — Design Spec

**Date:** 2026-06-29
**Status:** Approved (brainstorming → spec)
**Origin:** MVP-acceleration eval (`docs/eval-mvp-acceleration-2026-06-23.md`, 7.5/10) flagged
owner-scoping as a verified security footgun: it is a **convention** (hand-written
`and(eq(table.id, id), eq(table.userId, userId))`), not a **guardrail**. A new owner
table or query that omits the `userId` predicate compiles, builds, and leaks/over-writes
rows. This spec promotes it to an enforced guardrail.

---

## 1. Problem statement

### What is safe today
- **Inserts are already safe.** Every owner table's `userId` is `.notNull()` with no
  default, so omitting it is BOTH a TypeScript error (the `.values({...})` type requires
  it) and a runtime NOT NULL violation. No work needed here.
- All 7 current owner-scoped call sites are correct (verified):
  `apps/web/app/[locale]/dashboard/actions.ts`, `…/file-actions.ts`,
  `…/tasks-card.tsx`, `packages/api/src/routers/task.ts`,
  `packages/payments/src/subscription.ts`, `packages/payments/src/webhook.ts`,
  `packages/pwa/src/push/server.ts`.

### What is the footgun
- The danger is purely in the **WHERE clause of `select` / `update` / `delete`** on an
  owner table:
  - Omitting `.where(...)` entirely (`db.delete(task)` deletes the whole table) — compiles.
  - Writing `.where(eq(task.id, id))` without the `userId` predicate — compiles, lets a
    guessed id touch another user's row.
  - A **new owner table** whose queries forget scoping — nothing mechanical catches it.
- The rule lives only in prose (`packages/db/CLAUDE.md`: "Scope every mutation by owner")
  and code comments. Nothing fails the build when it is violated.

### Owner vs non-owner tables (explicit partition)
- **Owner-scoped** (must be scoped by `userId`): `task`, `uploadedFile`,
  `pushSubscription`, `subscription`.
- **Intentionally NOT owner-scoped** (do not touch): `user`, `session`, `account`,
  `verification` (Better Auth, managed by its adapter), `processedStripeEvent` (an
  infrastructure dedupe ledger — see its schema comment).

---

## 2. Goals / Non-goals

**Goals**
1. Make the correct owner-scoping predicate the easy, named, type-checked path.
2. Mechanically fail the build/CI when an owner-table query is unscoped (both omission
   and a missing `userId` predicate, to the extent statically detectable).
3. Prove the actual security property (cross-user access touches 0 rows) for **every**
   owner table in CI, not just `task`.
4. Leave a small, explicit, greppable **admin escape hatch** seam so a future RBAC/admin
   feature can deliberately read across owners without fighting the guardrail. (The role
   CHECK itself is out of scope — next item.)

**Non-goals (YAGNI)**
- No execute-wrapper that re-implements Drizzle's fluent API (orderBy/limit/projection/
  set/returning). We keep Drizzle's surface; we only name the predicate.
- No RBAC, no `role` column, no `audit_log`, no admin dashboard — those are the NEXT
  roadmap item. This spec only lays the `acrossAllOwners` seam.
- No multitenancy / org scoping (separate roadmap item).
- No change to inserts (already type-safe + runtime-safe).

---

## 3. Architecture — three layers of defence

All centred on `@repo/db` (which already owns the schema, the client, and the "scope by
owner" rule), plus one lint rule in `@repo/eslint-config`.

| Layer | Mechanism | What it stops |
|-------|-----------|---------------|
| **A. Typed scoping helpers** | `ownedBy` / `ownedRow` / `acrossAllOwners` in `@repo/db` | Hand-writing the predicate wrong (column mix-ups); makes the right way easy |
| **B. ESLint rule** | `no-unscoped-owner-table` in `@repo/eslint-config` | Whole-WHERE omission + a query on an owner table that references no scope helper |
| **C. CI ownership-invariant test** | Registry-driven test (generalises today's `task-ownership.test.ts`) + its `.pg` mirror | A new owner table that forgets scoping; regression of the property |

### 3.1 Owner-table registry (single source of truth)
`packages/db/src/owner-scope.ts` exports a typed registry:

```ts
export const OWNER_TABLES = [task, uploadedFile, pushSubscription, subscription] as const;
```

The invariant test (Layer C) iterates this array, so a new owner table added here is
auto-covered. The helpers are generic over `table`, so the pg invariant test reuses them
directly and defines its owner-table list **locally** over `schema.pg.ts` (no shipped
`.pg` registry export needed — keeps the pg surface to test files only, per
`packages/db/CLAUDE.md` lockstep).

### 3.2 Helper API (Layer A) — `packages/db/src/owner-scope.ts` (server-only)

```ts
import { and, eq, sql } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

// A table that carries a `userId` text column (owner-scoped).
type OwnerTable = SQLiteTable & { userId: SQLiteColumn };
// …also carrying an `id` text column (for single-row ops).
type OwnerRowTable = OwnerTable & { id: SQLiteColumn };

/** WHERE predicate: rows owned by `userId`. Use for owner-scoped list reads. */
export function ownedBy<T extends OwnerTable>(table: T, userId: string) {
  return eq(table.userId, userId);
}

/** WHERE predicate: the single row `id`, but only if owned by `userId`. */
export function ownedRow<T extends OwnerRowTable>(table: T, userId: string, id: string) {
  return and(eq(table.id, id), eq(table.userId, userId));
}

/**
 * Sentinel predicate that INTENTIONALLY spans all owners. Legitimate ONLY in a
 * role-checked admin path. It is greppable and recognised by the lint rule, so every
 * deliberate cross-owner read is auditable in one `grep`. The role check itself is NOT
 * implemented here — that arrives with the RBAC/admin roadmap item.
 */
export function acrossAllOwners<T extends OwnerTable>(table: T) {
  // A tautology predicate keeps the Drizzle chain valid + documents intent.
  return sql`1 = 1`;
}
```

Exact return types are whatever Drizzle infers from `eq`/`and`/`sql`; the helpers are thin
and never widen the chain. The `OwnerTable` constraint means passing a table without a
`userId` column is a **compile error**.

Exported from `packages/db/src/index.ts`:
```ts
export { OWNER_TABLES, ownedBy, ownedRow, acrossAllOwners } from "./owner-scope";
```

### 3.3 Call-site migration (Layer A adoption)
All 7 owner-scoped sites switch from raw `and(eq(...), eq(...))` / `eq(table.userId, …)`
to the helpers. Drizzle's fluent chain (orderBy, limit, projection, set, returning) is
untouched — only the `.where(...)` argument changes:

```ts
// before
db.delete(task).where(and(eq(task.id, id), eq(task.userId, userId)))
db.select().from(uploadedFile).where(eq(uploadedFile.userId, userId)).orderBy(desc(...))
// after
db.delete(task).where(ownedRow(task, userId, id))
db.select().from(uploadedFile).where(ownedBy(uploadedFile, userId)).orderBy(desc(...))
```

### 3.4 ESLint rule (Layer B) — `@repo/eslint-config`
New rule `no-unscoped-owner-table` (custom, authored in the package, wired into `base.js`
or a dedicated export):

- **Triggers on** these builder forms when the table identifier is in the configured
  owner-table name list: `db.delete(<owner>)`, `db.update(<owner>)`, and a
  `.from(<owner>)` whose statement is a `select`.
- **Passes** only if the same statement (the call chain) references one of the approved
  scope helpers: `ownedBy`, `ownedRow`, or `acrossAllOwners`.
- **Reports** otherwise: "Owner-scoped table '<x>' queried without a scope helper — use
  ownedBy/ownedRow, or acrossAllOwners for a deliberate admin read."
- **Detection style:** a *presence check* over the statement's call chain, NOT deep
  semantic analysis of the WHERE expression. This keeps it robust and low-false-positive.
- **Configuration:** the owner-table NAME list is a rule option
  (`["task","uploadedFile","pushSubscription","subscription"]`), with a code comment
  tying it to `OWNER_TABLES`. If the two drift, Layer C catches the gap at runtime.
- **Known limitation (documented):** the relational query API
  (`db.query.task.findFirst(...)`) is not covered by this rule; it is covered by Layer C +
  convention. The builder forms are where all current and most future risk lives.

### 3.5 Ownership-invariant test (Layer C) — generalise the existing test
Today `packages/db/test/task-ownership.test.ts` (+ `task-ownership.pg.test.ts`) proves the
property for `task` only. Generalise to a **registry-driven** test
(`owner-scope.test.ts` + `.pg` mirror) that, for EVERY table in `OWNER_TABLES`:
1. Seeds two distinct users (A, B) via the existing `test/helpers.ts` `seedUser`.
2. Inserts a row owned by A (using each table's required non-null columns — see §6).
3. Asserts:
   - **Read isolation:** `db.select().from(t).where(ownedBy(t, B))` never returns A's row.
   - **Update isolation:** a scoped update via `ownedRow(t, B, id)` reports
     `rowsAffected === 0`; via `ownedRow(t, A, id)` reports `1`.
   - **Delete isolation:** same shape for delete.
   - **`acrossAllOwners(t)`** returns BOTH users' rows (proves the escape hatch actually
     spans owners — so the admin seam is real, and so the test documents the bypass).

The existing `task`-specific test is removed once the generalised test covers `task`
(no duplicate coverage).

---

## 4. Data flow (unchanged at runtime)
The helpers compile to the identical SQL the hand-written predicates produce
(`WHERE user_id = ? [AND id = ?]`). There is **zero runtime behaviour change** for the
existing app; this is a compile-time + CI-time safety upgrade. e2e behaviour is identical.

---

## 5. Error handling
- Misuse is caught at **author time** (TypeScript: wrong table type; ESLint: missing scope
  helper) and **CI time** (invariant test), not at runtime.
- The helpers themselves do not throw — they return Drizzle predicates. Runtime DB errors
  continue to flow through the existing `try/catch` + `logger.error` paths in the Server
  Actions (unchanged).

---

## 6. Per-table seeding for the invariant test (no placeholders)
Each owner table needs its required non-null columns when seeding a row for user A/B:
- `task`: `{ userId, title: "t" }`
- `uploadedFile`: `{ userId, key: "<userId>/k", name: "n", size: 1, contentType: "text/plain" }`
  (`key` is unique → namespace by userId in the seed).
- `pushSubscription`: `{ userId, endpoint: "https://push.example/<userId>", p256dh: "p", auth: "a" }`
  (`endpoint` unique → namespace by userId).
- `subscription`: `{ userId }` (all else nullable; `userId` is unique → one row per user,
  so A and B each get exactly one — fine for cross-user isolation).

A small per-table "make a seed row for userId" factory in the test keeps this DRY and is
the one spot that knows each table's required shape.

---

## 7. Testing & QA (the bar before merge)
1. New `owner-scope.test.ts` (libSQL) passes — all 4 owner tables, all invariants.
2. `owner-scope.pg.test.ts` mirror added; `pg-compat.yml` stays green (lockstep).
3. The new ESLint rule: a unit test for the rule (valid + invalid fixtures) AND `pnpm lint`
   stays green across the monorepo after call-site migration.
4. Full gate: `pnpm lint`, `pnpm check-types`, `pnpm build`, `pnpm test` (unit) all green.
5. `apps/web` e2e (48 tests) all pass — proves zero behaviour change.
6. Only then ff-merge to `main` (per the project QA bar).

---

## 8. File-level change map
**Create**
- `packages/db/src/owner-scope.ts` — registry + `ownedBy`/`ownedRow`/`acrossAllOwners`.
- `packages/db/test/owner-scope.test.ts` — registry-driven invariant test (libSQL).
- `packages/db/test/owner-scope.pg.test.ts` — pg mirror.
- `packages/eslint-config/rules/no-unscoped-owner-table.js` — the custom rule.
- `packages/eslint-config/rules/no-unscoped-owner-table.test.js` — rule unit test.

**Modify**
- `packages/db/src/index.ts` — export the helpers + registry.
- The 7 call sites (§1) — adopt the helpers. (The pg invariant test defines its owner-table
  list locally over `schema.pg.ts` — no shipped `.pg` registry file.)
- `packages/eslint-config/base.js` (or a new export) — wire the rule on.
- `packages/db/CLAUDE.md` + `packages/db/README.md` — document the helpers + admin seam,
  upgrade the "Scope every mutation by owner" rule.

**Remove**
- `packages/db/test/task-ownership.test.ts` + `task-ownership.pg.test.ts` — superseded by
  the generalised test.

---

## 9. Open risk / honest caveats
- The ESLint rule is the highest-maintenance component. It is deliberately a presence
  check (not WHERE-semantic analysis) to stay robust; its known blind spot is the
  relational `db.query.*` API, backstopped by Layer C.
- The owner-table list exists in two places (the runtime `OWNER_TABLES` and the lint rule
  option). Documented + tied by comment; Layer C catches drift at runtime.
- `acrossAllOwners` ships WITHOUT a role check by design — it is only a seam. Until the
  RBAC item lands, it must not be used in `apps/web` (there is no admin path yet). The
  invariant test is its only consumer for now.
