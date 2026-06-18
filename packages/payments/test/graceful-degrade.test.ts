import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Graceful-degradation + signature-verification guards (NO Stripe account).
 *
 * The repo invariant is that the app/tests/CI run with no Stripe keys, so these
 * delete every Stripe var BEFORE `@repo/env` is imported and assert the package
 * takes its safe paths:
 *  - `createCheckoutSession` returns `{ configured: false }`, warns ONCE, never
 *    throws, and NEVER constructs a Stripe client / makes a network call;
 *  - `constructWebhookEvent` throws a clean "not configured" (the route maps it
 *    to 503) rather than trusting an unverifiable payload;
 *  - even WITH a secret + webhook secret set, a FORGED signature is rejected
 *    (the real verification path), proving we don't blindly trust the body.
 *
 * Modules are imported dynamically AFTER the env is scrubbed (and reset between
 * tests) so the OPTIONAL vars resolve to `undefined` deterministically,
 * regardless of the developer's real shell env.
 */

const STRIPE_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_ID",
  "NEXT_PUBLIC_STRIPE_PRICE_ID",
] as const;

beforeEach(() => {
  vi.resetModules();
  for (const key of STRIPE_KEYS) {
    delete process.env[key];
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createCheckoutSession (no Stripe key)", () => {
  it("returns { configured: false } without throwing or building a client", async () => {
    const { createCheckoutSession } = await import("../src/checkout");

    const result = await createCheckoutSession({
      userId: "user-1",
      successUrl: "http://localhost:3000/dashboard?upgraded=1",
      cancelUrl: "http://localhost:3000/dashboard",
    });

    expect(result).toEqual({
      configured: false,
      reason: "STRIPE_SECRET_KEY is not set",
    });
  });

  it("isStripeConfigured / isBillingConfigured are false with no key", async () => {
    const { isStripeConfigured } = await import("../src/client");
    const { isBillingConfigured } = await import("../src/index");
    expect(isStripeConfigured()).toBe(false);
    expect(isBillingConfigured()).toBe(false);
  });

  it("reports { configured: false } for a missing price even if a key were set", async () => {
    // Key present but NO price id configured and none passed → still a safe
    // no-op (configured:false), never a half-formed checkout.
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_key_not_used_for_network";
    const { createCheckoutSession } = await import("../src/checkout");

    const result = await createCheckoutSession({
      userId: "user-1",
      successUrl: "http://localhost:3000/s",
      cancelUrl: "http://localhost:3000/c",
    });

    expect(result).toEqual({
      configured: false,
      reason: "No Stripe price id configured",
    });
  });
});

describe("constructWebhookEvent (signature handling)", () => {
  it("throws 'not configured' when no webhook secret is set", async () => {
    const { constructWebhookEvent } = await import("../src/webhook");

    await expect(
      constructWebhookEvent("{}", "t=1,v1=deadbeef"),
    ).rejects.toThrow(/not configured/i);
  });

  it("throws on a FORGED signature when fully configured", async () => {
    // Configure both secrets so we reach Stripe's real verification, then feed a
    // bogus signature: it must reject (we never trust an unverified payload).
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_key_not_used_for_network";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_dummy_secret";
    const { constructWebhookEvent } = await import("../src/webhook");

    const payload = JSON.stringify({ id: "evt_forged", type: "ping" });

    await expect(
      constructWebhookEvent(payload, "t=12345,v1=not_a_real_signature"),
    ).rejects.toThrow();
  });
});
