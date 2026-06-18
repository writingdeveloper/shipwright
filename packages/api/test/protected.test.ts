import { describe, expect, it } from "vitest";

import { createCaller } from "../src/root";

/**
 * The auth guard rejects anonymous calls BEFORE any DB query. We build a caller
 * with an explicit null-session context and assert task.list throws UNAUTHORIZED.
 * (db is not on the context — resolvers import it directly — so the context is
 * just { session }.)
 */
describe("protectedProcedure", () => {
  it("rejects an unauthenticated task.list with UNAUTHORIZED", async () => {
    const caller = createCaller({ session: null });
    await expect(caller.task.list()).rejects.toThrow(/UNAUTHORIZED/);
  });
});
