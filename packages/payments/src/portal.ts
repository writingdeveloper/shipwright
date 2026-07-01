import { logger } from "@repo/observability/logger";

import { getStripe } from "./client";
import { getSubscription } from "./subscription";

/**
 * @repo/payments — Stripe Billing Portal session creation.
 *
 * The portal is Stripe's HOSTED self-serve billing page (cancel, change the
 * payment method, view invoices) — the same redirect flow as Checkout, so no
 * Stripe.js script and no CSP changes. Subscription changes made in the portal
 * come back through the SAME webhook events we already handle
 * (`customer.subscription.updated/deleted`), so no new sync path is needed.
 */

/** Arguments for {@link createBillingPortalSession}. */
export type CreateBillingPortalSessionArgs = {
  /** The signed-in user's id — the customer is resolved from THEIR row only. */
  readonly userId: string;
  /** Absolute URL Stripe sends the user back to when they leave the portal. */
  readonly returnUrl: string;
};

/**
 * Result, discriminated like {@link CreateCheckoutSessionResult} so the caller
 * branches without try/catch:
 * - `{ configured: false }` — Stripe is not set up (keyless app/tests/CI).
 * - `{ configured: true, url }` — redirect the browser to the portal.
 * - `{ configured: true, error }` — no Stripe customer for this user (e.g. a
 *   comped Pro that never checked out) or the Stripe call failed; surface a
 *   soft error instead of a 500.
 */
export type CreateBillingPortalSessionResult =
  | { readonly configured: false; readonly reason: string }
  | { readonly configured: true; readonly url: string }
  | { readonly configured: true; readonly error: string };

/**
 * Create a Billing Portal session for the signed-in user.
 *
 * Owner-scoped: the Stripe customer id is read from THIS user's subscription
 * row (never from client input), so a user can only ever open their own
 * portal. Graceful degrade mirrors `createCheckoutSession`: unconfigured →
 * `{ configured: false }`; a missing customer or a Stripe failure → `{ error }`
 * — never a throw.
 */
export async function createBillingPortalSession(
  args: CreateBillingPortalSessionArgs,
): Promise<CreateBillingPortalSessionResult> {
  const stripe = getStripe();
  if (!stripe) {
    return { configured: false, reason: "STRIPE_SECRET_KEY is not set" };
  }

  const subscription = await getSubscription(args.userId);
  const customerId = subscription?.stripeCustomerId;
  if (!customerId) {
    // A Pro without a Stripe customer (admin comp) or no subscription at all:
    // there is no portal to open. The UI hides the button in this case; this
    // guard is defence-in-depth for a stale page / hand-crafted request.
    return { configured: true, error: "No Stripe customer for this user" };
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: args.returnUrl,
    });
    return { configured: true, url: session.url };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    logger.error("[@repo/payments] Failed to create billing portal session", {
      error: message,
      userId: args.userId,
    });
    return { configured: true, error: message };
  }
}
