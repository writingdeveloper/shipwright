import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Billing-portal session creation against a MOCKED Stripe client + subscription
 * read (same approach as `admin-stripe.test.ts`): no network, no keys, no DB —
 * we assert the discriminated result shapes and the exact Stripe call shape.
 */

const portalCreate = vi.fn();

// Mutable per-test state the hoisted module mocks close over.
let stripeInstance: unknown;
let subRow: { stripeCustomerId: string | null } | null;

vi.mock("../src/client", () => ({
  getStripe: () => stripeInstance,
}));
vi.mock("../src/subscription", () => ({
  getSubscription: async () => subRow,
}));

beforeEach(() => {
  portalCreate.mockReset();
  stripeInstance = {
    billingPortal: { sessions: { create: portalCreate } },
  };
  subRow = { stripeCustomerId: "cus_42" };
});

const ARGS = { userId: "user-1", returnUrl: "https://app.test/dashboard" };

describe("createBillingPortalSession", () => {
  it("degrades to { configured: false } with no Stripe client", async () => {
    stripeInstance = null;
    const { createBillingPortalSession } = await import("../src/portal");

    expect(await createBillingPortalSession(ARGS)).toEqual({
      configured: false,
      reason: "STRIPE_SECRET_KEY is not set",
    });
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it("soft-errors when the user has no Stripe customer (comp'd Pro / no sub)", async () => {
    subRow = null;
    const { createBillingPortalSession } = await import("../src/portal");

    expect(await createBillingPortalSession(ARGS)).toEqual({
      configured: true,
      error: "No Stripe customer for this user",
    });
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it("creates a portal session for the OWNER's customer id + return_url", async () => {
    portalCreate.mockResolvedValueOnce({ url: "https://portal.stripe/xyz" });
    const { createBillingPortalSession } = await import("../src/portal");

    expect(await createBillingPortalSession(ARGS)).toEqual({
      configured: true,
      url: "https://portal.stripe/xyz",
    });
    expect(portalCreate).toHaveBeenCalledWith({
      customer: "cus_42",
      return_url: "https://app.test/dashboard",
    });
  });

  it("soft-errors (never throws) when the Stripe call fails", async () => {
    portalCreate.mockRejectedValueOnce(new Error("stripe down"));
    const { createBillingPortalSession } = await import("../src/portal");

    expect(await createBillingPortalSession(ARGS)).toEqual({
      configured: true,
      error: "stripe down",
    });
  });
});
