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
  it("refundLatestPayment refunds the payment_intent from invoice.payments (dahlia shape)", async () => {
    // The REAL Stripe 2026-05-27 shape: payment intent lives on
    // invoice.payments.data[].payment.payment_intent.
    subsRetrieve.mockResolvedValueOnce({
      latest_invoice: {
        payments: { data: [{ payment: { payment_intent: "pi_123" } }] },
      },
    });
    const { refundLatestPayment } = await import("../src/admin");

    expect(await refundLatestPayment("sub_1")).toEqual({ ok: true });
    expect(refundsCreate).toHaveBeenCalledWith({ payment_intent: "pi_123" });
  });

  it("refundLatestPayment falls back to the charge when there is no payment_intent", async () => {
    subsRetrieve.mockResolvedValueOnce({
      latest_invoice: { payments: { data: [{ payment: { charge: "ch_9" } }] } },
    });
    const { refundLatestPayment } = await import("../src/admin");

    expect(await refundLatestPayment("sub_1")).toEqual({ ok: true });
    expect(refundsCreate).toHaveBeenCalledWith({ charge: "ch_9" });
  });

  it("refundLatestPayment still handles the legacy top-level payment_intent", async () => {
    subsRetrieve.mockResolvedValueOnce({
      latest_invoice: { payment_intent: { id: "pi_legacy" } },
    });
    const { refundLatestPayment } = await import("../src/admin");

    expect(await refundLatestPayment("sub_1")).toEqual({ ok: true });
    expect(refundsCreate).toHaveBeenCalledWith({ payment_intent: "pi_legacy" });
  });

  it("extendSubscription pushes trial_end out by N days, no proration (period on items[0])", async () => {
    // dahlia: current_period_end lives on the subscription ITEM, not top-level.
    subsRetrieve.mockResolvedValueOnce({
      items: { data: [{ current_period_end: 1000 }] },
    });
    const { extendSubscription } = await import("../src/admin");

    expect(await extendSubscription("sub_1", 7)).toEqual({ ok: true });
    expect(subsUpdate).toHaveBeenCalledWith("sub_1", {
      trial_end: 1000 + 7 * 86400,
      proration_behavior: "none",
    });
  });

  it("refund returns no_subscription when there is nothing refundable", async () => {
    subsRetrieve.mockResolvedValueOnce({ latest_invoice: null });
    const { refundLatestPayment } = await import("../src/admin");

    expect(await refundLatestPayment("sub_1")).toEqual({
      ok: false,
      reason: "no_subscription",
    });
  });
});
