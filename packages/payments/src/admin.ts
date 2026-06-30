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
/** Upper bound on a comp horizon (≈10 years) so a crafted `days` can't overflow Date. */
const MAX_COMP_DAYS = 3650;

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
      // Stripe API 2026-05-27 ('dahlia', the SDK's pinned version) moved the
      // payment intent / charge from a top-level `invoice.payment_intent` onto
      // `invoice.payments.data[].payment`. Expand that list.
      expand: ["latest_invoice.payments"],
    });
    // Focused cast (matches the webhook's periodEndMs pattern) to avoid wrestling
    // the SDK's deep, version-specific expand types.
    const rec = sub as unknown as {
      latest_invoice?:
        | {
            payments?: {
              data?: Array<{
                payment?: {
                  payment_intent?: { id?: string } | string | null;
                  charge?: { id?: string } | string | null;
                };
              }>;
            };
            // Legacy (pre-dahlia) shape, kept as a fallback.
            payment_intent?: { id?: string } | string | null;
          }
        | string
        | null;
    };
    const idOf = (
      ref: { id?: string } | string | null | undefined,
    ): string | null =>
      !ref ? null : typeof ref === "string" ? ref : (ref.id ?? null);

    const invoice =
      rec.latest_invoice && typeof rec.latest_invoice === "object"
        ? rec.latest_invoice
        : null;

    let paymentIntentId: string | null = null;
    let chargeId: string | null = null;
    for (const p of invoice?.payments?.data ?? []) {
      paymentIntentId ??= idOf(p.payment?.payment_intent);
      chargeId ??= idOf(p.payment?.charge);
    }
    // Pre-dahlia fallback.
    paymentIntentId ??= idOf(invoice?.payment_intent);

    if (paymentIntentId) {
      await stripe.refunds.create({ payment_intent: paymentIntentId });
      return { ok: true };
    }
    if (chargeId) {
      await stripe.refunds.create({ charge: chargeId });
      return { ok: true };
    }
    return { ok: false, reason: "no_subscription" };
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
 * `days`, making `isPro` true. No Stripe call. A NEW row has a null
 * `stripeSubscriptionId`; on conflict the existing `stripeSubscriptionId` is
 * PRESERVED (NOT nulled) — so comping a real paying user keeps their Stripe id,
 * which (a) keeps refund/extend available and (b) keeps `revokeProComp`'s
 * `isNull` guard correctly skipping them, so a comp-revoke can never cancel a
 * paying customer's row. A later Stripe webhook reconciles the mirror.
 */
export async function grantProComp(
  userId: string,
  days: number,
): Promise<BillingResult> {
  if (!userId || !Number.isFinite(days) || days <= 0) {
    return { ok: false, reason: "stripe_error" };
  }
  // Cap the horizon so an absurd `days` (e.g. from a crafted POST) can't overflow
  // JS's max Date and persist a NaN/invalid period.
  const cappedDays = Math.min(Math.floor(days), MAX_COMP_DAYS);
  const currentPeriodEnd = new Date(
    Date.now() + cappedDays * DAY_SECONDS * 1000,
  );
  try {
    await db
      .insert(subscriptionTable)
      .values({ userId, status: "active", plan: "comp", currentPeriodEnd })
      .onConflictDoUpdate({
        target: subscriptionTable.userId,
        // Deliberately does NOT touch stripeSubscriptionId — preserve any real id.
        set: { status: "active", plan: "comp", currentPeriodEnd },
      });
    return { ok: true };
  } catch (error) {
    // e.g. a stale/forged userId with no `user` row → FK violation. Report it as
    // a failure (which the caller audits) rather than an unaudited 500.
    logger.error("grantProComp failed", { error, userId });
    return { ok: false, reason: "stripe_error" };
  }
}

/**
 * Revoke a LOCAL comp only: cancel the user's subscription row IF it has no
 * `stripeSubscriptionId` (so a real paying subscription is never silently
 * killed). Owner-scoped by `userId` via `ownedBy` (required by the lint rule).
 */
export async function revokeProComp(userId: string): Promise<BillingResult> {
  if (!userId) return { ok: false, reason: "stripe_error" };
  try {
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
  } catch (error) {
    logger.error("revokeProComp failed", { error, userId });
    return { ok: false, reason: "stripe_error" };
  }
}
