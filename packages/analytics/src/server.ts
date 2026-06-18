import { PostHog } from "posthog-node";

import { analyticsHost, analyticsKey, isAnalyticsEnabled } from "./config";

/**
 * @repo/analytics — optional SERVER-SIDE event capture (posthog-node).
 *
 * For events you want to record from a Server Action / Route Handler rather than
 * the browser. Same graceful-degradation contract as the client side: with no
 * `NEXT_PUBLIC_POSTHOG_KEY` this is a no-op and posthog-node is never used.
 *
 * CONSENT NOTE: server capture is NOT automatically consent-gated (there is no
 * browser cookie on the server), so only call `captureServerEvent` for users who
 * have consented, or for strictly operational/non-personal events. The default
 * product-analytics path in this starter is the consent-gated CLIENT provider;
 * this helper is here for deliberate, owner-controlled server events.
 */

// Reuse one client per process. posthog-node batches and flushes in the
// background, so we construct it lazily and only when a key exists.
let nodeClient: PostHog | undefined;

function getClient(): PostHog | undefined {
  if (!isAnalyticsEnabled()) return undefined;
  const key = analyticsKey();
  if (!key) return undefined;
  if (!nodeClient) {
    nodeClient = new PostHog(key, { host: analyticsHost() });
  }
  return nodeClient;
}

/** Arguments for {@link captureServerEvent}. */
export type CaptureServerEventArgs = {
  /** Stable identifier for the user/actor the event belongs to. */
  readonly distinctId: string;
  /** Event name, e.g. `"user_signed_up"`. */
  readonly event: string;
  /** Optional event properties. */
  readonly properties?: Record<string, unknown>;
};

/**
 * Capture a server-side event. Returns `true` if it was enqueued, `false` if
 * analytics is disabled (the no-op path). Never throws.
 */
export function captureServerEvent(args: CaptureServerEventArgs): boolean {
  const client = getClient();
  if (!client) return false;
  client.capture({
    distinctId: args.distinctId,
    event: args.event,
    properties: args.properties,
  });
  return true;
}

/**
 * Flush any queued events and shut the client down. Call at the end of a
 * short-lived serverless invocation if you captured events, so they are not
 * lost. No-op when analytics is disabled.
 */
export async function shutdownServerAnalytics(): Promise<void> {
  if (nodeClient) {
    await nodeClient.shutdown();
    nodeClient = undefined;
  }
}
