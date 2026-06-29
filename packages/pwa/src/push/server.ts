import { db, schema, and, eq, inArray, ownedBy } from "@repo/db";

import { deliverPush, type PushPayload } from "./delivery";

/**
 * @repo/pwa — server-only push subscription store + sender. Server-only by
 * contract (imports the libSQL `db`): call from a Server Action / Route Handler,
 * never a client component. Mutations are owner-scoped (`userId`).
 */

/** Result of {@link sendPushToUser}: skipped when VAPID is unconfigured. */
export type SendPushResult =
  | { readonly skipped: true; readonly reason: string }
  | { readonly skipped: false; readonly sent: number; readonly pruned: number };

/** Fields needed to persist a browser subscription, owner-scoped. */
export type SaveSubscriptionArgs = {
  readonly userId: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
};

/**
 * Upsert a subscription by `endpoint` (re-subscribing the same browser updates
 * the keys + owner rather than duplicating).
 */
export async function saveSubscription(
  args: SaveSubscriptionArgs,
): Promise<void> {
  await db
    .insert(schema.pushSubscription)
    .values(args)
    .onConflictDoUpdate({
      target: schema.pushSubscription.endpoint,
      set: { userId: args.userId, p256dh: args.p256dh, auth: args.auth },
    });
}

/**
 * Delete a subscription by endpoint, scoped to its owner (called on client
 * unsubscribe). Owner-scoped so a guessed/leaked endpoint can't let one user
 * remove another's subscription (the DB cascade is not an authz boundary).
 */
export async function deleteSubscription(
  userId: string,
  endpoint: string,
): Promise<void> {
  await db
    .delete(schema.pushSubscription)
    .where(
      and(
        ownedBy(schema.pushSubscription, userId),
        eq(schema.pushSubscription.endpoint, endpoint),
      ),
    );
}

/** Load a user's subscriptions (owner-scoped read). */
export async function listSubscriptions(userId: string) {
  return db
    .select()
    .from(schema.pushSubscription)
    .where(ownedBy(schema.pushSubscription, userId));
}

/**
 * Send a notification to all of a user's subscriptions. No-ops with
 * `{ skipped: true }` when VAPID is unconfigured. Prunes any subscriptions the
 * push service reports as gone (404/410) in a single statement.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<SendPushResult> {
  const subs = await listSubscriptions(userId);

  const result = await deliverPush(
    subs.map((s) => ({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth })),
    payload,
  );

  if (!result.configured) {
    return { skipped: true, reason: result.reason };
  }

  if (result.deadEndpoints.length > 0) {
    await db
      .delete(schema.pushSubscription)
      .where(
        and(
          ownedBy(schema.pushSubscription, userId),
          inArray(schema.pushSubscription.endpoint, result.deadEndpoints),
        ),
      );
  }

  return {
    skipped: false,
    sent: result.sent,
    pruned: result.deadEndpoints.length,
  };
}
