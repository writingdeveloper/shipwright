"use server";

import { getTranslations } from "next-intl/server";
import { logger } from "@repo/observability/logger";
import {
  deleteSubscription,
  saveSubscription,
  sendPushToUser,
} from "@repo/pwa/push/server";

import { allowAction } from "../../../lib/action-limits";
import { requireUserId } from "../../../lib/auth-actions";

/**
 * Push Server Actions for the dashboard. Auth is verified INSIDE each action
 * (repo rule). Subscriptions are owner-scoped via the resolved userId, and each
 * action is per-user rate-limited (a blocked call is a logged no-op — these are
 * void actions, so that matches how incomplete input is handled).
 */

/** Persist a browser subscription (PushSubscription.toJSON()) for this user. */
export async function savePushSubscription(subscription: {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
}): Promise<void> {
  const userId = await requireUserId();
  if (!(await allowAction("push", userId))) return;
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

/** Remove a subscription by endpoint, scoped to the signed-in owner. */
export async function removePushSubscription(endpoint: string): Promise<void> {
  const userId = await requireUserId();
  if (!(await allowAction("push", userId))) return;
  if (!endpoint) return;
  await deleteSubscription(userId, endpoint);
}

/** Send a test notification to all of this user's subscriptions. */
export async function sendTestPush(): Promise<void> {
  const userId = await requireUserId();
  // The expensive one: each call fans out real network sends, one per saved
  // subscription — the main thing worth bounding.
  if (!(await allowAction("push", userId))) return;
  const t = await getTranslations("dashboard.notifications");
  const result = await sendPushToUser(userId, {
    title: t("testTitle"),
    body: t("testBody"),
    url: "/dashboard",
    tag: "shipwright-test",
  });
  if (result.skipped) {
    logger.warn("sendTestPush: push not configured", { reason: result.reason });
  }
}
