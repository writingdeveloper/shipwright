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
