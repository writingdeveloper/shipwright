import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prepareTestDatabase, type PreparedTestDb } from "./db-helper";

/**
 * Owner-scoping invariants for the push subscription store, against a REAL libSQL
 * temp DB. The key security property: `deleteSubscription` is owner-scoped, so
 * one user cannot remove another user's subscription via a known/guessed
 * endpoint (the DB cascade is not an authz boundary).
 *
 * Order matters: prepare the temp DB (which sets DATABASE_URL) BEFORE importing
 * `@repo/db` / the server module, so the `@repo/db` singleton binds to it.
 */

let prepared: PreparedTestDb;
let server: typeof import("../src/push/server");
let dbMod: typeof import("@repo/db");

const USER_A = "user-a";
const USER_B = "user-b";
const ENDPOINT = "https://push.example.com/sub-a";

beforeAll(async () => {
  prepared = prepareTestDatabase();
  dbMod = await import("@repo/db");
  server = await import("../src/push/server");
  await dbMod.db.insert(dbMod.schema.user).values([
    { id: USER_A, name: "A", email: "a@example.com" },
    { id: USER_B, name: "B", email: "b@example.com" },
  ]);
});

afterAll(() => prepared.cleanup());

describe("push subscription store", () => {
  it("save + list is owner-scoped", async () => {
    await server.saveSubscription({
      userId: USER_A,
      endpoint: ENDPOINT,
      p256dh: "p",
      auth: "a",
    });
    const a = await server.listSubscriptions(USER_A);
    expect(a).toHaveLength(1);
    expect(a[0]?.endpoint).toBe(ENDPOINT);
    // User B has none — list never leaks another owner's rows.
    expect(await server.listSubscriptions(USER_B)).toHaveLength(0);
  });

  it("deleteSubscription cannot remove another user's subscription", async () => {
    // User B tries to delete A's endpoint — must touch 0 rows (owner-scoped).
    await server.deleteSubscription(USER_B, ENDPOINT);
    expect(await server.listSubscriptions(USER_A)).toHaveLength(1);
    // The actual owner can delete it.
    await server.deleteSubscription(USER_A, ENDPOINT);
    expect(await server.listSubscriptions(USER_A)).toHaveLength(0);
  });
});
