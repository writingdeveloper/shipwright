import { logger } from "@repo/observability/logger";

import { configuredPriceId, getStripe } from "./client";

/**
 * @repo/payments — hosted Checkout session creation.
 *
 * Uses Stripe's HOSTED Checkout (the redirect flow), NOT embedded Stripe.js, so
 * there is no third-party script to whitelist and the app's strict nonce CSP is
 * untouched: the only browser-visible effect is a top-level redirect to
 * `checkout.stripe.com`. The signed-in user's id is carried in BOTH
 * `client_reference_id` and `metadata.userId` so the webhook can attribute the
 * resulting subscription back to the user (Checkout is otherwise anonymous to
 * our DB).
 */

/** Arguments for {@link createCheckoutSession}. */
export type CreateCheckoutSessionArgs = {
  /** The signed-in user's id — attached to the session for webhook attribution. */
  readonly userId: string;
  /** The user's email, prefilled on the Checkout page (optional). */
  readonly customerEmail?: string;
  /**
   * The recurring Price id to subscribe to. Optional — defaults to the
   * configured `STRIPE_PRICE_ID` / `NEXT_PUBLIC_STRIPE_PRICE_ID`. If neither a
   * passed price nor a configured one exists, the call degrades to
   * `{ configured: false }`.
   */
  readonly priceId?: string;
  /** Absolute URL Stripe redirects to after a successful checkout. */
  readonly successUrl: string;
  /** Absolute URL Stripe redirects to if the user cancels. */
  readonly cancelUrl: string;
};

/**
 * Result of {@link createCheckoutSession}, discriminated on `configured` so the
 * caller branches without try/catch:
 * - `{ configured: false }` — Stripe (or a price) is not set up; the caller
 *   should NOT redirect (used by the keyless app/tests/CI). Never thrown.
 * - `{ configured: true, url }` — redirect the browser to `url`.
 * - `{ configured: true, error }` — Stripe was configured but the API call
 *   failed; the caller can surface a soft error instead of a 500.
 */
export type CreateCheckoutSessionResult =
  | { readonly configured: false; readonly reason: string }
  | { readonly configured: true; readonly url: string }
  | { readonly configured: true; readonly error: string };

// One-time warning latch: when billing is unconfigured we warn ONCE per process
// (not on every dashboard render that calls this), so logs stay clean in
// tests/CI/local dev.
let warnedNotConfigured = false;

function warnOnce(message: string): void {
  if (!warnedNotConfigured) {
    warnedNotConfigured = true;
    logger.warn(`[@repo/payments] ${message}`);
  }
}

/**
 * Create a Stripe hosted Checkout session for a subscription.
 *
 * Graceful degrade: returns `{ configured: false }` (warn once, no throw, NEVER
 * constructs the Stripe client) when `STRIPE_SECRET_KEY` is unset or no price id
 * is available. When configured, returns the hosted Checkout `url` to redirect
 * to; a Stripe API failure is caught and returned as `{ error }` rather than
 * thrown, so a billing outage can't turn the dashboard into a 500.
 */
export async function createCheckoutSession(
  args: CreateCheckoutSessionArgs,
): Promise<CreateCheckoutSessionResult> {
  const stripe = getStripe();
  if (!stripe) {
    warnOnce(
      "STRIPE_SECRET_KEY is not set; skipping checkout. Set STRIPE_SECRET_KEY (and a price id) to enable billing.",
    );
    return { configured: false, reason: "STRIPE_SECRET_KEY is not set" };
  }

  const priceId = args.priceId ?? configuredPriceId();
  if (!priceId) {
    warnOnce(
      "No Stripe price id configured; skipping checkout. Set STRIPE_PRICE_ID or NEXT_PUBLIC_STRIPE_PRICE_ID.",
    );
    return { configured: false, reason: "No Stripe price id configured" };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      // Attribute the (otherwise anonymous) Checkout back to our user on BOTH
      // the session and the resulting subscription, so the webhook can resolve
      // the owner from `checkout.session.completed` AND later subscription
      // events.
      client_reference_id: args.userId,
      metadata: { userId: args.userId },
      subscription_data: { metadata: { userId: args.userId } },
      ...(args.customerEmail ? { customer_email: args.customerEmail } : {}),
    });

    if (!session.url) {
      // Should not happen for hosted Checkout, but guard rather than redirect to
      // `null`.
      logger.error("[@repo/payments] Checkout session has no URL", {
        sessionId: session.id,
      });
      return { configured: true, error: "Checkout session has no URL" };
    }

    return { configured: true, url: session.url };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    logger.error("[@repo/payments] Failed to create checkout session", {
      error: message,
      userId: args.userId,
    });
    return { configured: true, error: message };
  }
}
