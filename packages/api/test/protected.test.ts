import { describe, expect, it } from "vitest";

import { trpcHandler } from "../src/handler";
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

/**
 * CSRF guard: tRPC fetch handlers (unlike Server Actions) have no built-in
 * Origin validation, so trpcHandler rejects cross-origin credentialed requests.
 */
describe("trpcHandler CSRF guard", () => {
  it("rejects a cross-origin request with 403", async () => {
    const req = new Request("http://localhost:3000/api/trpc/task.list", {
      headers: { origin: "https://evil.com" },
    });
    const res = await trpcHandler(req);
    expect(res.status).toBe(403);
  });

  it("lets a same-origin request past the guard (not 403)", async () => {
    const req = new Request("http://localhost:3000/api/trpc/task.list", {
      headers: { origin: "http://localhost:3000" },
    });
    const res = await trpcHandler(req);
    expect(res.status).not.toBe(403);
  });

  it("lets a request with no Origin header through (server-side / same-origin)", async () => {
    const req = new Request("http://localhost:3000/api/trpc/task.list");
    const res = await trpcHandler(req);
    expect(res.status).not.toBe(403);
  });
});
