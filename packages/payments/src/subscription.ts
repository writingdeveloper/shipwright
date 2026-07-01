import { db, ownedBy, subscription as subscriptionTable } from "@repo/db";

/**
 * @repo/payments — owner-scoped subscription reads.
 *
 * These mirror the per-user scoping the rest of the app uses (`task`): a read is
 * always keyed by `userId`, so one user can never observe another's billing
 * state. They are pure DB reads — no Stripe call — so they work identically
 * whether or not Stripe is configured (with no billing ever set up, there are
 * simply no rows and `isPro` is `false`).
 */

/** A user's subscription row, as stored locally (mirrors the Stripe state). */
export type SubscriptionRecord = typeof subscriptionTable.$inferSelect;

/** Stripe subscription statuses that grant active, paid access. */
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/**
 * Load a user's subscription row, or `null` if they have none. Owner-scoped: the
 * caller passes the AUTHENTICATED user's id (resolved server-side), so this only
 * ever returns that user's own row.
 */
export async function getSubscription(
  userId: string,
): Promise<SubscriptionRecord | null> {
  const [row] = await db
    .select()
    .from(subscriptionTable)
    .where(ownedBy(subscriptionTable, userId))
    .limit(1);

  return row ?? null;
}

/**
 * Whether an already-loaded subscription row grants active ("Pro") access —
 * the pure half of {@link isPro}, for callers that fetched the row once and
 * also need other fields (e.g. `stripeCustomerId` for the billing portal).
 *
 * True only when the row exists AND its status is one of the active statuses
 * (`active`/`trialing`) AND the current period has not lapsed.
 */
export function isActiveSubscription(
  sub: SubscriptionRecord | null,
): boolean {
  if (!sub || !sub.status || !ACTIVE_STATUSES.has(sub.status)) {
    return false;
  }
  // If we know the period end, require it to be in the future; if it is unknown
  // (null), fall back to the status alone.
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() < Date.now()) {
    return false;
  }
  return true;
}

/**
 * Whether a user currently has an active ("Pro") subscription. Defaults to
 * `false` for any user with no row — which is everyone when Stripe is
 * unconfigured, so the keyless app/tests/CI see a stable "free" dashboard.
 */
export async function isPro(userId: string): Promise<boolean> {
  return isActiveSubscription(await getSubscription(userId));
}
