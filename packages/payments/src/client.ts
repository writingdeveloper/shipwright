import Stripe from "stripe";
import { env } from "@repo/env";

/**
 * @repo/payments — the lazily-constructed, server-only Stripe client.
 *
 * GRACEFUL DEGRADATION (the core requirement): the app, its tests, and CI must
 * run with NO Stripe account. So the Stripe client is built AT MOST ONCE, and
 * ONLY when `STRIPE_SECRET_KEY` actually exists. Callers must check
 * {@link isStripeConfigured} (or {@link getStripe} returning `null`) BEFORE
 * doing anything — with no key we never instantiate `Stripe`, never make a
 * network call, and never throw. This module is server-only by contract (it
 * reads the secret key from `@repo/env`, whose server vars are typed
 * server-only): import it from a Server Action / Route Handler, never a client
 * component.
 */

// Lazily-constructed singleton so we build the Stripe client at most once, and
// only when a secret key exists. Module-level (not per-call) to avoid leaking a
// new client on every checkout.
let stripeClient: Stripe | undefined;

/**
 * Whether Stripe is configured (a secret key is present). When `false`, the
 * package no-ops: `createCheckoutSession` returns `{ configured: false }` and
 * the webhook route answers 503 — never throwing, never constructing a client.
 */
export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

/** Whether the webhook can verify signatures (a signing secret is present). */
export function isWebhookConfigured(): boolean {
  return Boolean(env.STRIPE_WEBHOOK_SECRET);
}

/**
 * The configured server-side Price id: `STRIPE_PRICE_ID` if set, else the
 * public `NEXT_PUBLIC_STRIPE_PRICE_ID`. `undefined` when neither is set.
 */
export function configuredPriceId(): string | undefined {
  return env.STRIPE_PRICE_ID ?? env.NEXT_PUBLIC_STRIPE_PRICE_ID ?? undefined;
}

/**
 * Get the shared Stripe client, or `null` when no secret key is configured.
 *
 * Returning `null` (rather than throwing) is what lets every caller degrade
 * gracefully: with no key the client is NEVER constructed.
 *
 * `apiVersion` is intentionally OMITTED so the SDK uses the exact API version it
 * was published for (its pinned default). Hard-coding a version string that does
 * not match the installed SDK's literal type is a common source of type/runtime
 * drift; pinning is done by the `stripe` dependency version instead.
 */
export function getStripe(): Stripe | null {
  const secretKey = env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      // Identify this integration in Stripe's logs/dashboards.
      appInfo: { name: "shipwright", url: "https://github.com/writingdeveloper/shipwright" },
      // Built-in network retries for transient errors (idempotency-keyed by the
      // SDK), so a blip doesn't bubble a 500 into the checkout action.
      maxNetworkRetries: 2,
    });
  }
  return stripeClient;
}

// Re-export the Stripe type so consumers (and tests) can reference event /
// session types without taking their own direct `stripe` dependency.
export type { Stripe };
