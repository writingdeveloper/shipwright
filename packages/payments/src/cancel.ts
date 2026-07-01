import { logger } from "@repo/observability/logger";

import { getStripe, isStripeConfigured } from "./client";
import type { BillingResult } from "./admin";

/**
 * Cancel a subscription at Stripe IMMEDIATELY (no period-end grace).
 *
 * Built for account deletion: a deleted user must never keep being charged, so
 * the caller (apps/web's `deleteAccount` action) reads the subscription id
 * before deleting the user row and calls this after. For ordinary "I want to
 * cancel but keep access until renewal", users go through the Billing Portal
 * instead — Stripe then emits `customer.subscription.deleted`, which the
 * webhook mirrors (irrelevant after account deletion: the row is gone and the
 * event becomes an unattributable no-op).
 *
 * Same result contract as the admin billing helpers; never throws.
 */
export async function cancelStripeSubscription(
  stripeSubscriptionId: string | null,
): Promise<BillingResult> {
  if (!isStripeConfigured()) return { ok: false, reason: "not_configured" };
  if (!stripeSubscriptionId) return { ok: false, reason: "no_subscription" };
  const stripe = getStripe();
  if (!stripe) return { ok: false, reason: "not_configured" };
  try {
    await stripe.subscriptions.cancel(stripeSubscriptionId);
    return { ok: true };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    logger.error("[@repo/payments] Failed to cancel subscription", {
      error: message,
      stripeSubscriptionId,
    });
    return { ok: false, reason: "stripe_error" };
  }
}
