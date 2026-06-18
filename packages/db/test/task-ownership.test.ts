import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { and, eq, sql } from "drizzle-orm";

import { task } from "../src/schema";
import { createTestDb, seedUser, type TestDb } from "./helpers";

/**
 * Data-layer security invariants for the per-user `task` table.
 *
 * These run against a REAL libSQL database created fresh per run (see
 * `createTestDb`). They assert the same ownership scoping the Server Actions in
 * `apps/web/app/dashboard/actions.ts` rely on — the DB is the last line of
 * defence, so we prove the scoped statements behave correctly here, independent
 * of any auth/session layer above them.
 */
describe("task ownership invariants (real libSQL)", () => {
  let ctx: TestDb;

  const USER_A = "user-a-id";
  const USER_B = "user-b-id";

  beforeAll(async () => {
    ctx = createTestDb();
    await seedUser(ctx, { id: USER_A, email: "a@example.com", name: "User A" });
    await seedUser(ctx, { id: USER_B, email: "b@example.com", name: "User B" });
  }, 60_000);

  afterAll(() => {
    ctx?.cleanup();
  });

  /** Insert a task for `userId` and return its generated id. */
  async function addTask(userId: string, title: string): Promise<string> {
    const [row] = await ctx.db
      .insert(task)
      .values({ userId, title })
      .returning({ id: task.id });
    return row!.id;
  }

  /** Owner-scoped read, mirroring the dashboard page query. */
  function tasksForUser(userId: string) {
    return ctx.db.select().from(task).where(eq(task.userId, userId));
  }

  it("seeds two distinct users", async () => {
    const users = await ctx.db.query.user.findMany();
    expect(users.map((u) => u.id).sort()).toEqual([USER_A, USER_B].sort());
  });

  it("Invariant 1: a task created for A is visible to A and NOT to B", async () => {
    const id = await addTask(USER_A, "A's private task");

    const aTasks = await tasksForUser(USER_A);
    const bTasks = await tasksForUser(USER_B);

    expect(aTasks.map((t) => t.id)).toContain(id);
    expect(bTasks.map((t) => t.id)).not.toContain(id);
    // B's scoped view must never include A's row.
    expect(bTasks.every((t) => t.userId === USER_B)).toBe(true);
  });

  it("Invariant 2: ownership-scoped toggle flips for the owner but affects 0 rows for a non-owner", async () => {
    const id = await addTask(USER_A, "toggle me");

    // Non-owner (B) attempts to toggle A's task by guessing its id.
    const asNonOwner = await ctx.db
      .update(task)
      .set({ completed: sql`NOT ${task.completed}` })
      .where(and(eq(task.id, id), eq(task.userId, USER_B)));
    expect(asNonOwner.rowsAffected).toBe(0);

    // The row is unchanged (still not completed).
    const afterNonOwner = await ctx.db.query.task.findFirst({
      where: eq(task.id, id),
    });
    expect(afterNonOwner?.completed).toBe(false);

    // Owner (A) toggles successfully — exactly one row.
    const asOwner = await ctx.db
      .update(task)
      .set({ completed: sql`NOT ${task.completed}` })
      .where(and(eq(task.id, id), eq(task.userId, USER_A)));
    expect(asOwner.rowsAffected).toBe(1);

    const afterOwner = await ctx.db.query.task.findFirst({
      where: eq(task.id, id),
    });
    expect(afterOwner?.completed).toBe(true);
  });

  it("Invariant 3: ownership-scoped delete affects 0 rows for a non-owner, removes the row for the owner", async () => {
    const id = await addTask(USER_A, "delete me");

    // Non-owner (B) cannot delete A's task.
    const delAsNonOwner = await ctx.db
      .delete(task)
      .where(and(eq(task.id, id), eq(task.userId, USER_B)));
    expect(delAsNonOwner.rowsAffected).toBe(0);

    // Row still exists.
    const stillThere = await ctx.db.query.task.findFirst({
      where: eq(task.id, id),
    });
    expect(stillThere?.id).toBe(id);

    // Owner (A) deletes it — one row removed.
    const delAsOwner = await ctx.db
      .delete(task)
      .where(and(eq(task.id, id), eq(task.userId, USER_A)));
    expect(delAsOwner.rowsAffected).toBe(1);

    const gone = await ctx.db.query.task.findFirst({ where: eq(task.id, id) });
    expect(gone).toBeUndefined();
  });

  it("cross-user isolation holds across multiple tasks per user", async () => {
    await addTask(USER_A, "A-1");
    await addTask(USER_A, "A-2");
    await addTask(USER_B, "B-1");

    const aTasks = await tasksForUser(USER_A);
    const bTasks = await tasksForUser(USER_B);

    expect(aTasks.every((t) => t.userId === USER_A)).toBe(true);
    expect(bTasks.every((t) => t.userId === USER_B)).toBe(true);
    // No id appears in both users' scoped views.
    const aIds = new Set(aTasks.map((t) => t.id));
    expect(bTasks.some((t) => aIds.has(t.id))).toBe(false);
  });
});
