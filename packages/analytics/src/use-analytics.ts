"use client";

import { useCallback } from "react";

import { useAnalyticsContext } from "./provider";

/**
 * @repo/analytics — the client capture hook.
 *
 * `capture(event, properties)` forwards to posthog ONLY when analytics is live
 * (key set, consent granted, SDK loaded — see the provider). Otherwise it is a
 * silent no-op, so feature code can call `capture(...)` unconditionally without
 * guarding on config or consent itself. `identify`/`reset` follow the same rule.
 *
 * Must be used under a {@link PostHogProvider}; with no provider (or a no-op
 * provider) `isReady` is `false` and every method does nothing.
 */
export function useAnalytics() {
  const { posthog, isReady } = useAnalyticsContext();

  const capture = useCallback(
    (event: string, properties?: Record<string, unknown>) => {
      // No-op unless posthog is actually initialised (key + consent).
      posthog?.capture(event, properties);
    },
    [posthog],
  );

  const identify = useCallback(
    (distinctId: string, properties?: Record<string, unknown>) => {
      posthog?.identify(distinctId, properties);
    },
    [posthog],
  );

  const reset = useCallback(() => {
    posthog?.reset();
  }, [posthog]);

  return {
    /** `true` only when posthog is initialised (key present + consent granted). */
    isReady,
    /** Capture an event. No-op when analytics is disabled or unconsented. */
    capture,
    /** Associate the current user. No-op when analytics is disabled. */
    identify,
    /** Reset identity (e.g. on sign-out). No-op when analytics is disabled. */
    reset,
  };
}
