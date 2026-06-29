# Owner-Scoping Guardrail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote owner-scoping from a hand-written convention to an enforced guardrail in `@repo/db` (typed predicate helpers) + `@repo/eslint-config` (a custom lint rule) + a registry-driven cross-user invariant test, with zero runtime behaviour change.

**Architecture:** Three layers. (A) `@repo/db` gains `ownedBy`/`ownedRow`/`acrossAllOwners` dialect-agnostic predicate helpers + an `OWNER_TABLES` registry; the 12 owner-table call sites adopt them. (B) A custom ESLint rule `no-unscoped-owner-table` fails the build when an owner-table `.from`/`.delete`/`.update` query references no scope helper. (C) A registry-driven invariant test proves cross-user access touches 0 rows for every owner table (libSQL + a Postgres mirror).

**Tech Stack:** Drizzle ORM (libSQL + node-postgres), Vitest, ESLint 9 flat config + RuleTester, Node 22/24, pnpm + Turborepo.

**Spec:** `docs/superpowers/specs/2026-06-29-owner-scoping-guardrail-design.md`

**Branch:** `feat/owner-scoping-guardrail` (already created).

**Key facts that shape this plan:**
- Inserts are already safe (`userId` is `.notNull()` with no default → TS + runtime enforce it). The footgun is only in `select`/`update`/`delete` WHERE clauses.
- Owner tables: `task`, `uploadedFile`, `pushSubscription`, `subscription`. Non-owner (do NOT touch): `user`, `session`, `account`, `verification`, `processedStripeEvent`.
- `eslint-plugin-only-warn` downgrades errors to warnings, BUT every package's lint script runs `eslint … --max-warnings 0`, so a warning still fails the build. Register the rule as `"error"`; it becomes a warning that fails CI.
- libSQL mutations expose `.rowsAffected`; node-postgres does NOT — the pg test asserts on `.returning({ id }).length` (mirrors the existing `task-ownership.pg.test.ts`).

---

## File Structure

**Create**
- `packages/db/src/owner-scope.ts` — `OWNER_TABLES` registry + `ownedBy`/`ownedRow`/`acrossAllOwners`. One responsibility: the owner-scope vocabulary.
- `packages/db/test/owner-scope.test.ts` — registry-driven invariant test (libSQL).
- `packages/db/test/owner-scope.pg.test.ts` — Postgres mirror.
- `packages/eslint-config/rules/no-unscoped-owner-table.js` — the custom rule.
- `packages/eslint-config/rules/no-unscoped-owner-table.test.js` — rule unit test (node:test + RuleTester).

**Modify**
- `packages/db/src/index.ts` — re-export the helpers + registry.
- `packages/eslint-config/base.js` — register the plugin + rule (configured with the owner-table name list).
- `packages/eslint-config/package.json` — add `"test": "node --test rules/"`.
- 6 call-site files (12 queries) — adopt the helpers.
- `packages/db/CLAUDE.md` + `packages/db/README.md` — document the helpers + admin seam.

**Remove**
- `packages/db/test/task-ownership.test.ts` + `packages/db/test/task-ownership.pg.test.ts` — superseded by the generalised test.

---

## Task 1: owner-scope helpers + registry (TDD via the libSQL invariant test)

**Files:**
- Create: `packages/db/src/owner-scope.ts`
- Modify: `packages/db/src/index.ts`
- Create (test): `packages/db/test/owner-scope.test.ts`
- Remove: `packages/db/test/task-ownership.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/db/test/owner-scope.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  pushSubscription,
  subscription,
  task,
  uploadedFile,
} from "../src/schema";
import {
  acrossAllOwners,
  OWNER_TABLES,
  ownedBy,
  ownedRow,
} from "../src/owner-scope";
import { createTestDb, seedUser, type TestDb } from "./helpers";

/**
 * Registry-driven owner-scoping invariants (real libSQL).
 *
 * For EVERY table in OWNER_TABLES we prove the security property the guardrail
 * exists to guarantee: a scoped read/delete keyed to one user never observes or
 * mutates another user's rows, and `acrossAllOwners` deliberately spans both.
 * Adding a table to OWNER_TABLES without adding a CASE here fails the coverage
 * guard below, so new owner tables can't silently skip the invariant.
 */
const USER_A = "user-a-id";
const USER_B = "user-b-id";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- data-driven over heterogeneous tables; strict typing lives at the real call sites.
type Case = { name: string; table: any; values: (userId: string) => any };

const CASES: Case[] = [
  { name: "task", table: task, values: (u) => ({ userId: u, title: `t-${u}` }) },
  {
    name: "uploadedFile",
    table: uploadedFile,
    values: (u) => ({
      userId: u,
      key: `${u}/k`,
      name: "n",
      size: 1,
      contentType: "text/plain",
    }),
  },
  {
    name: "pushSubscription",
    table: pushSubscription,
    values: (u) => ({
      userId: u,
      endpoint: `https://push.example/${u}`,
      p256dh: "p",
      auth: "a",
    }),
  },
  { name: "subscription", table: subscription, values: (u) => ({ userId: u }) },
];

describe("owner-scope invariants (real libSQL)", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = createTestDb();
    await seedUser(ctx, { id: USER_A, email: "a@example.com", name: "User A" });
    await seedUser(ctx, { id: USER_B, email: "b@example.com", name: "User B" });
  }, 60_000);

  afterAll(() => ctx?.cleanup());

  it("CASES cover exactly the OWNER_TABLES registry", () => {
    expect(CASES.map((c) => c.table).sort()).toEqual([...OWNER_TABLES].sort());
  });

  for (const c of CASES) {
    it(`${c.name}: scoped read/delete isolate by owner; acrossAllOwners spans both`, async () => {
      const [a] = await ctx.db
        .insert(c.table)
        .values(c.values(USER_A))
        .returning({ id: c.table.id });
      const [b] = await ctx.db
        .insert(c.table)
        .values(c.values(USER_B))
        .returning({ id: c.table.id });
      const aId = a!.id as string;
      const bId = b!.id as string;

      // Read isolation (ownedBy): B's scoped view never includes A's row.
      const bRows = await ctx.db
        .select()
        .from(c.table)
        .where(ownedBy(c.table, USER_B));
      expect(bRows.map((r: { id: string }) => r.id)).not.toContain(aId);
      expect(bRows.every((r: { userId: string }) => r.userId === USER_B)).toBe(
        true,
      );

      // acrossAllOwners deliberately spans owners → both rows present.
      const allRows = await ctx.db
        .select()
        .from(c.table)
        .where(acrossAllOwners());
      const allIds = allRows.map((r: { id: string }) => r.id);
      expect(allIds).toContain(aId);
      expect(allIds).toContain(bId);

      // Delete isolation (ownedRow): B cannot delete A's row; A can.
      const delNonOwner = await ctx.db
        .delete(c.table)
        .where(ownedRow(c.table, USER_B, aId));
      expect(delNonOwner.rowsAffected).toBe(0);

      const stillThere = await ctx.db
        .select()
        .from(c.table)
        .where(ownedRow(c.table, USER_A, aId));
      expect(stillThere.length).toBe(1);

      const delOwner = await ctx.db
        .delete(c.table)
        .where(ownedRow(c.table, USER_A, aId));
      expect(delOwner.rowsAffected).toBe(1);
    });
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @repo/db test -- owner-scope`
Expected: FAIL — cannot resolve `../src/owner-scope` (module does not exist yet).

- [ ] **Step 3: Implement `packages/db/src/owner-scope.ts`**

```ts
import { and, eq, sql, type Column, type Table } from "drizzle-orm";

import {
  pushSubscription,
  subscription,
  task,
  uploadedFile,
} from "./schema";

/**
 * Owner-scoping vocabulary — the single place that knows how a row is tied to
 * its owner. Importing these (instead of hand-writing `and(eq(id), eq(userId))`)
 * makes the correct predicate the easy, named, type-checked path; the
 * `no-unscoped-owner-table` ESLint rule then requires one of them on every
 * owner-table query, and `owner-scope.test.ts` proves they isolate by owner.
 *
 * Dialect-agnostic: typed against drizzle-orm's core `Table`/`Column`, so the
 * same helpers serve the libSQL schema AND the Postgres mirror (`schema.pg.ts`).
 */

/** A table that carries a `userId` owner column. */
type OwnerTable = Table & { userId: Column };
/** …and an `id` primary key, for single-row operations. */
type OwnerRowTable = OwnerTable & { id: Column };

/**
 * The set of owner-scoped tables. The invariant test iterates this, so a new
 * owner table added here is automatically held to the cross-user invariant.
 * Non-owner tables (`user`/`session`/`account`/`verification` — Better Auth;
 * `processedStripeEvent` — an infra dedupe ledger) are deliberately absent.
 */
export const OWNER_TABLES = [
  task,
  uploadedFile,
  pushSubscription,
  subscription,
] as const;

/** WHERE predicate: rows owned by `userId`. Use for owner-scoped list reads. */
export function ownedBy<T extends OwnerTable>(table: T, userId: string) {
  return eq(table.userId, userId);
}

/** WHERE predicate: the single row `id`, but only when owned by `userId`. */
export function ownedRow<T extends OwnerRowTable>(
  table: T,
  userId: string,
  id: string,
) {
  return and(eq(table.id, id), eq(table.userId, userId));
}

/**
 * Sentinel predicate that INTENTIONALLY spans all owners — legitimate ONLY in a
 * future role-checked admin path. It is greppable and recognised by the lint
 * rule, so every deliberate cross-owner read is auditable in one search. The
 * role check itself is NOT implemented here; it arrives with the RBAC/admin
 * roadmap item. Until then its only consumer is the invariant test.
 */
export function acrossAllOwners() {
  return sql`1 = 1`;
}
```

- [ ] **Step 4: Export from `packages/db/src/index.ts`** — append after the existing operator re-export block:

```ts
/**
 * Owner-scoping helpers + the owner-table registry. Prefer these over
 * hand-written `and(eq(id), eq(userId))`; the `no-unscoped-owner-table` lint
 * rule requires one of them on every owner-table query.
 */
export {
  OWNER_TABLES,
  ownedBy,
  ownedRow,
  acrossAllOwners,
} from "./owner-scope";
```

- [ ] **Step 5: Delete the superseded test**

```bash
git rm packages/db/test/task-ownership.test.ts
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @repo/db test`
Expected: PASS — `owner-scope invariants (real libSQL)` green (the coverage guard + one case per owner table). No `task-ownership` test remains.

- [ ] **Step 7: Type-check**

Run: `pnpm --filter @repo/db check-types`
Expected: PASS (no errors). If `Table & { userId: Column }` does not accept a real table, the error surfaces here — see Task 1 note below.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/owner-scope.ts packages/db/src/index.ts packages/db/test/owner-scope.test.ts
git commit -m "feat(db): owner-scope helpers + registry-driven invariant test"
```

**Task 1 note (type compatibility):** Drizzle exposes columns as top-level properties on the table object, so a real table satisfies `Table & { userId: Column }`. If TS rejects it, widen the constraint to `Table & Record<"userId", Column>` (identical at runtime) — do NOT loosen to `any`, which would drop the compile-time "table has a userId" guarantee.

---

## Task 2: Postgres mirror of the invariant test

**Files:**
- Create: `packages/db/test/owner-scope.pg.test.ts`
- Remove: `packages/db/test/task-ownership.pg.test.ts`

The pg suite runs only in CI (`.github/workflows/pg-compat.yml`) — there is no local Docker. Verify by close mirroring + inspection; it executes against the CI Postgres service.

- [ ] **Step 1: Create `packages/db/test/owner-scope.pg.test.ts`**

Identical to the libSQL test EXCEPT: import tables from `../src/schema.pg`, helpers from `../src/owner-scope`, `createTestDb`/`seedUser` from `./helpers.pg`, the CASES coverage guard compares against a local canonical name list (the pg schema's tables are different objects than `OWNER_TABLES`), and mutation results use `.returning({ id }).length` (node-postgres has no `.rowsAffected`).

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  pushSubscription,
  subscription,
  task,
  uploadedFile,
} from "../src/schema.pg";
import { acrossAllOwners, ownedBy, ownedRow } from "../src/owner-scope";
import { createTestDb, seedUser, type TestDb } from "./helpers.pg";

/**
 * Postgres mirror of `owner-scope.test.ts`. Same invariants, real Postgres (the
 * pg-compat CI service), pg-core schema + node-postgres driver. Dialect delta:
 * node-postgres has no libSQL `.rowsAffected`, so mutations use
 * `.returning({ id })` and assert on the row count. The CASES list mirrors the
 * canonical owner set (the pg table objects differ from the libSQL
 * `OWNER_TABLES`, so we guard on names).
 */
const USER_A = "user-a-id";
const USER_B = "user-b-id";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- data-driven over heterogeneous tables.
type Case = { name: string; table: any; values: (userId: string) => any };

const CASES: Case[] = [
  { name: "task", table: task, values: (u) => ({ userId: u, title: `t-${u}` }) },
  {
    name: "uploadedFile",
    table: uploadedFile,
    values: (u) => ({
      userId: u,
      key: `${u}/k`,
      name: "n",
      size: 1,
      contentType: "text/plain",
    }),
  },
  {
    name: "pushSubscription",
    table: pushSubscription,
    values: (u) => ({
      userId: u,
      endpoint: `https://push.example/${u}`,
      p256dh: "p",
      auth: "a",
    }),
  },
  { name: "subscription", table: subscription, values: (u) => ({ userId: u }) },
];

const CANONICAL_OWNER_NAMES = [
  "pushSubscription",
  "subscription",
  "task",
  "uploadedFile",
];

describe("owner-scope invariants (real Postgres)", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
    await seedUser(ctx, { id: USER_A, email: "a@example.com", name: "User A" });
    await seedUser(ctx, { id: USER_B, email: "b@example.com", name: "User B" });
  }, 90_000);

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it("CASES cover exactly the canonical owner set", () => {
    expect(CASES.map((c) => c.name).sort()).toEqual(CANONICAL_OWNER_NAMES);
  });

  for (const c of CASES) {
    it(`${c.name}: scoped read/delete isolate by owner; acrossAllOwners spans both`, async () => {
      const [a] = await ctx.db
        .insert(c.table)
        .values(c.values(USER_A))
        .returning({ id: c.table.id });
      const [b] = await ctx.db
        .insert(c.table)
        .values(c.values(USER_B))
        .returning({ id: c.table.id });
      const aId = a!.id as string;
      const bId = b!.id as string;

      const bRows = await ctx.db
        .select()
        .from(c.table)
        .where(ownedBy(c.table, USER_B));
      expect(bRows.map((r: { id: string }) => r.id)).not.toContain(aId);
      expect(bRows.every((r: { userId: string }) => r.userId === USER_B)).toBe(
        true,
      );

      const allRows = await ctx.db
        .select()
        .from(c.table)
        .where(acrossAllOwners());
      const allIds = allRows.map((r: { id: string }) => r.id);
      expect(allIds).toContain(aId);
      expect(allIds).toContain(bId);

      // node-postgres: no rowsAffected → assert on returned row count.
      const delNonOwner = await ctx.db
        .delete(c.table)
        .where(ownedRow(c.table, USER_B, aId))
        .returning({ id: c.table.id });
      expect(delNonOwner.length).toBe(0);

      const stillThere = await ctx.db
        .select()
        .from(c.table)
        .where(ownedRow(c.table, USER_A, aId));
      expect(stillThere.length).toBe(1);

      const delOwner = await ctx.db
        .delete(c.table)
        .where(ownedRow(c.table, USER_A, aId))
        .returning({ id: c.table.id });
      expect(delOwner.length).toBe(1);
    });
  }
});
```

- [ ] **Step 2: Delete the superseded pg test**

```bash
git rm packages/db/test/task-ownership.pg.test.ts
```

- [ ] **Step 3: Sanity type-check the pg test compiles** (it is excluded from the default vitest run but should still type-check)

Run: `pnpm --filter @repo/db check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/db/test/owner-scope.pg.test.ts
git commit -m "test(db): pg mirror of the owner-scope invariant test"
```

---

## Task 3: Migrate the 12 owner-table call sites to the helpers

Zero behaviour change — each edit swaps only the `.where(...)` argument (and tidies imports). The new lint rule (Task 4) will FAIL until every site below is migrated, so do them all here.

**Files:**
- Modify: `apps/web/app/[locale]/dashboard/actions.ts`
- Modify: `apps/web/app/[locale]/dashboard/file-actions.ts`
- Modify: `apps/web/app/[locale]/dashboard/tasks-card.tsx`
- Modify: `packages/api/src/routers/task.ts`
- Modify: `packages/payments/src/subscription.ts`
- Modify: `packages/payments/src/webhook.ts`
- Modify: `packages/pwa/src/push/server.ts`

- [ ] **Step 1: `actions.ts`** — import line + 2 WHERE clauses

Import (line 4): `import { and, db, eq, sql, task } from "@repo/db";`
→ `import { db, ownedRow, sql, task } from "@repo/db";`

`toggleTask` (was `.where(and(eq(task.id, id), eq(task.userId, userId)))`):
```ts
    .where(ownedRow(task, userId, id));
```
`deleteTask` (was `db.delete(task).where(and(eq(task.id, id), eq(task.userId, userId)))`):
```ts
  await db.delete(task).where(ownedRow(task, userId, id));
```

- [ ] **Step 2: `tasks-card.tsx`** — import + 1 WHERE

Import: `import { db, desc, eq, task } from "@repo/db";` → `import { db, desc, ownedBy, task } from "@repo/db";`
```ts
    .where(ownedBy(task, userId))
```

- [ ] **Step 3: `packages/api/src/routers/task.ts`** — import + 1 WHERE

Import: `import { db, desc, eq, task } from "@repo/db";` → `import { db, desc, ownedBy, task } from "@repo/db";`
```ts
      .where(ownedBy(task, ctx.session.user.id))
```

- [ ] **Step 4: `file-actions.ts`** — import + 3 WHERE clauses

Import: `import { and, db, desc, eq, uploadedFile } from "@repo/db";` → `import { db, desc, ownedBy, ownedRow, uploadedFile } from "@repo/db";`

`listFiles` (was `.where(eq(uploadedFile.userId, userId))`):
```ts
    .where(ownedBy(uploadedFile, userId))
```
`deleteFile` select (was `.where(and(eq(uploadedFile.id, id), eq(uploadedFile.userId, userId)))`):
```ts
    .where(ownedRow(uploadedFile, userId, id));
```
`deleteFile` delete (was `.where(and(eq(uploadedFile.id, id), eq(uploadedFile.userId, userId)))`):
```ts
    .where(ownedRow(uploadedFile, userId, id));
```

- [ ] **Step 5: `packages/payments/src/subscription.ts`** — import + 1 WHERE

Import: `import { db, eq, subscription as subscriptionTable } from "@repo/db";` → `import { db, ownedBy, subscription as subscriptionTable } from "@repo/db";`
```ts
    .where(ownedBy(subscriptionTable, userId))
```

- [ ] **Step 6: `packages/payments/src/webhook.ts`** — import + 1 WHERE (keep `eq` for the non-owner `processedStripeEvent`)

Import:
```ts
import {
  db,
  eq,
  processedStripeEvent,
  subscription as subscriptionTable,
} from "@repo/db";
```
→
```ts
import {
  db,
  eq,
  ownedBy,
  processedStripeEvent,
  subscription as subscriptionTable,
} from "@repo/db";
```
`markSubscriptionCanceled` (was `.where(eq(subscriptionTable.userId, userId))`):
```ts
    .where(ownedBy(subscriptionTable, userId));
```
Leave the `processedStripeEvent` queries (lines ~79, ~92) untouched — non-owner infra table.

- [ ] **Step 7: `packages/pwa/src/push/server.ts`** — import + 3 WHERE clauses (the prune delete gains an explicit owner predicate — defence in depth surfaced by the guardrail)

Import: `import { db, schema, and, eq, inArray } from "@repo/db";` → `import { db, schema, and, eq, inArray, ownedBy } from "@repo/db";`

`deleteSubscription` (was `and(eq(userId…), eq(endpoint…))`):
```ts
    .where(
      and(
        ownedBy(schema.pushSubscription, userId),
        eq(schema.pushSubscription.endpoint, endpoint),
      ),
    );
```
`listSubscriptions` (was `.where(eq(schema.pushSubscription.userId, userId))`):
```ts
    .where(ownedBy(schema.pushSubscription, userId));
```
`sendPushToUser` prune (was `.where(inArray(schema.pushSubscription.endpoint, result.deadEndpoints))`):
```ts
      .where(
        and(
          ownedBy(schema.pushSubscription, userId),
          inArray(schema.pushSubscription.endpoint, result.deadEndpoints),
        ),
      );
```

- [ ] **Step 8: Type-check + build + unit tests across the repo**

Run: `pnpm check-types && pnpm test`
Expected: PASS. No unused-import errors (each import line above drops now-unused operators). The `@repo/db` invariant test still green.

- [ ] **Step 9: Commit**

```bash
git add apps/web packages/api packages/payments packages/pwa
git commit -m "refactor: adopt owner-scope helpers at all 12 owner-table call sites"
```

---

## Task 4: ESLint rule `no-unscoped-owner-table` + rule test + wiring

**Files:**
- Create: `packages/eslint-config/rules/no-unscoped-owner-table.js`
- Create (test): `packages/eslint-config/rules/no-unscoped-owner-table.test.js`
- Modify: `packages/eslint-config/base.js`
- Modify: `packages/eslint-config/package.json`

- [ ] **Step 1: Write the failing rule test** — `packages/eslint-config/rules/no-unscoped-owner-table.test.js`

```js
import { RuleTester } from "eslint";
import { test } from "node:test";

import rule from "./no-unscoped-owner-table.js";

const ruleTester = new RuleTester();

test("no-unscoped-owner-table", () => {
  ruleTester.run("no-unscoped-owner-table", rule, {
    valid: [
      // Scoped reads/mutations via the helpers.
      { code: "db.select().from(task).where(ownedBy(task, userId))", options: [{ tables: ["task"] }] },
      { code: "db.delete(task).where(ownedRow(task, userId, id))", options: [{ tables: ["task"] }] },
      { code: "db.update(task).set(x).where(ownedRow(task, userId, id))", options: [{ tables: ["task"] }] },
      // Deliberate admin span.
      { code: "db.select().from(task).where(acrossAllOwners())", options: [{ tables: ["task"] }] },
      // schema.X member form + alias both recognised.
      { code: "db.delete(schema.pushSubscription).where(and(ownedBy(schema.pushSubscription, userId), eq(x, y)))", options: [{ tables: ["pushSubscription"] }] },
      { code: "db.update(subscriptionTable).set(x).where(ownedBy(subscriptionTable, userId))", options: [{ tables: ["subscriptionTable"] }] },
      // Non-owner tables are untouched.
      { code: "db.delete(processedStripeEvent).where(eq(processedStripeEvent.id, id))", options: [{ tables: ["task"] }] },
      { code: "db.select().from(user)", options: [{ tables: ["task"] }] },
    ],
    invalid: [
      // Whole-WHERE omission.
      { code: "db.delete(task)", options: [{ tables: ["task"] }], errors: [{ messageId: "unscoped" }] },
      // WHERE present but no scope helper.
      { code: "db.select().from(task).where(eq(task.id, id))", options: [{ tables: ["task"] }], errors: [{ messageId: "unscoped" }] },
      { code: "db.update(task).set(x).where(eq(task.id, id))", options: [{ tables: ["task"] }], errors: [{ messageId: "unscoped" }] },
      // schema.X member form flagged too.
      { code: "db.delete(schema.pushSubscription).where(inArray(schema.pushSubscription.endpoint, eps))", options: [{ tables: ["pushSubscription"] }], errors: [{ messageId: "unscoped" }] },
    ],
  });
});
```

- [ ] **Step 2: Add the test script** — `packages/eslint-config/package.json`, insert a `"scripts"` block before `"devDependencies"`:

```json
  "scripts": {
    "test": "node --test rules/"
  },
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @repo/eslint-config test`
Expected: FAIL — cannot import `./no-unscoped-owner-table.js` (does not exist yet).

- [ ] **Step 4: Implement the rule** — `packages/eslint-config/rules/no-unscoped-owner-table.js`

```js
/**
 * Require an owner-scope helper on every owner-table query.
 *
 * Owner-scoped tables (`task`/`uploadedFile`/`pushSubscription`/`subscription`)
 * must be queried through `ownedBy`/`ownedRow` (or `acrossAllOwners` for a
 * deliberate, role-checked admin read). A `.from`/`.delete`/`.update` on such a
 * table whose statement references none of those helpers is a footgun: a missing
 * `userId` predicate (or a missing WHERE entirely) leaks/over-writes other
 * users' rows but still compiles.
 *
 * Detection is a *presence check* over the enclosing statement's text — robust
 * and low-false-positive — NOT a semantic analysis of the WHERE expression. Its
 * blind spot (the relational `db.query.*` API; an owner table imported under an
 * alias not listed in `tables`) is backstopped by the registry-driven invariant
 * test in `@repo/db`. Configure `tables` with the owner-table identifier names,
 * including any in-repo alias (e.g. `subscriptionTable`).
 *
 * @type {import("eslint").Rule.RuleModule}
 */
const SCOPE_HELPERS = ["ownedBy", "ownedRow", "acrossAllOwners"];
const BUILDER_METHODS = new Set(["from", "delete", "update"]);

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require an owner-scope helper (ownedBy/ownedRow/acrossAllOwners) on owner-table queries",
    },
    schema: [
      {
        type: "object",
        properties: { tables: { type: "array", items: { type: "string" } } },
        additionalProperties: false,
      },
    ],
    messages: {
      unscoped:
        "Owner-scoped table '{{table}}' queried via .{{method}}() without a scope helper. Use ownedBy/ownedRow, or acrossAllOwners for a deliberate admin read.",
    },
  },
  create(context) {
    const owners = new Set(context.options[0]?.tables ?? []);
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    /** Resolve `.from(task)` / `.from(schema.task)` → "task". */
    function tableName(arg) {
      if (!arg) return null;
      if (arg.type === "Identifier") return arg.name;
      if (arg.type === "MemberExpression" && arg.property.type === "Identifier") {
        return arg.property.name;
      }
      return null;
    }

    /** Nearest enclosing statement (or variable declaration). */
    function enclosingStatement(node) {
      let n = node;
      while (
        n.parent &&
        !/Statement$/.test(n.parent.type) &&
        n.parent.type !== "VariableDeclaration"
      ) {
        n = n.parent;
      }
      return n.parent ?? n;
    }

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== "MemberExpression" ||
          callee.property.type !== "Identifier" ||
          !BUILDER_METHODS.has(callee.property.name)
        ) {
          return;
        }
        const name = tableName(node.arguments[0]);
        if (!name || !owners.has(name)) return;

        const text = sourceCode.getText(enclosingStatement(node));
        if (SCOPE_HELPERS.some((h) => text.includes(`${h}(`))) return;

        context.report({
          node,
          messageId: "unscoped",
          data: { table: name, method: callee.property.name },
        });
      },
    };
  },
};
```

- [ ] **Step 5: Run the rule test to verify it passes**

Run: `pnpm --filter @repo/eslint-config test`
Expected: PASS — all valid + invalid fixtures behave.

- [ ] **Step 6: Wire the rule into `packages/eslint-config/base.js`**

Add the import at the top:
```js
import ownerScopeRule from "./rules/no-unscoped-owner-table.js";
```
Add a new config object to the exported `config` array (before the `ignores` entry):
```js
  {
    plugins: {
      "owner-scope": { rules: { "no-unscoped-owner-table": ownerScopeRule } },
    },
    rules: {
      // Owner-table query without a scope helper. `only-warn` downgrades this to
      // a warning, but every package lints with `--max-warnings 0`, so it still
      // fails CI. Keep `tables` in sync with @repo/db OWNER_TABLES (+ the
      // in-repo `subscriptionTable` alias).
      "owner-scope/no-unscoped-owner-table": [
        "error",
        {
          tables: [
            "task",
            "uploadedFile",
            "pushSubscription",
            "subscription",
            "subscriptionTable",
          ],
        },
      ],
    },
  },
```

- [ ] **Step 7: Lint the whole repo — proves Task 3 migration is complete**

Run: `pnpm lint`
Expected: PASS (exit 0). If any owner-table query was missed in Task 3, this fails with `no-unscoped-owner-table` pointing at it — fix it, then re-run.

- [ ] **Step 8: Prove the guardrail actually bites (temporary negative check)**

Temporarily edit `apps/web/app/[locale]/dashboard/tasks-card.tsx` `.where(ownedBy(task, userId))` → `.where(eq(task.userId, userId))` (and re-add `eq` to its import).
Run: `pnpm --filter web lint`
Expected: FAIL with `no-unscoped-owner-table`. Then REVERT both edits and re-run `pnpm --filter web lint` → PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/eslint-config
git commit -m "feat(eslint): no-unscoped-owner-table rule + wire into base config"
```

---

## Task 5: Documentation

**Files:**
- Modify: `packages/db/CLAUDE.md`
- Modify: `packages/db/README.md`

- [ ] **Step 1: `packages/db/CLAUDE.md`** — replace the bullet:

> - **Scope every mutation by owner**: `where(and(eq(table.id, id), eq(table.userId, userId)))` so a guessed id touches 0 rows. Owner-scope reads too.

with:

```md
- **Scope every owner-table query with the helpers**: use `ownedBy(table, userId)`
  (list reads) and `ownedRow(table, userId, id)` (single-row read/update/delete)
  from `@repo/db` instead of hand-writing `and(eq(id), eq(userId))`. This is
  enforced: the `no-unscoped-owner-table` ESLint rule fails the build if a
  `.from`/`.delete`/`.update` on an owner table (`task`, `uploadedFile`,
  `pushSubscription`, `subscription`) references no scope helper, and
  `test/owner-scope.test.ts` proves cross-user isolation for every table in
  `OWNER_TABLES`. Adding an owner table: add it to `OWNER_TABLES`
  (`src/owner-scope.ts`), to the rule's `tables` option
  (`@repo/eslint-config/base.js`), and to the invariant test's CASES.
  Inserts need no helper — `userId` is `.notNull()`, so omitting it is already a
  TS + runtime error.
- **Admin reads that span owners** use `acrossAllOwners()` — a greppable,
  lint-recognised seam. It carries NO role check yet (that lands with the RBAC
  item); until then it is used only by the invariant test.
```

- [ ] **Step 2: `packages/db/README.md`** — add a short "Owner-scoping" subsection near the schema docs:

```md
### Owner-scoping (enforced)

Owner-scoped tables (`task`, `uploadedFile`, `pushSubscription`, `subscription`)
must be queried with the helpers from `@repo/db`:

- `ownedBy(table, userId)` — list reads (`WHERE user_id = ?`)
- `ownedRow(table, userId, id)` — single-row read/update/delete (`WHERE id = ? AND user_id = ?`)
- `acrossAllOwners()` — a deliberate, auditable admin span (no role check yet)

Three layers keep this honest: the helpers make the right predicate the easy one,
the `no-unscoped-owner-table` ESLint rule fails the build on an unscoped owner-table
query, and `test/owner-scope.test.ts` (+ its pg mirror) proves cross-user isolation
for every table in `OWNER_TABLES`.
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/CLAUDE.md packages/db/README.md
git commit -m "docs(db): document owner-scope helpers + enforcement + admin seam"
```

---

## Task 6: Full QA gate + finish

- [ ] **Step 1: Full gate**

Run: `pnpm lint && pnpm check-types && pnpm build && pnpm test`
Expected: all PASS.

- [ ] **Step 2: e2e (zero behaviour change — all must still pass)**

Run: `pnpm --filter web test:e2e` (or the repo's e2e command)
Expected: PASS — the same 48 tests, none changed (the migration is SQL-identical).

- [ ] **Step 3: Confirm pg mirror is wired for CI** (cannot run locally)

Verify `.github/workflows/pg-compat.yml` runs `vitest --config vitest.config.pg.ts` (which globs `*.pg.test.ts`), so `owner-scope.pg.test.ts` will execute and `task-ownership.pg.test.ts` is gone. Inspection only.

- [ ] **Step 4: Finish the branch** — invoke `superpowers:finishing-a-development-branch`: verify tests, open a PR (CI must include the pg-compat job), and ff-merge to `main` only after CI (incl. Node 22/24 + pg-compat + e2e) is green, per the project QA bar.

---

## Self-Review

**Spec coverage:**
- §3.1 registry → Task 1 (`OWNER_TABLES`). §3.2 helpers → Task 1. §3.3 call-site migration → Task 3 (all 12 sites, incl. the push prune the spec flagged). §3.4 lint rule → Task 4. §3.5 generalised invariant test → Task 1 (libSQL) + Task 2 (pg), old tests removed. §4 zero runtime change → Task 3 + Task 6 e2e. §6 per-table seeding → Tasks 1/2 CASES. §7 QA → Task 6. §8 file map → matches. §9 caveats (presence-check, alias list, seam without role check) → encoded in the rule doc + Task 4 `tables` (incl. `subscriptionTable`).
- Admin seam (`acrossAllOwners`) ships unused in app code, exercised only by the invariant test — matches spec non-goals.

**Placeholder scan:** none — every step has exact paths, full code, exact commands + expected output.

**Type consistency:** `ownedBy(table, userId)`, `ownedRow(table, userId, id)`, `acrossAllOwners()` (no args), `OWNER_TABLES`, rule id `owner-scope/no-unscoped-owner-table`, messageId `unscoped`, option key `tables` — all identical across Tasks 1, 2, 4, 5. Import lines reconciled per file against their current contents.
