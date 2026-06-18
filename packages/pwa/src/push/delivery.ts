import webpush from "web-push";
import { env } from "@repo/env";
import { logger } from "@repo/observability/logger";

/**
 * @repo/pwa — server-side push delivery over the vetted `web-push` library
 * (VAPID). Server-only: reads the secret `VAPID_PRIVATE_KEY`. Split from
 * `./server` (DB I/O) so it is unit-testable with `web-push` mocked and no DB.
 *
 * GRACEFUL DEGRADATION: with no VAPID keypair this no-ops (warns once, returns
 * `{ configured: false }`) — never throws, never opens a connection — so the
 * app/tests/CI run with no push keys.
 */

/** A stored push subscription's transport fields (from the browser's PushSubscription). */
export type StoredSubscription = {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
};

/** The notification payload delivered to the service worker's `push` handler. */
export type PushPayload = {
  readonly title: string;
  readonly body?: string;
  /** URL focused/opened on notification click. */
  readonly url?: string;
  /** Collapse tag so repeats replace rather than stack. */
  readonly tag?: string;
};

/** Outcome of a delivery attempt. */
export type DeliveryResult =
  | { readonly configured: false; readonly reason: string }
  | {
      readonly configured: true;
      readonly sent: number;
      /** Endpoints that returned 404/410 (gone) — the caller should delete them. */
      readonly deadEndpoints: string[];
    };

// Configure web-push's VAPID details at most once per process, lazily, and only
// when a full keypair exists.
let vapidReady = false;
let warnedMissing = false;

function ensureVapid(): boolean {
  const privateKey = env.VAPID_PRIVATE_KEY;
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!privateKey || !publicKey) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn(
        "[@repo/pwa] VAPID keys are not set; skipping push send. Set " +
          "NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (npx web-push " +
          "generate-vapid-keys) to enable web push.",
      );
    }
    return false;
  }
  if (!vapidReady) {
    webpush.setVapidDetails(
      env.VAPID_SUBJECT ?? "mailto:admin@example.com",
      publicKey,
      privateKey,
    );
    vapidReady = true;
  }
  return true;
}

/**
 * Deliver `payload` to every `subscription`. Returns `{ configured: false }`
 * when VAPID is unset; otherwise sends to all in parallel, counting successes
 * and collecting endpoints that are gone (404/410) for the caller to prune. A
 * non-gone error is logged but does not fail the batch.
 */
export async function deliverPush(
  subscriptions: readonly StoredSubscription[],
  payload: PushPayload,
): Promise<DeliveryResult> {
  if (!ensureVapid()) {
    return { configured: false, reason: "VAPID keys are not set" };
  }

  const body = JSON.stringify(payload);
  const deadEndpoints: string[] = [];
  let sent = 0;

  await Promise.all(
    subscriptions.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription is gone (unsubscribed/expired) — mark for pruning.
          deadEndpoints.push(s.endpoint);
        } else {
          logger.error("pwa: push send failed", {
            endpoint: s.endpoint,
            statusCode,
            error,
          });
        }
      }
    }),
  );

  return { configured: true, sent, deadEndpoints };
}
