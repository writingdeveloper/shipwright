import {
  and,
  db,
  isNull,
  ownedBy,
  subscription as subscriptionTable,
} from "@repo/db";
import { logger } from "@repo/observability/logger";

import { getStripe, isStripeConfigured } from "./client";

/** Outcome of an admin billing operation. */
export type BillingResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "no_subscription" | "stripe_error" };

const DAY_SECONDS = 60 * 60 * 24;

/**
 * Refund (in full) the latest payment on a user's Stripe subscription. No-op when
 * Stripe is unconfigured or the user has no Stripe subscription / payment.
 */
export async function refundLatestPayment(
  stripeSubscriptionId: string | null,
): Promise<BillingResult> {
  if (!isStripeConfigured()) return { ok: false, reason: "not_configured" };
  if (!stripeSubscriptionId) return { ok: false, reason: "no_subscription" };
  const stripe = getStripe();
  if (!stripe) return { ok: false, reason: "not_configured" };
  try {
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ["latest_invoice.payment_intent"],
    });
    // Focused cast (matches the webhook's periodEndMs pattern) to avoid wrestling
    // the SDK's deep expand types.
    const rec = sub as unknown as {
      latest_invoice?:
        | { payment_intent?: { id?: string } | string | null }
        | string
        | null;
    };
    const inv = rec.latest_invoice;
    const pi = inv && typeof inv === "object" ? inv.payment_intent : null;
    const paymentIntentId = pi
      ? typeof pi === "string"
        ? pi
        : (pi.id ?? null)
      : null;
    if (!paymentIntentId) return { ok: false, reason: "no_subscription" };
    await stripe.refunds.create({ payment_intent: paymentIntentId });
    return { ok: true };
  } catch (error) {
    logger.error("refundLatestPayment failed", { error, stripeSubscriptionId });
    return { ok: false, reason: "stripe_error" };
  }
}

/**
 * Push a Stripe subscription's next billing date out by `days` (free extension)
 * via `trial_end`, no proration. No-op when unconfigured / no subscription.
 */
export async function extendSubscription(
  stripeSubscriptionId: string | null,
  days: number,
): Promise<BillingResult> {
  if (!isStripeConfigured()) return { ok: false, reason: "not_configured" };
  if (!stripeSubscriptionId) return { ok: false, reason: "no_subscription" };
  if (!Number.isFinite(days) || days <= 0) {
    return { ok: false, reason: "stripe_error" };
  }
  const stripe = getStripe();
  if (!stripe) return { ok: false, reason: "not_configured" };
  try {
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const rec = sub as unknown as {
      current_period_end?: number;
      items?: { data?: Array<{ current_period_end?: number }> };
    };
    const currentEnd =
      rec.current_period_end ?? rec.items?.data?.[0]?.current_period_end;
    if (typeof currentEnd !== "number") {
      return { ok: false, reason: "stripe_error" };
    }
    await stripe.subscriptions.update(stripeSubscriptionId, {
      trial_end: currentEnd + Math.floor(days) * DAY_SECONDS,
      proration_behavior: "none",
    });
    return { ok: true };
  } catch (error) {
    logger.error("extendSubscription failed", { error, stripeSubscriptionId });
    return { ok: false, reason: "stripe_error" };
  }
}

/**
 * LOCAL Pro comp: upsert the user's subscription mirror to an active "comp" for
 * `days`, making `isPro` true. No Stripe call; `stripeSubscriptionId` stays null
 * (it is a manual override). A later real Stripe subscription reconciles via the
 * webhook upsert.
 */
export async function grantProComp(
  userId: string,
  days: number,
): Promise<BillingResult> {
  if (!userId || !Number.isFinite(days) || days <= 0) {
    return { ok: false, reason: "stripe_error" };
  }
  const currentPeriodEnd = new Date(
    Date.now() + Math.floor(days) * DAY_SECONDS * 1000,
  );
  await db
    .insert(subscriptionTable)
    .values({ userId, status: "active", plan: "comp", currentPeriodEnd })
    .onConflictDoUpdate({
      target: subscriptionTable.userId,
      set: {
        status: "active",
        plan: "comp",
        currentPeriodEnd,
        stripeSubscriptionId: null,
      },
    });
  return { ok: true };
}

/**
 * Revoke a LOCAL comp only: cancel the user's subscription row IF it has no
 * `stripeSubscriptionId` (so a real paying subscription is never silently
 * killed). Owner-scoped by `userId` via `ownedBy` (required by the lint rule).
 */
export async function revokeProComp(userId: string): Promise<BillingResult> {
  if (!userId) return { ok: false, reason: "stripe_error" };
  await db
    .update(subscriptionTable)
    .set({ status: "canceled" })
    .where(
      and(
        ownedBy(subscriptionTable, userId),
        isNull(subscriptionTable.stripeSubscriptionId),
      ),
    );
  return { ok: true };
}
