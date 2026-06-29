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
