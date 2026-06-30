import { describe, expect, it, vi } from "vitest";

// Mock the lazy Stripe client so refund/extend take the CONFIGURED path against a
// fake Stripe and we can assert the exact call shapes — no network, no keys.
const refundsCreate = vi.fn().mockResolvedValue({ id: "re_1" });
const subsUpdate = vi.fn().mockResolvedValue({});
const subsRetrieve = vi.fn();

vi.mock("../src/client", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({
    subscriptions: { retrieve: subsRetrieve, update: subsUpdate },
    refunds: { create: refundsCreate },
  }),
}));

describe("refund/extend (mocked Stripe)", () => {
  it("refundLatestPayment refunds the latest payment_intent", async () => {
    subsRetrieve.mockResolvedValueOnce({
      latest_invoice: { payment_intent: { id: "pi_123" } },
    });
    const { refundLatestPayment } = await import("../src/admin");

    expect(await refundLatestPayment("sub_1")).toEqual({ ok: true });
    expect(refundsCreate).toHaveBeenCalledWith({ payment_intent: "pi_123" });
  });

  it("extendSubscription pushes trial_end out by N days, no proration", async () => {
    subsRetrieve.mockResolvedValueOnce({ current_period_end: 1000 });
    const { extendSubscription } = await import("../src/admin");

    expect(await extendSubscription("sub_1", 7)).toEqual({ ok: true });
    expect(subsUpdate).toHaveBeenCalledWith("sub_1", {
      trial_end: 1000 + 7 * 86400,
      proration_behavior: "none",
    });
  });

  it("refund returns no_subscription when there is no payment intent", async () => {
    subsRetrieve.mockResolvedValueOnce({ latest_invoice: null });
    const { refundLatestPayment } = await import("../src/admin");

    expect(await refundLatestPayment("sub_1")).toEqual({
      ok: false,
      reason: "no_subscription",
    });
  });
});
