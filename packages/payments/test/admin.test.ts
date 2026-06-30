import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prepareTestDatabase, type PreparedTestDb } from "./db-helper";

/**
 * Local Pro-comp invariants + the keyless no-op of the Stripe ops, against a REAL
 * temp libSQL db. Stripe keys are scrubbed BEFORE the modules import so
 * `isStripeConfigured()` is deterministically false here (the mocked-Stripe path
 * lives in admin-stripe.test.ts).
 */
let prepared: PreparedTestDb;
let admin: typeof import("../src/admin");
let getSubscription: typeof import("../src/subscription").getSubscription;
let isPro: typeof import("../src/subscription").isPro;
let dbMod: typeof import("@repo/db");

beforeAll(async () => {
  for (const k of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]) {
    delete process.env[k];
  }
  prepared = prepareTestDatabase();
  admin = await import("../src/admin");
  ({ getSubscription, isPro } = await import("../src/subscription"));
  dbMod = await import("@repo/db");
  await dbMod.db.insert(dbMod.schema.user).values([
    { id: "u-comp", email: "comp@example.com", name: "Comp" },
    { id: "u-real", email: "real@example.com", name: "Real" },
  ]);
}, 90_000);

afterAll(() => prepared?.cleanup());

describe("grant/revoke Pro comp (local, keyless)", () => {
  it("grant makes isPro true (plan 'comp'); revoke makes it false", async () => {
    expect(await isPro("u-comp")).toBe(false);

    expect(await admin.grantProComp("u-comp", 30)).toEqual({ ok: true });
    expect(await isPro("u-comp")).toBe(true);
    const sub = await getSubscription("u-comp");
    expect(sub?.plan).toBe("comp");
    expect(sub?.status).toBe("active");

    expect(await admin.revokeProComp("u-comp")).toEqual({ ok: true });
    expect(await isPro("u-comp")).toBe(false);
  });

  it("revoke does NOT cancel a real Stripe subscription row", async () => {
    await dbMod.db.insert(dbMod.schema.subscription).values({
      userId: "u-real",
      stripeSubscriptionId: "sub_real_1",
      status: "active",
      plan: "pro",
      currentPeriodEnd: new Date(Date.now() + 30 * 86400 * 1000),
    });
    expect(await isPro("u-real")).toBe(true);
    await admin.revokeProComp("u-real"); // guarded: only local comps (no stripe id)
    expect(await isPro("u-real")).toBe(true); // untouched
  });
});

describe("refund/extend (no Stripe key → not_configured)", () => {
  it("refundLatestPayment no-ops", async () => {
    expect(await admin.refundLatestPayment("sub_x")).toEqual({
      ok: false,
      reason: "not_configured",
    });
  });
  it("extendSubscription no-ops", async () => {
    expect(await admin.extendSubscription("sub_x", 7)).toEqual({
      ok: false,
      reason: "not_configured",
    });
  });
});
