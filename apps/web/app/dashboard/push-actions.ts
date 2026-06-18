"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@repo/auth/server";
import { logger } from "@repo/observability/logger";
import {
  deleteSubscription,
  saveSubscription,
  sendPushToUser,
} from "@repo/pwa/push/server";

/**
 * Push Server Actions for the dashboard. Auth is verified INSIDE each action
 * (repo rule). Subscriptions are owner-scoped via the resolved userId.
 */

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return session.user.id;
}

/** Persist a browser subscription (PushSubscription.toJSON()) for this user. */
export async function savePushSubscription(subscription: {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
}): Promise<void> {
  const userId = await requireUserId();
  const { endpoint, keys } = subscription;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    logger.warn("savePushSubscription: incomplete subscription", { userId });
    return;
  }
  await saveSubscription({
    userId,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  });
}

/** Remove a subscription by endpoint (on client unsubscribe). */
export async function removePushSubscription(endpoint: string): Promise<void> {
  await requireUserId();
  if (!endpoint) return;
  await deleteSubscription(endpoint);
}

/** Send a test notification to all of this user's subscriptions. */
export async function sendTestPush(): Promise<void> {
  const userId = await requireUserId();
  const result = await sendPushToUser(userId, {
    title: "Test notification",
    body: "Push notifications are working 🎉",
    url: "/dashboard",
    tag: "shipwright-test",
  });
  if (result.skipped) {
    logger.warn("sendTestPush: push not configured", { reason: result.reason });
  }
}
