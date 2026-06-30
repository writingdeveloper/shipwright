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
      {
        actorUserId: "a",
        action: "user.unban",
        targetType: "user",
        targetId: "b",
      },
      ctx.db,
    );
    const rows = await ctx.db.select().from(auditLog);
    expect(rows.some((r) => r.metadata === null)).toBe(true);
  });
});
