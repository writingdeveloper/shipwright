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
